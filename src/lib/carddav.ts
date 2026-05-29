/**
 * CardDAV HTTP client.
 *
 * All HTTP calls go through @tauri-apps/plugin-http which routes them through
 * the Rust backend — CSP does not apply, and any CardDAV server URL works.
 *
 * Protocol reference: RFC 6352 (CardDAV), RFC 4918 (WebDAV).
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface CardDavListEntry {
  /** Absolute or server-relative href of the .vcf resource. */
  href: string;
  /** ETag without surrounding quotes. */
  etag: string;
}

export interface CardDavCard extends CardDavListEntry {
  vcard: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────

function basicAuth(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`);
}

/** Resolve a server-relative href against the base server origin. */
export function resolveHref(base: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  try {
    const origin = new URL(base).origin;
    return `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
  } catch {
    return href;
  }
}

// ── PROPFIND ──────────────────────────────────────────────────────────────

/**
 * PROPFIND on the collection URL with Depth:1. Returns all .vcf resource
 * hrefs + their current ETags — used to detect which cards need fetching.
 */
export async function cardDavListCollection(
  url: string,
  username: string,
  password: string,
): Promise<CardDavListEntry[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getetag/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

  const resp = await tauriFetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: basicAuth(username, password),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "1",
    },
    body,
  });

  if (resp.status !== 207 && !resp.ok) {
    throw new Error(`PROPFIND ${url} → HTTP ${resp.status}`);
  }

  const xml = await resp.text();
  return parsePropfindResponse(xml);
}

// ── GET ───────────────────────────────────────────────────────────────────

/** Fetch a single vCard resource. Returns the vCard text and its ETag. */
export async function cardDavGetCard(
  url: string,
  username: string,
  password: string,
): Promise<{ vcard: string; etag: string }> {
  const resp = await tauriFetch(url, {
    method: "GET",
    headers: { Authorization: basicAuth(username, password) },
  });

  if (!resp.ok) throw new Error(`GET ${url} → HTTP ${resp.status}`);
  const vcard = await resp.text();
  const etag = (resp.headers.get("ETag") ?? "").replace(/"/g, "");
  return { vcard, etag };
}

// ── PUT ───────────────────────────────────────────────────────────────────

/**
 * Create or update a vCard resource.
 * Pass `existingEtag` for safe updates (If-Match), omit for new resources.
 * Returns the server-assigned ETag for the stored card.
 */
export async function cardDavPutCard(
  url: string,
  username: string,
  password: string,
  vcard: string,
  existingEtag?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(username, password),
    "Content-Type": "text/vcard; charset=utf-8",
  };
  if (existingEtag) headers["If-Match"] = `"${existingEtag}"`;

  const resp = await tauriFetch(url, {
    method: "PUT",
    headers,
    body: vcard,
  });

  if (!resp.ok) throw new Error(`PUT ${url} → HTTP ${resp.status}`);
  return (resp.headers.get("ETag") ?? "").replace(/"/g, "");
}

// ── DELETE ────────────────────────────────────────────────────────────────

/** Delete a vCard resource. 404 is treated as success (already gone). */
export async function cardDavDeleteCard(
  url: string,
  username: string,
  password: string,
  existingEtag?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(username, password),
  };
  if (existingEtag) headers["If-Match"] = `"${existingEtag}"`;

  const resp = await tauriFetch(url, {
    method: "DELETE",
    headers,
  });

  if (!resp.ok && resp.status !== 404) {
    throw new Error(`DELETE ${url} → HTTP ${resp.status}`);
  }
}

// ── XML parsing ───────────────────────────────────────────────────────────

/**
 * Parse a WebDAV multistatus (207) response and extract href+etag pairs
 * for resources that look like vCard files (.vcf / .vcard).
 * Uses DOMParser with namespace-aware queries for maximum server compatibility.
 */
function parsePropfindResponse(xml: string): CardDavListEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const DAV = "DAV:";
  const entries: CardDavListEntry[] = [];

  // getElementsByTagNameNS("DAV:", "response") handles any namespace prefix.
  const responses = Array.from(doc.getElementsByTagNameNS(DAV, "response"));

  for (const resp of responses) {
    const href =
      resp.getElementsByTagNameNS(DAV, "href")[0]?.textContent?.trim() ?? "";

    // Skip the collection itself; only keep vCard resource entries.
    if (!href.endsWith(".vcf") && !href.endsWith(".vcard")) continue;

    const etag = (
      resp.getElementsByTagNameNS(DAV, "getetag")[0]?.textContent ?? ""
    ).replace(/"/g, "");

    entries.push({ href, etag });
  }

  return entries;
}
