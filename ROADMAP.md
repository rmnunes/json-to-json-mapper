# Roadmap

> **Vision:** the standard library for declarative JSON→JSON mapping in the
> JavaScript ecosystem — typed, safe by default, zero runtime dependencies,
> and serializable enough that mappings can live in config files or a
> database, not just in code.

## Positioning (why this library should exist)

| | json-to-json-mapper | object-mapper / morphism | JSONata / JMESPath |
|---|---|---|---|
| Maintained | ✅ | ❌ dormant | ✅ |
| Mapping style | typed JS/JSON objects | JS objects | string expression language |
| TypeScript-checked mappings | ✅ | partial / none | ❌ (opaque strings) |
| Prototype-pollution safe by default | ✅ tested | ❌ (category has CVE history) | n/a |
| Statically validatable before running | ✅ (goal: `validateMappings`) | ❌ | ❌ (parse ≠ validate) |
| Zero runtime dependencies | ✅ | ✅ | ✅ |
| Learning curve | one function, one options object | low | a whole language |

The niche "declarative source→target mapping with dot paths" is served today
by unmaintained packages; the maintained alternatives are query *languages*.
We win by being the boring, safe, typed option that a team can adopt in five
minutes and validate in CI.

## Invariants (every change must preserve these)

1. **Zero runtime dependencies.** Dev dependencies are fine; `dependencies`
   stays empty forever. A PR that adds one is rejected by definition.
2. **`map()` is pure.** No module state, no input mutation, safe for
   concurrent use. Regression tests exist and must keep passing.
3. **Per-mapping problems never throw.** They are collected in `errors`;
   a partial result is always returned. Throwing is reserved for caller bugs
   (wrong argument types).
4. **Prototype-pollution safety.** All target writes go through `setValue`,
   which rejects `__proto__` / `constructor` / `prototype`. Security tests
   must keep passing.
5. **Dual ESM + CJS builds** with correct types for each, smoke-tested by
   `check:dist` before anything reaches the registry.
6. **Backward compatibility within a major.** New capabilities are new
   optional mapping keys or map-level options. Behavior changes to existing
   keys require a major bump and a CHANGELOG migration section.
7. **Coverage floor:** ≥ 97% lines, ≥ 92% branches (`pnpm run test:coverage`).
   New features land with tests; bug fixes land with regression tests.

## How to work this roadmap (instructions for Claude Code sessions)

- Work milestones **in order**; within a milestone, items are independent
  unless noted. Pick the first unchecked item.
- For each item: write tests first from the acceptance criteria, implement,
  update README + CHANGELOG, tick the checkbox here, and include everything
  in one PR per milestone (or per item if large).
- Definition of done for every item: acceptance criteria demonstrably met,
  `pnpm run typecheck && pnpm run build && pnpm test && pnpm run check:dist`
  green, README examples for the feature actually executed against the built
  `dist` at least once.
- Versioning: each completed milestone ships as the minor version noted in
  its heading. Update `package.json`, `CHANGELOG.md`, and (after merge)
  create the GitHub release `vX.Y.0` targeting `main`.
- Do not start a milestone marked **[blocked: maintainer]** — those need a
  human action first.

---

## M1 — Path language completeness (v2.2.0)

The gaps every real-world user hits in week one.

- [ ] **Array-form paths** — `source` and `target` accept `string[]` as well
  as the dotted string, so keys that *contain* dots are addressable.
  - `map({ "a.b": { c: 1 } }, [{ source: ["a.b", "c"], target: "out" }])`
    → `{ out: 1 }`.
  - Array-form segments are taken literally: no `$`/index interpretation in
    source; in target, `$` and numeric segments keep their meaning so the
    two forms stay equivalent otherwise.
  - Dotted-string form remains 100% backward compatible.
- [ ] **Escaped dots in string paths** — `"a\\.b.c"` addresses key `a.b`.
  Escaping is sugar that parses to the array form; document that array form
  is the canonical representation.
- [ ] **Multi-source mappings** — `sources: string[]` (mutually exclusive
  with `source`) collects values positionally and requires `transform`.
  - `{ sources: ["first", "last"], target: "fullName", transform: (vals) => vals.join(" ") }`.
  - Missing individual sources yield `undefined` in the array; `strict`
    reports only if *all* sources are missing and no `default` exists.
- [ ] **Conditional mappings** — optional `when(value, input): boolean`;
  a falsy return skips the mapping (not an error, even in strict mode).
- [ ] **Target array indices** — numeric segments in target paths write to
  explicit positions: `target: "coords.0"` / `"coords.1"`.
- [ ] **Bench harness (baseline)** — `pnpm run bench` (plain `node`, no dep,
  or `tinybench` as devDep) covering: 1 mapping × 100k objects, 50 mappings
  × 1k objects, array fan-out 10k elements. Prints ops/sec; commits a
  `bench/RESULTS.md` baseline. Not a CI gate yet — the baseline is the
  deliverable.

## M2 — Config-first: serializable mappings (v2.3.0)

The differentiating milestone: mappings as data, not code — usable from a
config file or database row, validatable in CI before deploy.

- [ ] **Named transforms/casts registry** — `map(input, mappings, { registry })`
  where mapping keys accept string references: `transform: "trim"`,
  `lookup: "countryCodes"`. Built-in registry ships `trim`, `upper`,
  `lower`, `toISODate`. Function values keep working (registry is additive).
- [ ] **`validateMappings(mappings, opts?)`** — returns structured issues
  (not throws): unknown mapping keys, `source`+`sources` conflicts, unsafe
  target segments, unknown registry references, malformed paths. Zero
  issues ⇒ the mapping definition is safe to persist.
- [ ] **Stable error codes** — every `MappingError` gains a `code`
  (`SOURCE_MISSING`, `CAST_FAILED`, `LOOKUP_MISS`, `TARGET_CONFLICT`,
  `UNSAFE_TARGET`, `TRANSFORM_FAILED`, `INVALID_MAPPING`). Codes are public
  API: documented in README, covered by tests, never renamed within a major.
- [ ] **JSON Schema for mapping definitions** — published at
  `schema/mapping.schema.json` and shipped in the npm package, so editors
  and CI can validate stored mapping files. Kept in sync by a test that
  validates every README example against the schema.

## M3 — Performance & hardening (v2.4.0)

- [ ] **`compile(mappings, opts?)`** — returns a reusable
  `(input) => MapResult` with paths parsed once. `map()` becomes
  `compile()(input)` internally; benchmark target: ≥ 3× `map()` throughput
  on the 50-mappings × 1k-objects bench.
- [ ] **Property-based tests** — `fast-check` as devDependency: round-trip
  and no-throw invariants over arbitrary JSON, pollution attempts against
  arbitrary key names, `compactArrays` idempotence.
- [ ] **Bench regression gate in CI** — bench job compares against
  `bench/RESULTS.md` baseline; fails on >25% regression (generous to absorb
  runner noise).
- [ ] **Fuzz the path parser** — arbitrary strings into source/target must
  never throw uncaught or write outside the result object.

## M4 — Documentation & adoption (v2.5.0)

- [ ] **README overhaul** — badges (npm version, downloads, CI, provenance),
  the positioning table from this roadmap, a 60-second quick start, and a
  cookbook section (rename, flatten, enum-decode, array reshape, config-file
  mapping) where every snippet is executed by a doc-test in CI.
- [ ] **Doc-tests** — a test that extracts fenced `ts`/`js` blocks from
  README and runs them against the built dist. README can no longer lie
  (how this project originally went wrong).
- [ ] **`examples/` directory** — three runnable real-world examples:
  API-response reshaping, DB-row → DTO with lookups, mapping definitions
  loaded from a JSON file and validated with `validateMappings`.
- [ ] **GitHub Pages docs site** — generated from README + API reference
  (typedoc as devDep), published by a `docs.yml` workflow on release.
- [ ] **Repo metadata** — GitHub topics (`json`, `mapping`, `transform`,
  `zero-dependency`, `typescript`, `etl`), repo description, social preview.

## M5 — Reach (v3 horizon, exploratory)

Items here need a design discussion in an issue before implementation.

- [ ] **Wildcard sources** — `items.*.id` (single level). Decide semantics
  vs. the existing implicit array fan-out before coding.
- [ ] **CLI** — `npx json-to-json-mapper --map mappings.json input.json`;
  zero-dep (node built-ins only); makes the library usable in shell
  pipelines and CI jobs.
- [ ] **Reverse mappings** — `invert(mappings)` for bijective subsets;
  errors list the non-invertible mappings.
- [ ] **Streaming mode** — map NDJSON / large arrays without holding the
  full output in memory. Only if real demand appears (issue votes).

## Process (ongoing)

- [ ] **Release automation** — release-please (or changesets) so merges to
  `main` with conventional commits produce the version bump, CHANGELOG,
  tag, and GitHub release automatically — which then triggers the
  trusted-publishing workflow. Zero manual release steps.
- [ ] **[blocked: maintainer]** Trusted Publisher entry on npmjs.com
  (GitHub Actions / `rmnunes/json-to-json-mapper` / `npm-publish.yml` /
  environment empty), then delete all npm tokens.
- [ ] **[blocked: maintainer]** Branch protection on `main` requiring the
  `build` matrix.
- [ ] **Issue hygiene** — label roadmap items `roadmap`, mark self-contained
  ones `good-first-issue`, link each milestone to a GitHub milestone.

## What "incredible" means (measurable, not vibes)

- Every README example is executed in CI (M4 doc-tests) — the docs cannot
  drift from the code again.
- Coverage never drops below the floor in Invariants; property tests guard
  the safety claims.
- `validateMappings` + JSON Schema make this the only mapper whose
  definitions can be linted in CI before they ever run — that's the wedge
  vs. both the dead mappers and the query languages.
- Benchmarks are published and gated — "fast" is a number in the repo, not
  a marketing adjective.
- npm provenance on every release; no long-lived secrets anywhere in the
  pipeline.
