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

## Install

```bash
pnpm add json-to-json-mapper
# or: npm install json-to-json-mapper
```

## Quick start

```ts
import { map } from "json-to-json-mapper";

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
| `source`    | `string` (required)                    | Dot-path into the input, e.g. `request.order.id`. Arrays are traversed.     |
| `target`    | `string` (required)                    | Dot-path into the output. Use `$` to denote an array level.                 |
| `cast`      | `"string" \| "number" \| "boolean"`    | Coerce the value's type. The `String`/`Number`/`Boolean` constructors work too. |
| `lookup`    | `Record<string \| number, unknown>`    | Substitute the value via a table or a TypeScript `enum`.                    |
| `transform` | `(value: unknown) => unknown`          | Arbitrary transform, applied last.                                          |
| `default`   | `unknown`                              | Value to use when the source resolves to nothing.                           |
| `first`     | `boolean`                              | Keep only the first matched value (for a scalar target fed by an array).    |

Order of application per value: **lookup → cast → transform**.

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
empty slot (serialized as `null`). To fold an array source into a single scalar
target, use `first: true`.

### `skipped` and `errors`

- `skipped` lists input leaf paths (in dot notation) that no mapping consumed —
  handy for spotting fields you forgot to map.
- `errors` is an array of `{ source, target, message }` describing every mapping
  that could not be fully applied (bad cast, lookup miss, unsafe target key,
  malformed mapping).

### Merging into an existing object

```ts
map(input, mappings, { into: existingObject });
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
