# Benchmark baseline

Produced by `node bench/run.js` (build first: `pnpm run build`). The
machine-readable committed baseline lives in `bench/baseline.json`; the gate
(`pnpm run bench:check`, wired into CI) fails on a >25% per-scenario
regression (`BENCH_TOLERANCE`) and requires the compile/map ratio on the
wide scenario to stay ≥ 2.5× (`BENCH_MIN_WIDE_RATIO`) — the ratio check is
machine-independent and is the strongest signal.

## Baseline — v2.4.0, Node v22, Linux x64 (CI-class container)

| scenario | ops/s |
|---|---:|
| map \| simple: 2 mappings x 100k objects | 387,424 |
| compile \| simple: 2 mappings x 100k objects | 976,714 |
| map \| wide: 50 mappings x 1k objects | 21,930 |
| compile \| wide: 50 mappings x 1k objects | 73,183 |
| map \| fan-out: 2 mappings x 10k-element array | 86 |
| compile \| fan-out: 2 mappings x 10k-element array | 93 |

`compile()` reaches **3.1–3.3×** `map()` throughput on the wide scenario
(roadmap M3 target: ≥3×) and ~2.5× on the simple scenario; the fan-out
scenario is dominated by array traversal, which both share.

Regenerate with `node bench/check.js --update` after `pnpm run build`;
update this table (and note the machine) whenever an intentional
performance change lands.
