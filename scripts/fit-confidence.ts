// Fits the listening confidence model (src/lib/voice/confidence.ts) to the corpus of real things said
// in church (src/lib/voice/confidence-corpus.ts): every line through the detector, then one small
// logistic model per way a verse is found. Prints how the detector does and the fitted weights.
//   npx vite-node scripts/fit-confidence.ts            (report and weights)
//   npx vite-node scripts/fit-confidence.ts --list     (every line, found and expected)

import { bundledQuoteCatalog } from "../src/lib/bible/texts";
import { buildQuoteIndex, chooseHeard } from "../src/lib/voice/detect";
import { CORPUS } from "../src/lib/voice/confidence-corpus";
import { featuresOf, type Via } from "../src/lib/voice/confidence";

const index = buildQuoteIndex([...(await bundledQuoteCatalog("kjv")), ...(await bundledQuoteCatalog("web")), ...(await bundledQuoteCatalog("bsb"))]);
const list = process.argv.includes("--list");

type Row = { via: Via; x: number[]; y: number; said: string; found: string; means: string | null; phrases: string[]; match: NonNullable<ReturnType<typeof chooseHeard>> };
const rows: Row[] = [];
let missed = 0;
let quietRight = 0;
for (const line of CORPUS) {
  const phrases = line.alternatives ?? [line.said];
  const match = chooseHeard(phrases, index, "kjv");
  const found = match?.item.reference ?? null;
  if (list) console.log(`${found === line.means ? "ok " : "BAD"} ${JSON.stringify(line.said).padEnd(70)} found ${found ?? "-"}  means ${line.means ?? "-"}  ${match?.evidence ? JSON.stringify(match.evidence) : ""}`);
  if (!match) {
    if (line.means) missed += 1;
    else quietRight += 1;
    continue;
  }
  const features = featuresOf(match);
  if (!features) continue;
  rows.push({ via: features.via, x: features.x, y: found === line.means ? 1 : 0, said: line.said, found: found!, means: line.means, phrases, match });
}

const right = rows.filter((row) => row.y === 1).length;
console.log(`\n${CORPUS.length} lines: ${right} found right, ${rows.length - right} found wrong, ${missed} missed, ${quietRight} rightly quiet`);

// Plain logistic regression by gradient descent, with a little L2 so a small corpus does not run away.
function fit(data: Row[], size: number): number[] {
  const w = new Array(size + 1).fill(0);
  const rate = 0.1;
  for (let step = 0; step < 20000; step += 1) {
    const grad = new Array(size + 1).fill(0);
    for (const row of data) {
      const z = w[0] + row.x.reduce((total, value, i) => total + value * w[i + 1], 0);
      const p = 1 / (1 + Math.exp(-z));
      const error = p - row.y;
      grad[0] += error;
      row.x.forEach((value, i) => (grad[i + 1] += error * value));
    }
    for (let i = 0; i <= size; i += 1) w[i] -= (rate * (grad[i] + (i ? 0.05 * w[i] : 0))) / Math.max(1, data.length);
  }
  return w.map((value) => Math.round(value * 100) / 100);
}

for (const via of ["citation", "phrase", "quote"] as Via[]) {
  const data = rows.filter((row) => row.via === via);
  if (!data.length) continue;
  const wrong = data.filter((row) => !row.y);
  console.log(`\n${via}: ${data.length} found, ${wrong.length} wrong${wrong.length ? `: ${wrong.map((row) => `"${row.said}" -> ${row.found}`).join("; ")}` : ""}`);
  console.log(`  weights [bias, ...features]: ${JSON.stringify(fit(data, data[0]!.x.length))}`);
}

// How the tiers come out with the weights now in confidence.ts: "sure" must hold no wrong find.
const { rateMatch } = await import("../src/lib/voice/confidence");
const tiers: Record<string, { right: number; wrong: string[] }> = { sure: { right: 0, wrong: [] }, likely: { right: 0, wrong: [] }, maybe: { right: 0, wrong: [] } };
for (const row of rows) {
  const rated = rateMatch(row.match, { phrases: row.phrases, index });
  if (row.y) tiers[rated.tier]!.right += 1;
  else tiers[rated.tier]!.wrong.push(`"${row.said}" (${rated.p.toFixed(2)})`);
  if (list) console.log(`${rated.tier.padEnd(6)} ${rated.p.toFixed(2)} ${row.y ? "right" : "WRONG"} ${row.said}`);
}
console.log("\nWith the weights in confidence.ts:");
for (const [tier, count] of Object.entries(tiers)) console.log(`  ${tier.padEnd(6)} ${count.right} right, ${count.wrong.length} wrong${count.wrong.length ? `: ${count.wrong.join("; ")}` : ""}`);
