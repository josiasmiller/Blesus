import React from "react";

/**
 * Renders a plain-text string, replacing country-flag regional-indicator
 * pairs (e.g. 🇺🇸, U+1F1E6–U+1F1FF pairs) with the bundled PNG <img>
 * elements stored under /flag-emojis/.  This makes flags visible on
 * Windows / WebView2 where no flag-capable emoji font is available.
 *
 * If the text contains no regional indicators the original string is
 * returned as-is (no allocation / no React elements created).
 */
export function renderWithFlags(text: string): React.ReactNode {
  // Quick bail-out — avoid regex work on strings without any regional chars
  if (!text || !/[\u{1F1E6}-\u{1F1FF}]/u.test(text)) return text;

  const parts: React.ReactNode[] = [];
  const re = /[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/gu;
  let last = 0;

  for (const m of text.matchAll(re)) {
    const idx = m.index!;
    if (idx > last) parts.push(text.slice(last, idx));

    const chars = m[0];
    // Each regional indicator is a surrogate pair (2 UTF-16 code units)
    const cp1 = chars.codePointAt(0)!.toString(16);
    const cp2 = chars.codePointAt(2)!.toString(16);
    const unified = `${cp1}-${cp2}`;

    parts.push(
      <img
        key={idx}
        src={`/flag-emojis/${unified}.png`}
        alt={chars}
        style={{
          width: "1.2em",
          height: "1.2em",
          verticalAlign: "-0.2em",
          display: "inline-block",
        }}
      />,
    );
    last = idx + chars.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
