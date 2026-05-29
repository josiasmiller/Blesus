/**
 * VCard 3.0 / 4.0 parser and generator.
 * Handles RFC 6350 line folding and common property encodings.
 */

export interface VCardContact {
  uid: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  emails: string[];
  phones: string[];
  notes: string | null;
}

// ── Parser ────────────────────────────────────────────────────────────────

/** Unfold continuation lines per RFC 6350 §3.2 (CRLF + whitespace). */
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** Extract the text value of the first matching property (ignoring params). */
function getProp(lines: string[], name: string): string | null {
  const upper = name.toUpperCase();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).split(";")[0]!.toUpperCase().trim();
    if (key === upper) return line.slice(colon + 1);
  }
  return null;
}

/** Extract all values for a property (e.g. multiple EMAIL lines). */
function getAllProps(lines: string[], name: string): string[] {
  const upper = name.toUpperCase();
  const out: string[] = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).split(";")[0]!.toUpperCase().trim();
    if (key === upper) out.push(line.slice(colon + 1));
  }
  return out;
}

/**
 * Parse a VCF file that may contain one or more vCards.
 * Returns only cards that have at least an email or a full name.
 */
export function parseVCards(vcfContent: string): VCardContact[] {
  const contacts: VCardContact[] = [];
  const unfolded = unfold(vcfContent);

  // Split on BEGIN:VCARD; the first segment (before any card) is discarded.
  const blocks = unfolded.split(/BEGIN:VCARD/i);
  for (const block of blocks) {
    if (!block.toUpperCase().includes("END:VCARD")) continue;
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const fn_ = getProp(lines, "FN") ?? "";
    const n = getProp(lines, "N") ?? "";
    // N field: Family;Given;Additional;Prefix;Suffix
    const nParts = n.split(";");
    const lastName = nParts[0]?.trim() || null;
    const firstName = nParts[1]?.trim() || null;
    const uid = getProp(lines, "UID") ?? crypto.randomUUID();
    const emails = getAllProps(lines, "EMAIL")
      .map((e) => e.trim())
      .filter(Boolean);
    const phones = getAllProps(lines, "TEL")
      .map((t) => t.trim())
      .filter(Boolean);
    const rawNotes = getProp(lines, "NOTE");
    const notes = rawNotes ? rawNotes.replace(/\\n/g, "\n").replace(/\\,/g, ",") : null;

    if (!fn_ && emails.length === 0) continue;

    contacts.push({
      uid,
      fullName: fn_ || emails[0] || "",
      firstName,
      lastName,
      emails,
      phones,
      notes,
    });
  }

  return contacts;
}

// ── Generator ─────────────────────────────────────────────────────────────

export interface VCardInput {
  uid: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
}

/** Generate a single VCard 3.0 string for one contact. */
export function generateVCard(c: VCardInput): string {
  const fn_ = c.fullName.trim() || c.email;
  const n = `${c.lastName ?? ""};${c.firstName ?? ""};;;`;
  const rev = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .slice(0, 15)
    .concat("Z");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${fn_}`,
    `N:${n}`,
    `EMAIL:${c.email}`,
    `UID:${c.uid}`,
    `REV:${rev}`,
  ];
  if (c.phone?.trim()) lines.push(`TEL:${c.phone.trim()}`);
  if (c.notes?.trim())
    lines.push(`NOTE:${c.notes.trim().replace(/\n/g, "\\n").replace(/,/g, "\\,")}`);
  lines.push("END:VCARD");

  return lines.join("\r\n");
}

/** Generate a VCF file string containing multiple vCards. */
export function generateVCardFile(contacts: VCardInput[]): string {
  return contacts.map(generateVCard).join("\r\n");
}
