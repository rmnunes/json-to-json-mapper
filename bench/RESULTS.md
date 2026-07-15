# Benchmark baseline

Produced by `node bench/run.js` (build first: `pnpm run build`).

These numbers are the committed baseline that `bench/check.js` (M3) compares
against in CI with a generous tolerance — absolute values vary by machine;
the *ratios* between scenarios and regressions over time are what matter.

## Baseline — v2.2.0, Node v22, Linux x64 (CI-class container)

| scenario | ops/s |
|---|---:|
| map \| simple: 2 mappings x 100k objects | 411,904 |
| map \| wide: 50 mappings x 1k objects | 20,428 |
| map \| fan-out: 2 mappings x 10k-element array | 83 |

Regenerate with `pnpm run bench` after `pnpm run build`; update this table
(and note the machine) whenever an intentional performance change lands.
