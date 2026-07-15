# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## [2.2.0]

Roadmap M1 — path language completeness.

### Added

- **Array-form paths**: `source`/`target` (and each entry of `sources`)
  accept `string[]` as well as dotted strings, so keys containing dots are
  addressable. `\.` escapes a literal dot in string form (`\\` escapes a
  backslash). Malformed paths (empty path/segment) are reported in `errors`.
- **Multi-source mappings**: `sources: Path[]` collects values positionally
  and passes them to the (required) `transform`. Missing sources contribute
  `undefined`; `strict` errors only when all are missing and no `default`.
- **Conditional mappings**: `when(value, input)` — falsy skips the mapping
  silently (never an error, even in strict mode). Called per matched value
  for `source`, once with the values array for `sources`. Filters per
  element over array fan-outs.
- **Numeric target segments** write explicit array positions
  (`target: "coords.0"`); containers created on demand become arrays when
  the next segment is numeric or `$`. On pre-existing plain objects the
  segment falls back to an ordinary key.
- **Benchmark harness**: `pnpm run bench` (zero-dep) with committed baseline
  in `bench/RESULTS.md`.
- New exports: `parsePath`, `pathLabel`, and the `Path` type.

## [2.1.0]

### Added

- **ESM support**: dual ESM + CommonJS builds with conditional `exports`;
  `import` and `require` both work and get correctly-flavored type
  declarations.
- **Numeric source segments**: `order.1.id` picks a single array element
  deliberately instead of fanning out over the whole array.
- **`strict` option**: `map(input, mappings, { strict: true })` reports
  mappings whose source resolves to nothing (and that have no `default`) in
  `errors` instead of skipping silently.
- **`compactArrays` option**: removes holes from arrays in the result for
  callers that don't need position alignment; assigned `null`s are kept.
- Coverage script (`pnpm run test:coverage`) using Node's built-in coverage,
  and a dual-build smoke check (`pnpm run check:dist`) wired into CI and
  `prepublishOnly`.
- Contributor scaffolding: CONTRIBUTING.md, issue templates, Dependabot.

### Changed

- Publish workflow prepared for npm **trusted publishing** (OIDC) with
  provenance, replacing the long-lived token.
- Build output moved to `dist/cjs` and `dist/esm` (transparent to consumers —
  entry points are resolved via `main`/`exports`).

## [2.0.0]

A ground-up rewrite focused on correctness, safety, and honest docs.

### Breaking

- `map(input, mappings, options?)` is the new signature. The old required 4th
  `initial` argument is gone; use `map(input, mappings, { into })` to merge into
  an existing object.
- `skipped` is now `string[]` instead of `{ source: string }[]`.
- The `enum` mapping option is replaced by the more general `lookup`.
- Type casting now uses the `cast` option with `"string" | "number" | "boolean"`
  (the `String`/`Number`/`Boolean` constructors are also accepted). The
  previously undocumented/ignored `format` and `take` keys are removed
  (`take` is superseded by `first`).

### Fixed

- **Security:** target paths can no longer pollute the prototype chain —
  `__proto__`, `constructor`, and `prototype` segments are rejected.
- **Statelessness:** `map()` no longer leaks `result`, `skipped`, or `errors`
  between calls. It keeps no module-level state and does not mutate its inputs.
- Casting no longer silently returns `undefined` for unsupported types; the
  switch fall-through bug is gone and failures are reported in `errors`.
- Sparse / heterogeneous arrays (elements missing a mapped field) no longer
  crash; positions are preserved so multi-field mappings stay aligned.
- Writing two mappings to the same scalar target is now well-defined
  (last write wins) instead of silently dropping later writes.
- The documented quick-start call actually works.

### Added

- `transform` option for arbitrary per-value functions.
- `default` option for absent sources.
- `first` option to fold an array source into a scalar target.
- Full TypeScript declarations and a strict build.
- Zero-dependency test suite using Node's built-in `node:test` runner.
- Exposed helpers: `extract`, `setValue`, `leafPaths`, `isUnsafeKey`,
  `applyCast`, `applyLookup`.

### Changed

- Toolchain modernized: TypeScript 5, Node >= 18, pnpm, current GitHub Actions.
