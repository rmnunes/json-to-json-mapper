[![build](https://github.com/rmnunes/json-to-json-mapper/actions/workflows/node.js.yml/badge.svg)](https://github.com/rmnunes/json-to-json-mapper/actions/workflows/node.js.yml)
[![npm](https://img.shields.io/npm/v/json-to-json-mapper.svg)](https://www.npmjs.com/package/json-to-json-mapper)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

# json-to-json-mapper

Remap one JSON shape into another from a small, declarative list of
`{ source, target }` rules — with optional type casting, lookup tables,
array handling, and per-mapping error reporting.

- **Zero runtime dependencies.**
- **Pure & stateless** — `map()` never mutates its inputs and keeps no state
  between calls, so it is safe to reuse and call concurrently.
- **Safe by default** — target paths that would pollute the prototype chain
  (`__proto__`, `constructor`, `prototype`) are rejected.
- **Typed** — ships with TypeScript declarations.
- **ESM and CommonJS** — dual builds selected automatically by `import` /
  `require`.

Where this project is headed: see the [ROADMAP](./ROADMAP.md).

## Install

```bash
pnpm add json-to-json-mapper
# or: npm install json-to-json-mapper
```

## Quick start

```ts
import { map } from "json-to-json-mapper";
// or: const { map } = require("json-to-json-mapper");

const input = {
  request: { order: { id: "1" } },
};

const { result, skipped, errors } = map(input, [
  { source: "request.order.id", target: "app.ordering.number", cast: "number" },
]);

// result  => { app: { ordering: { number: 1 } } }
// skipped => []      (input leaves that no mapping consumed)
// errors  => []      (per-mapping problems, never thrown)
```

`map(input, mappings, options?)` returns `{ result, skipped, errors }` and never
throws for a per-mapping problem — failures are collected in `errors` so a
partial `result` is always available. (It only throws if `mappings` itself is
not an array.)

## Mapping options

| Field       | Type                                   | Description                                                                 |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `source`    | `string \| string[]`                   | Path into the input, e.g. `request.order.id`. Arrays are traversed. Exactly one of `source`/`sources`. |
| `sources`   | `(string \| string[])[]`               | Multiple input paths, collected positionally into an array for `transform` (required with `sources`). |
| `target`    | `string \| string[]` (required)        | Path into the output. `$` denotes an array level; numeric segments write explicit positions. |
| `cast`      | `"string" \| "number" \| "boolean"`    | Coerce the value's type. The `String`/`Number`/`Boolean` constructors work too. |
| `lookup`    | `Record<string \| number, unknown>`    | Substitute the value via a table or a TypeScript `enum`. Not supported with `sources`. |
| `transform` | `(value) => unknown`                   | Arbitrary transform, applied last. With `sources` it receives the values array. |
| `default`   | `unknown`                              | Value to use when the source(s) resolve to nothing.                         |
| `first`     | `boolean`                              | Keep only the first matched value (for a scalar target fed by an array).    |
| `when`      | `(value, input) => boolean`            | Apply the mapping only when truthy. Called per matched value (raw, pre-transform); with `sources`, once with the values array. A falsy return skips silently, even in `strict` mode. |

Order of application per value: **lookup → cast → transform** (with `sources`:
**transform → cast**).

### Paths

Paths are dot-notation strings — or arrays of raw segments when a key itself
contains a dot. `\.` escapes a literal dot in string form:

```ts
map({ "a.b": { c: 1 } }, [{ source: ["a.b", "c"], target: "out" }]);
// { out: 1 }
map({ "a.b": { c: 1 } }, [{ source: "a\\.b.c", target: "out" }]);
// { out: 1 } — same thing, escaped string form
```

The array form is the canonical representation; strings are sugar. Malformed
paths (empty segments, empty paths) are reported in `errors`, never thrown.

### Combining several fields (`sources`)

```ts
map({ first: "Ada", last: "Lovelace" }, [
  {
    sources: ["first", "last"],
    target: "fullName",
    transform: ([first, last]) => `${first} ${last}`,
  },
]);
// { fullName: "Ada Lovelace" }
```

Each source contributes its first matched value (`undefined` when absent).
`strict` reports an error only when *all* sources are missing and there is no
`default`.

### Conditional mappings (`when`)

```ts
map({ amount: 0 }, [
  { source: "amount", target: "billed", when: (value) => Boolean(value) },
]);
// {} — skipped silently; never an error
```

Over an array fan-out, `when` filters per element — combine with
`compactArrays` for a dense result.

### Casting

```ts
map({ id: "42" }, [{ source: "id", target: "id", cast: "number" }]);
// { id: 42 }
```

Booleans understand common string forms: `"true"/"1"/"yes"/"on"` → `true`,
`"false"/"0"/"no"/"off"/""` → `false`. An impossible cast (e.g. `"abc"` to a
number) is reported in `errors`, not thrown.

### Lookup tables and enums

```ts
map({ code: 2 }, [
  { source: "code", target: "label", lookup: { 1: "A", 2: "B" } },
]);
// { label: "B" }
```

A TypeScript `enum` is just an object at runtime (including its reverse
numeric-to-name entries), so it can be passed directly as a `lookup`.

### Arrays and the `$` syntax

An array **in the middle** of a source path is traversed element by element. In
the target, a `$` segment marks where an array should be built:

```ts
map({ request: { order: [{ id: "1" }, { id: "2" }] } }, [
  { source: "request.order.id", target: "app.ordering.$.id", cast: "number" },
]);
// { app: { ordering: [{ id: 1 }, { id: 2 }] } }
```

Source array positions are preserved, which keeps multiple field-mappings
aligned to the same element. An element that contributes no fields becomes an
empty slot (serialized as `null`) — pass `{ compactArrays: true }` to get dense
arrays instead. To fold an array source into a single scalar target, use
`first: true`.

A **numeric segment** in a source picks one array element deliberately; in a
target it writes an explicit array position:

```ts
map({ order: [{ id: "a" }, { id: "b" }] }, [
  { source: "order.1.id", target: "picked" },
]);
// { picked: "b" }

map({ lon: 4.9, lat: 52.4 }, [
  { source: "lon", target: "coords.0" },
  { source: "lat", target: "coords.1" },
]);
// { coords: [4.9, 52.4] }
```

Caveat: a numeric target segment creates an *array* container. If you need a
literal numeric object key (e.g. a year), write into a pre-existing object via
`into` — numeric segments fall back to plain keys on existing objects.

### Serializable mappings: the registry

Reference transforms and lookup tables **by name** and your mapping
definitions become pure JSON — storable in a config file or database row:

```ts
map(
  { name: "  ada  ", country: "NL" },
  [
    { source: "name", target: "name", transform: "trim" },
    { source: "country", target: "country", lookup: "countries" },
  ],
  { registry: { lookups: { countries: { NL: "Netherlands" } } } }
);
// { name: "ada", country: "Netherlands" }
```

Built-in transforms (always available): `trim`, `upper`, `lower`,
`toISODate`. A registry adds to — and can shadow — the built-ins. Function
values keep working; the registry is additive.

### Validating stored mappings

```ts
import { validateMappings } from "json-to-json-mapper";

const issues = validateMappings(mappingsFromConfig, { registry });
// [] means safe to persist/deploy; otherwise:
// [{ index: 2, code: "UNSAFE_TARGET", field: "target", message: "..." }]
```

`validateMappings` catches everything static: unknown keys (typos),
`source`/`sources` conflicts, malformed paths, unsafe target segments,
unknown registry references, and bad casts — before the mapping ever runs.
A JSON Schema for stored definitions ships at `schema/mapping.schema.json`
for editor autocomplete and CI validation.

### `skipped` and `errors`

- `skipped` lists input leaf paths (in dot notation) that no mapping consumed —
  handy for spotting fields you forgot to map.
- `errors` is an array of `{ code, source, target, message }` describing every
  mapping that could not be fully applied. Codes are stable public API:

| Code | Meaning |
|---|---|
| `SOURCE_MISSING` | `strict` mode: source(s) resolved to nothing and no `default` |
| `CAST_FAILED` | Value could not be coerced (e.g. `"abc"` → number) |
| `LOOKUP_MISS` | No matching key in the lookup table |
| `TARGET_CONFLICT` | Multiple values for a scalar target, or `$` shape mismatch |
| `UNSAFE_TARGET` | Target path hit the prototype-pollution guard |
| `TRANSFORM_FAILED` | A `transform`/`when` function threw |
| `INVALID_MAPPING` | Malformed mapping definition (bad paths, missing fields, unknown references) |

### Map-level options

```ts
map(input, mappings, {
  into: existingObject, // merge into this object instead of a fresh one
  strict: true,         // missing sources (without a default) become errors
  compactArrays: true,  // remove holes from arrays in the result
});
```

## Migrating from v1

v2 is a rewrite. The old API was stateful, crashed on the documented call
signature, and silently mismatched its own README. Key changes:

- **Signature:** `map(input, mappings)` (or `map(input, mappings, { into })`).
  The old required 4th `initial` argument is gone; pass `{ into }` if you need it.
- **Casting** uses the `cast` field with `"string" | "number" | "boolean"`
  (constructors still accepted). The old, undocumented behavior of the `format`
  key is removed — use `lookup` for enums and `cast` for types.
- **`skipped`** is now `string[]` (was `{ source }[]`).
- **`enum`** option is replaced by the more general **`lookup`**.
- **Statelessness & security:** results no longer leak between calls, and unsafe
  target keys are rejected.

## Development

```bash
pnpm install
pnpm run build       # compile to dist/
pnpm test            # type-check tests, then run them with node:test
pnpm run typecheck   # type-check everything without emitting
```

Tests use Node's built-in test runner (`node:test`), so there are no test
dependencies. Requires Node.js >= 18.

## License

[MIT](./LICENSE) © Rodrigo Nunes
