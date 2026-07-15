import { test } from "node:test";
import assert from "node:assert/strict";
import { map, type Mapping } from "../src/index.js";

test("maps a nested scalar", () => {
  const { result } = map(
    { request: { order: { id: "1" } } },
    [{ source: "request.order.id", target: "app.ordering.number" }]
  );
  assert.deepEqual(result, { app: { ordering: { number: "1" } } });
});

test("casts string to number", () => {
  const { result } = map(
    { request: { order: { id: "1" } } },
    [{ source: "request.order.id", target: "app.ordering.number", cast: "number" }]
  );
  assert.deepEqual(result, { app: { ordering: { number: 1 } } });
});

test("casts number to string", () => {
  const { result } = map(
    { request: { order: { id: 1 } } },
    [{ source: "request.order.id", target: "app.ordering.number", cast: "string" }]
  );
  assert.deepEqual(result, { app: { ordering: { number: "1" } } });
});

test("accepts constructor cast for ergonomics", () => {
  const { result } = map(
    { a: "2" },
    [{ source: "a", target: "b", cast: Number }]
  );
  assert.deepEqual(result, { b: 2 });
});

test("casts to boolean with sensible string handling", () => {
  const { result } = map(
    { yes: "true", no: "0", flag: "off" },
    [
      { source: "yes", target: "a", cast: "boolean" },
      { source: "no", target: "b", cast: "boolean" },
      { source: "flag", target: "c", cast: "boolean" },
    ]
  );
  assert.deepEqual(result, { a: true, b: false, c: false });
});

test("reports an error (not a throw) on an impossible cast", () => {
  const { result, errors } = map(
    { a: "notanumber" },
    [{ source: "a", target: "b", cast: "number" }]
  );
  assert.deepEqual(result, {});
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /cast.*number/i);
});

test("substitutes via a lookup table", () => {
  const { result } = map(
    { request: { order: { code: 2 } } },
    [{ source: "request.order.code", target: "app.ordering.text", lookup: { 1: "A", 2: "B" } }]
  );
  assert.deepEqual(result, { app: { ordering: { text: "B" } } });
});

test("supports TypeScript enums as lookups (reverse mapping)", () => {
  enum Code {
    A = 1,
    B = 2,
  }
  const { result } = map(
    { code: 2 },
    [{ source: "code", target: "text", lookup: Code }]
  );
  assert.deepEqual(result, { text: "B" });
});

test("reports an error on a lookup miss and keeps going", () => {
  const { result, errors } = map(
    { request: { order: { id: 1, code: 9 } } },
    [
      { source: "request.order.id", target: "out.number" },
      { source: "request.order.code", target: "out.text", lookup: { 1: "A" } },
    ]
  );
  assert.deepEqual(result, { out: { number: 1 } });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /lookup match/i);
});

test("applies an arbitrary transform", () => {
  const { result } = map(
    { name: "ada" },
    [{ source: "name", target: "name", transform: (v) => String(v).toUpperCase() }]
  );
  assert.deepEqual(result, { name: "ADA" });
});

test("uses a default when the source is missing", () => {
  const { result } = map(
    {},
    [{ source: "missing.path", target: "out.value", default: 42 }]
  );
  assert.deepEqual(result, { out: { value: 42 } });
});

test("missing optional source is silently skipped, not an error", () => {
  const { result, errors } = map(
    { a: 1 },
    [{ source: "does.not.exist", target: "out.value" }]
  );
  assert.deepEqual(result, {});
  assert.equal(errors.length, 0);
});

test("maps an array source into an array target with $", () => {
  const { result } = map(
    { request: { order: [{ id: "1", code: "2" }] } },
    [{ source: "request.order.id", target: "app.ordering.$.number.id", cast: "number" }]
  );
  assert.deepEqual(result, { app: { ordering: [{ number: { id: 1 } }] } });
});

test("maps every element of a multi-element array", () => {
  const { result } = map(
    { request: { order: [{ id: "1" }, { id: "2" }, { id: "3" }] } },
    [{ source: "request.order.id", target: "app.ordering.$.id", cast: "number" }]
  );
  assert.deepEqual(result, {
    app: { ordering: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  });
});

test("REGRESSION: sparse array where an element lacks the field does not crash", () => {
  // The mapper preserves source array positions: elements 0 and 2 are mapped,
  // and element 1 (which contributes nothing) becomes an empty slot. This keeps
  // multiple field-mappings aligned to the same element (see the next test).
  const { result, errors } = map(
    { request: { order: [{ id: "1" }, { nope: true }, { id: "3" }] } },
    [{ source: "request.order.id", target: "app.ordering.$.id", cast: "number" }]
  );
  assert.equal(errors.length, 0);
  assert.equal(
    JSON.stringify(result),
    JSON.stringify({ app: { ordering: [{ id: 1 }, null, { id: 3 }] } })
  );
});

test("array positions stay aligned across multiple field-mappings", () => {
  const { result } = map(
    { order: [{ id: "1" }, { id: "2", note: "hi" }] },
    [
      { source: "order.id", target: "out.$.id" },
      { source: "order.note", target: "out.$.note" },
    ]
  );
  // `note` belongs to element 1, and lands on element 1 — not shifted onto 0.
  assert.deepEqual(result, { out: [{ id: "1" }, { id: "2", note: "hi" }] });
});

test("first:true collapses an array source into a scalar target", () => {
  const { result } = map(
    { request: { order: [{ id: "1" }, { id: "2" }] } },
    [{ source: "request.order.id", target: "app.ordering.number", cast: "number", first: true }]
  );
  assert.deepEqual(result, { app: { ordering: { number: 1 } } });
});

test("scalar target fed by multiple values reports an error instead of silently clobbering", () => {
  const { errors } = map(
    { request: { order: [{ id: "1" }, { id: "2" }] } },
    [{ source: "request.order.id", target: "app.ordering.number" }]
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /scalar/i);
});

test("reports skipped input leaves", () => {
  const { skipped } = map(
    { request: { order: { id: 1, name: "x" }, details: "y" }, id: 4 },
    [{ source: "request.order.id", target: "out.id" }]
  );
  assert.deepEqual(skipped, ["request.order.name", "request.details", "id"]);
});

test("REGRESSION: same target from two mappings — both are written (last wins), no silent-first-only drop", () => {
  const mappings: Mapping[] = [
    { source: "a", target: "x.v" },
    { source: "b", target: "x.v" },
  ];
  const { result } = map({ a: 1, b: 2 }, mappings);
  assert.deepEqual(result, { x: { v: 2 } });
});

test("REGRESSION: README-style call works and default result object is fresh", () => {
  // v1 crashed unless a 4th `initial` argument was passed; v2 needs only two.
  const { result } = map(
    { request: { order: { id: "1" } } },
    [{ source: "request.order.id", target: "app.ordering.number", cast: "number" }]
  );
  assert.deepEqual(result, { app: { ordering: { number: 1 } } });
});

test("into option merges onto an existing object", () => {
  const base = { existing: true } as Record<string, unknown>;
  const { result } = map({ a: 1 }, [{ source: "a", target: "b" }], { into: base });
  assert.deepEqual(result, { existing: true, b: 1 });
  assert.equal(result, base);
});

test("throws a clear TypeError when mappings is not an array", () => {
  assert.throws(
    () => map({}, undefined as unknown as Mapping[]),
    /mappings must be an array/
  );
});

test("explicit numeric index in source picks one array element", () => {
  const { result } = map(
    { order: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    [{ source: "order.1.id", target: "picked" }]
  );
  assert.deepEqual(result, { picked: "b" });
});

test("explicit numeric index out of bounds resolves to nothing", () => {
  const { result, errors } = map(
    { order: [{ id: "a" }] },
    [{ source: "order.9.id", target: "picked" }]
  );
  assert.deepEqual(result, {});
  assert.equal(errors.length, 0);
});

test("numeric key on a plain object still works as a normal key", () => {
  const { result } = map(
    { codes: { "0": "zero" } },
    [{ source: "codes.0", target: "out" }]
  );
  assert.deepEqual(result, { out: "zero" });
});

test("strict: true reports missing sources as errors", () => {
  const { errors } = map(
    { a: 1 },
    [
      { source: "a", target: "x.a" },
      { source: "missing.path", target: "x.b" },
    ],
    { strict: true }
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /resolved to no values/);
});

test("strict: true is satisfied by a default", () => {
  const { result, errors } = map(
    {},
    [{ source: "missing", target: "x", default: "fallback" }],
    { strict: true }
  );
  assert.deepEqual(result, { x: "fallback" });
  assert.equal(errors.length, 0);
});

test("compactArrays: true removes holes but keeps assigned nulls", () => {
  const { result } = map(
    { order: [{ id: "1" }, { nope: true }, { id: "3" }] },
    [{ source: "order.id", target: "out.$.id", cast: "number" }],
    { compactArrays: true }
  );
  assert.deepEqual(result, { out: [{ id: 1 }, { id: 3 }] });

  const withNull = map(
    { order: [{ id: null }, { id: "2" }] },
    [{ source: "order.id", target: "out.$.id" }],
    { compactArrays: true }
  );
  assert.deepEqual(withNull.result, { out: [{ id: null }, { id: "2" }] });
});

test("compactArrays preserves the into reference", () => {
  const base: Record<string, unknown> = {};
  const { result } = map(
    { order: [{ id: "1" }, { nope: true }] },
    [{ source: "order.id", target: "out.$.id" }],
    { into: base, compactArrays: true }
  );
  assert.equal(result, base);
  assert.deepEqual(base, { out: [{ id: "1" }] });
});
