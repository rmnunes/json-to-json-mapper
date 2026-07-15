/**
 * M3 — property-based tests and parser fuzzing (fast-check, devDependency).
 *
 * These guard the library's safety claims over arbitrary data, not just
 * hand-picked examples:
 *   - map/compile never throw for per-mapping problems, whatever the input;
 *   - no input or path can pollute Object.prototype;
 *   - compactArrays is idempotent;
 *   - map() and compile()() agree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { map, compile, compactArraysDeep, type Mapping } from "../src/index.js";

const protoPropsBefore = JSON.stringify(Object.getOwnPropertyNames(Object.prototype).sort());

function assertPrototypeClean(): void {
  assert.equal(
    JSON.stringify(Object.getOwnPropertyNames(Object.prototype).sort()),
    protoPropsBefore,
    "Object.prototype gained or lost properties"
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
}

/** Path-ish strings: plain keys, dots, escapes, $, digits, unsafe keys, junk. */
const pathString = fc.oneof(
  fc.string(),
  fc.stringMatching(/^[a-z]{1,3}(\.[a-z$\d]{1,3}){0,4}$/),
  fc.constantFrom(
    "__proto__",
    "constructor.prototype",
    "a.__proto__.b",
    "$.a",
    "a.$.b",
    "0.1.2",
    "a\\.b",
    "\\",
    "a..b",
    ".",
    ""
  )
);

test("PROPERTY: map never throws and never pollutes, for any JSON input and any string paths", () => {
  fc.assert(
    fc.property(fc.jsonValue(), pathString, pathString, (input, source, target) => {
      const { result, errors } = map(input as never, [{ source, target }]);
      assert.ok(typeof result === "object" && result !== null);
      assert.ok(Array.isArray(errors));
      assertPrototypeClean();
    }),
    { numRuns: 300 }
  );
});

test("PROPERTY (fuzz): parser handles arbitrary unicode paths in source, sources, and target", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: "binary" }),
      fc.string({ unit: "binary" }),
      fc.jsonValue(),
      (pathA, pathB, input) => {
        // Single source, array-form paths, and multi-source all must be total.
        map(input as never, [{ source: pathA, target: pathB }]);
        map(input as never, [{ source: [pathA], target: [pathB] } as Mapping]);
        map(input as never, [
          { sources: [pathA, pathB], target: "out", transform: (v: unknown[]) => v },
        ]);
        assertPrototypeClean();
      }
    ),
    { numRuns: 300 }
  );
});

test("PROPERTY: identity mappings round-trip flat objects", () => {
  const safeKey = fc
    .string({ minLength: 1, maxLength: 8 })
    .filter(
      (k) =>
        !k.includes(".") &&
        !k.includes("\\") &&
        k !== "__proto__" &&
        k !== "constructor" &&
        k !== "prototype" &&
        k !== "$" &&
        !/^(0|[1-9][0-9]*)$/.test(k)
    );
  fc.assert(
    fc.property(
      fc.dictionary(safeKey, fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), {
        maxKeys: 8,
        noNullPrototype: true,
      }),
      (flat) => {
        const mappings: Mapping[] = Object.keys(flat).map((key) => ({
          source: [key],
          target: [key],
        }));
        const { result, errors } = map(flat, mappings);
        assert.deepEqual(result, flat);
        assert.equal(errors.length, 0);
      }
    ),
    { numRuns: 200 }
  );
});

test("PROPERTY: compactArrays is idempotent", () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const once = compactArraysDeep(JSON.parse(JSON.stringify(value ?? null)));
      const twice = compactArraysDeep(JSON.parse(JSON.stringify(once ?? null)));
      assert.deepEqual(twice, once);
    }),
    { numRuns: 200 }
  );
});

test("PROPERTY: map() and compile()() produce identical outcomes", () => {
  fc.assert(
    fc.property(fc.jsonValue(), pathString, pathString, (input, source, target) => {
      const viaMap = map(input as never, [{ source, target }], { strict: true });
      const compiled = compile([{ source, target }], { strict: true });
      const viaCompile = compiled(input as never);
      assert.deepEqual(viaCompile.result, viaMap.result);
      assert.deepEqual(viaCompile.errors, viaMap.errors);
      assert.deepEqual(viaCompile.skipped, viaMap.skipped);
      // Compiled mappers are reusable: a second call must be identical too.
      assert.deepEqual(compiled(input as never).result, viaMap.result);
    }),
    { numRuns: 300 }
  );
});
