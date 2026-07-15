/**
 * Benchmark regression gate (M3).
 *
 * Compares a fresh run against the committed bench/baseline.json:
 *   - each scenario must reach baseline * (1 - BENCH_TOLERANCE);
 *   - the compile/map ratio on the wide scenario must stay >= MIN_RATIO —
 *     this check is machine-independent and is the strongest signal.
 *
 * BENCH_TOLERANCE defaults to 0.25 (fail on >25% regression) per ROADMAP.md.
 * CI machines differ from where the baseline was recorded, so CI may pass a
 * looser tolerance; the ratio check keeps its teeth everywhere.
 *
 * Usage:
 *   node bench/check.js            # gate against baseline
 *   node bench/check.js --update   # rewrite baseline.json from this machine
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { main } = require("./run.js");

const BASELINE_PATH = path.join(__dirname, "baseline.json");
const TOLERANCE = Number(process.env.BENCH_TOLERANCE ?? "0.25");
const MIN_WIDE_RATIO = Number(process.env.BENCH_MIN_WIDE_RATIO ?? "2.5");

const results = main();

if (process.argv.includes("--update")) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ node: process.version, results }, null, 2) + "\n"
  );
  console.log(`\nbaseline.json updated (${results.length} scenarios)`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
let failed = false;

console.log(`\nGate: >= ${((1 - TOLERANCE) * 100).toFixed(0)}% of baseline per scenario\n`);
for (const entry of baseline.results) {
  const current = results.find((r) => r.name === entry.name);
  if (!current) {
    console.error(`MISSING  ${entry.name} (scenario disappeared)`);
    failed = true;
    continue;
  }
  const floor = entry.opsPerSec * (1 - TOLERANCE);
  const verdict = current.opsPerSec >= floor ? "ok " : "FAIL";
  if (verdict === "FAIL") failed = true;
  console.log(
    `${verdict}  ${entry.name.padEnd(48)} ${current.opsPerSec.toLocaleString("en-US").padStart(12)}` +
      ` (baseline ${entry.opsPerSec.toLocaleString("en-US")}, floor ${Math.round(floor).toLocaleString("en-US")})`
  );
}

const mapWide = results.find((r) => r.name.startsWith("map | wide"));
const compileWide = results.find((r) => r.name.startsWith("compile | wide"));
if (mapWide && compileWide) {
  const ratio = compileWide.opsPerSec / mapWide.opsPerSec;
  const ok = ratio >= MIN_WIDE_RATIO;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok " : "FAIL"}  compile/map ratio on wide scenario: ${ratio.toFixed(2)}x (min ${MIN_WIDE_RATIO}x)`
  );
} else {
  console.error("MISSING  wide scenarios for ratio check");
  failed = true;
}

if (failed) {
  console.error("\nBenchmark gate FAILED");
  process.exit(1);
}
console.log("\nBenchmark gate passed");
