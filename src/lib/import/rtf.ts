// Plain text from RTF: ProPresenter and EasyWorship keep slide words as RTF. Only the words are
// kept: paragraphs and line breaks become new lines; fonts, colours and formatting are dropped.

const SKIP_DESTINATIONS = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "listtable", "listoverridetable", "rsidtbl", "generator", "expandedcolortbl", "latentstyles", "themedata", "datastore", "xmlnstbl"]);

const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
  0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

export function rtfToText(rtf: string): string {
  if (!rtf.trimStart().startsWith("{\\rtf")) return rtf;
  let out = "";
  // Each group remembers whether its text is skipped and how many characters follow a \uN.
  const stack: Array<{ skip: boolean; uc: number }> = [];
  let skip = false;
  let uc = 1;
  let pendingSkip = 0;
  let i = 0;
  const emit = (text: string) => {
    if (skip) return;
    if (pendingSkip > 0) {
      pendingSkip -= 1;
      return;
    }
    out += text;
  };
  while (i < rtf.length) {
    const char = rtf[i]!;
    if (char === "{") {
      stack.push({ skip, uc });
      i += 1;
      continue;
    }
    if (char === "}") {
      const top = stack.pop();
      if (top) ({ skip, uc } = top);
      i += 1;
      continue;
    }
    if (char === "\\") {
      const next = rtf[i + 1] ?? "";
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16);
        if (Number.isFinite(code)) emit(CP1252[code] ?? String.fromCharCode(code));
        i += 4;
        continue;
      }
      if (next === "*") {
        // An optional destination this reader does not know: skip the whole group.
        skip = true;
        i += 2;
        continue;
      }
      if (next === "\n" || next === "\r") {
        emit("\n");
        i += 2;
        continue;
      }
      if (next === "~") {
        emit(" ");
        i += 2;
        continue;
      }
      if (next === "-" || next === "_") {
        i += 2;
        continue;
      }
      const match = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!match) {
        i += 1;
        continue;
      }
      const [whole, word, arg] = match;
      i += whole.length;
      if (SKIP_DESTINATIONS.has(word!)) skip = true;
      else if (word === "par" || word === "line" || word === "sect" || word === "row") emit("\n");
      else if (word === "tab" || word === "cell") emit(" ");
      else if (word === "emdash") emit("—");
      else if (word === "endash") emit("–");
      else if (word === "lquote") emit("‘");
      else if (word === "rquote") emit("’");
      else if (word === "ldblquote") emit("“");
      else if (word === "rdblquote") emit("”");
      else if (word === "bullet") emit("•");
      else if (word === "uc") uc = Number(arg ?? 1);
      else if (word === "u") {
        let code = Number(arg ?? 0);
        if (code < 0) code += 65536;
        emit(String.fromCharCode(code));
        pendingSkip = uc;
      }
      continue;
    }
    if (char === "\r" || char === "\n") {
      i += 1;
      continue;
    }
    emit(char);
    i += 1;
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}
