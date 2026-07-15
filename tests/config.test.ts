/**
 * M2 — config-first features: named registry, stable error codes,
 * validateMappings, and agreement between validateMappings and the shipped
 * JSON Schema on serializable fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import {
  map,
  validateMappings,
  BUILTIN_TRANSFORMS,
  type Mapping,
  type MappingError,
} from "../src/index.js";

// ---------------------------------------------------------------- registry

test("M2: built-in named transforms work via string reference", () => {
  const { result, errors } = map({ name: "  ada  ", code: "eu" }, [
    { source: "name", target: "name", transform: "trim" },
    { source: "code", target: "code", transform: "upper" },
  ]);
  assert.deepEqual(result, { name: "ada", code: "EU" });
  assert.equal(errors.length, 0);
});

test("M2: toISODate built-in parses and fails with TRANSFORM_FAILED", () => {
  const ok = map({ ts: "2026-07-15T06:00:00Z" }, [
    { source: "ts", target: "date", transform: "toISODate" },
  ]);
  assert.deepEqual(ok.result, { date: "2026-07-15" });

  const bad = map({ ts: "not a date" }, [
    { source: "ts", target: "date", transform: "toISODate" },
  ]);
  assert.equal(bad.errors[0].code, "TRANSFORM_FAILED");
});

test("M2: user registry adds transforms and lookups; shadows built-ins", () => {
  const registry = {
    transforms: { trim: (v: unknown) => `custom:${v}`, double: (v: unknown) => Number(v) * 2 },
    lookups: { countries: { NL: "Netherlands" } },
  };
  const { result, errors } = map(
    { a: "x", b: "2", c: "NL" },
    [
      { source: "a", target: "a", transform: "trim" },
      { source: "b", target: "b", transform: "double" },
      { source: "c", target: "c", lookup: "countries" },
    ],
    { registry }
  );
  assert.deepEqual(result, { a: "custom:x", b: 4, c: "Netherlands" });
  assert.equal(errors.length, 0);
});

test("M2: unknown registry references are INVALID_MAPPING errors", () => {
  const { errors } = map({ a: 1, b: 2 }, [
    { source: "a", target: "a", transform: "nope" },
    { source: "b", target: "b", lookup: "missing" },
  ]);
  assert.deepEqual(errors.map((e: MappingError) => e.code), ["INVALID_MAPPING", "INVALID_MAPPING"]);
});

// ------------------------------------------------------------- error codes

test("M2: every failure mode carries its stable code", () => {
  const cases: Array<{ mappings: Mapping[]; input: unknown; code: string; strict?: boolean }> = [
    { input: {}, mappings: [{ source: "x", target: "out" }], code: "SOURCE_MISSING", strict: true },
    { input: { a: "abc" }, mappings: [{ source: "a", target: "out", cast: "number" }], code: "CAST_FAILED" },
    { input: { a: 9 }, mappings: [{ source: "a", target: "out", lookup: { 1: "x" } }], code: "LOOKUP_MISS" },
    {
      input: { a: [{ v: 1 }, { v: 2 }] },
      mappings: [{ source: "a.v", target: "out" }],
      code: "TARGET_CONFLICT",
    },
    { input: { a: 1 }, mappings: [{ source: "a", target: "__proto__.x" }], code: "UNSAFE_TARGET" },
    {
      input: { a: 1 },
      mappings: [{ source: "a", target: "out", transform: () => { throw new Error("boom"); } }],
      code: "TRANSFORM_FAILED",
    },
    { input: { a: 1 }, mappings: [{ source: "", target: "out" }], code: "INVALID_MAPPING" },
  ];
  for (const testCase of cases) {
    const { errors } = map(testCase.input, testCase.mappings, { strict: testCase.strict });
    assert.equal(errors.length, 1, `expected one error for ${testCase.code}`);
    assert.equal(errors[0].code, testCase.code);
  }
});

// --------------------------------------------------------- validateMappings

test("M2: validateMappings returns no issues for a valid definition", () => {
  const mappings: Mapping[] = [
    { source: "a.b", target: "x.y", cast: "number" },
    { sources: ["a", "b"], target: "combined", transform: "trim" },
    { source: ["dotted.key", "c"], target: "z", lookup: { 1: "one" } },
  ];
  assert.deepEqual(validateMappings(mappings), []);
});

test("M2: validateMappings flags every static problem with structured issues", () => {
  const issues = validateMappings(
    [
      { target: "out" }, // neither source nor sources
      { source: "a", sources: ["b"], target: "out", transform: "trim" }, // both
      { source: "a..b", target: "out" }, // malformed source
      { source: "a", target: "__proto__.x" }, // unsafe target
      { source: "a", target: "out", cast: "date" as never }, // bad cast
      { source: "a", target: "out", transform: "nope" }, // unknown transform
      { source: "a", target: "out", lookup: "nope" }, // unknown lookup
      { source: "a", target: "out", tramsform: "trim" } as never, // typo key
      { sources: ["a"], target: "out" }, // sources without transform
      "not an object" as never,
    ],
    {}
  );

  const byCode = (code: string) => issues.filter((issue) => issue.code === code);
  assert.ok(byCode("INVALID_MAPPING").length >= 7);
  assert.equal(byCode("UNSAFE_TARGET").length, 1);
  assert.equal(byCode("UNKNOWN_KEY").length, 1);
  assert.equal(byCode("UNKNOWN_KEY")[0].field, "tramsform");
  for (const issue of issues) {
    assert.equal(typeof issue.index, "number");
    assert.equal(typeof issue.message, "string");
  }
});

test("M2: validateMappings accepts registry references it can resolve", () => {
  const registry = { transforms: { double: (v: unknown) => Number(v) * 2 }, lookups: { c: { a: 1 } } };
  const mappings: Mapping[] = [
    { source: "a", target: "x", transform: "double" },
    { source: "b", target: "y", lookup: "c" },
  ];
  assert.deepEqual(validateMappings(mappings, { registry }), []);
  assert.ok(validateMappings(mappings).length > 0); // without the registry they are unknown
});

test("M2: validateMappings covers every field-type check", () => {
  const issues = validateMappings([
    { source: "a", target: "out", transform: 42 as never }, // transform wrong type
    { source: "a", target: "out", lookup: ["array"] as never }, // lookup wrong type
    { source: "a", target: "out", lookup: null as never }, // lookup null
    { source: "a", target: "out", when: "not a fn" as never }, // when wrong type
    { source: "a", target: "out", first: "yes" as never }, // first wrong type
    { source: "a" } as never, // missing target
    { sources: "not-an-array" as never, target: "out" }, // sources wrong type
    { sources: ["a", "b..c"], target: "out", transform: "trim" }, // malformed sources entry
  ]);
  const fields = issues.map((issue) => issue.field);
  for (const expected of ["transform", "lookup", "when", "first", "target", "sources", "sources[1]"]) {
    assert.ok(fields.includes(expected), `expected an issue on '${expected}', got ${JSON.stringify(fields)}`);
  }
  assert.ok(issues.every((issue) => issue.code === "INVALID_MAPPING"));
});

test("M2: multi-source 'when' throwing is a TRANSFORM_FAILED error", () => {
  const { errors } = map({ a: 1 }, [{
    sources: ["a"],
    target: "out",
    transform: (v: unknown[]) => v,
    when: () => {
      throw new Error("nope");
    },
  }]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "TRANSFORM_FAILED");
});

test("M3: compiled mapper accepts per-call into and stays reusable", () => {
  const { compile } = require("../src/index.js") as typeof import("../src/index.js");
  const mapper = compile([{ source: "v", target: "x" }]);
  const first: Record<string, unknown> = { keep: true };
  assert.deepEqual(mapper({ v: 1 }, { into: first }).result, { keep: true, x: 1 });
  assert.deepEqual(mapper({ v: 2 }).result, { x: 2 }); // fresh object per call
});

test("M2: validateMappings on a non-array reports instead of throwing", () => {
  const issues = validateMappings("nope" as never);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].index, -1);
});

// ------------------------------------------------------------- JSON Schema

// Tests run from the repo root (compiled into .test-build/), so resolve the
// shipped schema from the working directory rather than __dirname.
const schema = JSON.parse(
  readFileSync(join(process.cwd(), "schema", "mapping.schema.json"), "utf8")
);

test("M2: shipped JSON Schema compiles and agrees with validateMappings on fixtures", () => {
  const ajv = new Ajv({ allowUnionTypes: true });
  const validate = ajv.compile(schema);

  const serializableValid = [
    [{ source: "a.b", target: "x.y", cast: "number" }],
    [{ sources: ["first", "last"], target: "name", transform: "trim" }],
    [{ source: ["dotted.key", "c"], target: "z", lookup: { "1": "one" }, default: null }],
    [{ source: "a", target: "coords.0", first: true }],
  ];
  for (const fixture of serializableValid) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    assert.deepEqual(validateMappings(fixture), [], JSON.stringify(fixture));
  }

  const serializableInvalid = [
    [{ target: "out" }], // no source
    [{ source: "a", sources: ["b"], target: "out", transform: "trim" }], // both
    [{ source: "a", target: "out", cast: "date" }], // bad cast
    [{ source: "a", target: "out", unknownKey: 1 }], // unknown key
    [{ sources: ["a"], target: "out" }], // sources without transform
    [{ sources: ["a"], target: "out", transform: "trim", lookup: { a: 1 } }], // sources+lookup
    "not an array",
  ];
  for (const fixture of serializableInvalid) {
    assert.equal(validate(fixture), false, JSON.stringify(fixture));
    assert.ok(validateMappings(fixture as never).length > 0, JSON.stringify(fixture));
  }
});

test("M2: built-in transform names referenced by the schema docs all exist", () => {
  for (const name of ["trim", "upper", "lower", "toISODate"]) {
    assert.equal(typeof BUILTIN_TRANSFORMS[name], "function");
  }
});
