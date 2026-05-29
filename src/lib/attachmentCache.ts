/**
 * In-memory LRU cache for raw attachment base-64 data.
 *
 * Key format: `${accountId}:${folderPath}:${uid}:${index}`
 *
 * Keeps the last MAX_ENTRIES entries in memory so repeated opens/hovers of the
 * same attachment never hit the IMAP server again within a session.
 */

import { ipc, type ImapConfig } from "@/lib/ipc";
import { getAccount, getAccountSecrets } from "@/lib/db";

const MAX_ENTRIES = 100;

// Ordered map — insertion order = LRU order (oldest first)
const _cache = new Map<string, string>();

function cacheKey(accountId: number, folderPath: string, uid: number, index: number): string {
  return `${accountId}:${folderPath}:${uid}:${index}`;
}

function put(key: string, value: string) {
  if (_cache.has(key)) _cache.delete(key); // refresh position
  _cache.set(key, value);
  if (_cache.size > MAX_ENTRIES) {
    // Evict the oldest entry (first key in insertion order)
    _cache.delete(_cache.keys().next().value!);
  }
}

/** Returns cached b64 or undefined (does not fetch). */
export function getCached(
  accountId: number,
  folderPath: string,
  uid: number,
  index: number,
): string | undefined {
  const key = cacheKey(accountId, folderPath, uid, index);
  const value = _cache.get(key);
  if (value !== undefined) {
    // Refresh LRU position
    _cache.delete(key);
    _cache.set(key, value);
  }
  return value;
}

/** Builds an IMAP config object from the stored account + secrets. */
async function buildConfig(accountId: number): Promise<ImapConfig> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  const secrets = await getAccountSecrets(accountId);
  return {
    host: account.imap_host,
    port: account.imap_port,
    username: account.imap_username ?? account.email,
    password: secrets.imapPassword,
    security: account.imap_security,
  };
}

/**
 * Returns the base-64 data for the attachment, hitting the cache first.
 * On a cache miss the data is fetched via IMAP and stored for future calls.
 */
export async function loadAttachmentB64(
  accountId: number,
  folderPath: string,
  uid: number,
  index: number,
): Promise<string> {
  const key = cacheKey(accountId, folderPath, uid, index);
  const cached = _cache.get(key);
  if (cached !== undefined) {
    // Refresh LRU position
    _cache.delete(key);
    _cache.set(key, cached);
    return cached;
  }
  const cfg = await buildConfig(accountId);
  const b64 = await ipc.imapLoadAttachmentB64(cfg, folderPath, uid, index);
  put(key, b64);
  return b64;
}

/** Pre-warm the cache for a list of (accountId, folderPath, uid, index) tuples concurrently. */
export async function prefetchAttachments(
  accountId: number,
  folderPath: string,
  uid: number,
  indices: number[],
  concurrency = 3,
): Promise<void> {
  const needed = indices.filter(
    (i) => !_cache.has(cacheKey(accountId, folderPath, uid, i)),
  );
  if (needed.length === 0) return;

  let cfg: ImapConfig | null = null;
  const getConfig = async () => {
    if (!cfg) cfg = await buildConfig(accountId);
    return cfg;
  };

  // Process in batches of `concurrency`
  for (let i = 0; i < needed.length; i += concurrency) {
    const batch = needed.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (idx) => {
        const key = cacheKey(accountId, folderPath, uid, idx);
        if (_cache.has(key)) return; // already fetched by a parallel batch
        try {
          const c = await getConfig();
          const b64 = await ipc.imapLoadAttachmentB64(c, folderPath, uid, idx);
          put(key, b64);
        } catch {
          // Non-fatal — item just won't be pre-warmed
        }
      }),
    );
  }
}
