/**
 * Benchmark harness (zero dependencies — plain node).
 *
 * Usage:
 *   pnpm run build && node bench/run.js          # human-readable table
 *   node bench/run.js --json                     # machine-readable output
 *
 * Scenarios mirror ROADMAP.md M1: they are the fixed workloads that
 * bench/RESULTS.md baselines and (from M3 on) CI gates against.
 */
"use strict";

const path = require("path");
const lib = require(path.join(__dirname, "..", "dist", "cjs", "index.js"));

function makeOrder(i) {
  return {
    id: String(i),
    sku: `SKU-${i % 97}`,
    qty: (i % 7) + 1,
    price: { amount: `${(i % 90) + 10}.50`, currency: "EUR" },
  };
}

const SIMPLE_MAPPINGS = [
  { source: "id", target: "order.number", cast: "number" },
  { source: "price.amount", target: "order.total", cast: "number" },
];

const WIDE_MAPPINGS = [];
for (let i = 0; i < 50; i++) {
  WIDE_MAPPINGS.push({ source: `f${i}`, target: `out.g${i % 5}.f${i}` });
}

function makeWideObject() {
  const object = {};
  for (let i = 0; i < 50; i++) object[`f${i}`] = i;
  return object;
}

const FANOUT_INPUT = { items: Array.from({ length: 10_000 }, (_, i) => makeOrder(i)) };
const FANOUT_MAPPINGS = [
  { source: "items.id", target: "orders.$.id", cast: "number" },
  { source: "items.price.amount", target: "orders.$.total", cast: "number" },
];

const SCENARIOS = [
  {
    name: "simple: 2 mappings x 100k objects",
    iterations: 100_000,
    prepare: () => Array.from({ length: 100 }, (_, i) => makeOrder(i)),
    run: (lib_, pool, i) => lib_.map(pool[i % pool.length], SIMPLE_MAPPINGS),
  },
  {
    name: "wide: 50 mappings x 1k objects",
    iterations: 1_000,
    prepare: () => Array.from({ length: 50 }, makeWideObject),
    run: (lib_, pool, i) => lib_.map(pool[i % pool.length], WIDE_MAPPINGS),
  },
  {
    name: "fan-out: 2 mappings x 10k-element array",
    iterations: 20,
    prepare: () => FANOUT_INPUT,
    run: (lib_, input) => lib_.map(input, FANOUT_MAPPINGS),
  },
];

// From M3 on, `compile` variants run alongside `map` when the API exists.
const HAS_COMPILE = typeof lib.compile === "function";

function time(fn, iterations) {
  const WARMUP = Math.max(5, Math.floor(iterations / 10));
  for (let i = 0; i < WARMUP; i++) fn(i);
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsedNs = Number(process.hrtime.bigint() - start);
  return (iterations / elapsedNs) * 1e9; // ops per second
}

function main() {
  const results = [];
  for (const scenario of SCENARIOS) {
    const pool = scenario.prepare();
    const opsMap = time((i) => scenario.run(lib, pool, i), scenario.iterations);
    results.push({ name: `map | ${scenario.name}`, opsPerSec: Math.round(opsMap) });

    if (HAS_COMPILE) {
      const mappings =
        scenario.name.startsWith("simple") ? SIMPLE_MAPPINGS :
        scenario.name.startsWith("wide") ? WIDE_MAPPINGS : FANOUT_MAPPINGS;
      const compiled = lib.compile(mappings);
      const opsCompiled = time(
        (i) => compiled(Array.isArray(pool) ? pool[i % pool.length] : pool),
        scenario.iterations
      );
      results.push({ name: `compile | ${scenario.name}`, opsPerSec: Math.round(opsCompiled) });
    }
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ node: process.version, results }, null, 2));
  } else {
    console.log(`node ${process.version}\n`);
    for (const r of results) {
      console.log(`${r.name.padEnd(48)} ${r.opsPerSec.toLocaleString("en-US").padStart(12)} ops/s`);
    }
  }
  return results;
}

if (require.main === module) main();

module.exports = { main, SCENARIOS };
