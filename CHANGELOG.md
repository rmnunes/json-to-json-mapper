# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

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
