// Tidy verse text from the bundled public-domain sources. Some files were exported with
// spaces around punctuation ("the LORD ."), split contractions ("didn’ t"), spaced quotes
// (" Has God") and a footnote left in the text ("God " (Elohim). created"). The same rules
// clean the bundled files and every verse as it is read, so older installs are fixed too.

export function cleanVerse(text: string): string {
  let out = text;
  // A footnote that leaked into the WEB text.
  out = out.replace(/\s*"\s*\(Elohim\)\.(?=\s|$)/g, "");
  // Empty-verse placeholder (BBE leaves some verses out).
  if (/^\s*\[\]\s*$/.test(out)) return "";
  // Contractions and possessives: "didn’ t" → "didn’t", "God ’s" → "God’s", "sons ’ wives" → "sons’ wives".
  out = out.replace(/(\w)([’'])\s+(t|s|ll|re|ve|d|m)\b/g, "$1$2$3");
  out = out.replace(/(\w)\s+([’'])s\b/g, "$1$2s");
  out = out.replace(/(\w)s\s+([’'])(?=\s)/g, "$1s$2");
  // No space before closing punctuation, none inside parentheses.
  out = out.replace(/\s+([,.;:!?)])/g, "$1");
  out = out.replace(/\(\s+/g, "(");
  // Quotes: an opening quote hugs the next word; a closing quote hugs the punctuation before it.
  // Opening first: `woman, " Has` is an opening quote even though punctuation comes before it.
  out = out.replace(/(^|[\s(—])(["“‘])\s+(?=\w)/g, "$1$2");
  out = out.replace(/([,.;:!?—])\s+(["”’])(?=\s|$|[,.;:!?)"”’])/g, "$1$2");
  return out.replace(/\s{2,}/g, " ").trim();
}
