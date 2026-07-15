import { test } from "node:test";
import assert from "node:assert/strict";
import { map, isUnsafeKey } from "../src/index.js";

test("REGRESSION: __proto__ target does not pollute Object.prototype", () => {
  const { errors } = map(
    { a: "polluted" },
    [{ source: "a", target: "__proto__.hacked" }]
  );
  // Nothing leaks onto the prototype chain.
  assert.equal(({} as Record<string, unknown>)["hacked"], undefined);
  assert.equal((Object.prototype as Record<string, unknown>)["hacked"], undefined);
  // And the attempt is surfaced as an error rather than silently succeeding.
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unsafe/i);
});

test("REGRESSION: constructor / prototype target keys are rejected", () => {
  for (const key of ["constructor", "prototype"]) {
    const { errors } = map({ a: 1 }, [{ source: "a", target: `${key}.x` }]);
    assert.equal(errors.length, 1, `expected ${key} to be rejected`);
  }
  assert.equal(({} as Record<string, unknown>)["x"], undefined);
});

test("isUnsafeKey flags dangerous keys", () => {
  assert.ok(isUnsafeKey("__proto__"));
  assert.ok(isUnsafeKey("constructor"));
  assert.ok(isUnsafeKey("prototype"));
  assert.ok(!isUnsafeKey("id"));
});

test("REGRESSION: map is stateless across calls (skipped does not accumulate)", () => {
  const input = { a: 1, b: 2 };
  const mappings = [{ source: "a", target: "x.a" }];
  map(input, mappings);
  const second = map(input, mappings);
  assert.deepEqual(second.skipped, ["b"]);
});

test("REGRESSION: results do not bleed between independent calls", () => {
  const first = map({ a: 1 }, [{ source: "a", target: "x.a" }]);
  const second = map({ b: 2 }, [{ source: "b", target: "y.b" }]);
  assert.deepEqual(first.result, { x: { a: 1 } });
  assert.deepEqual(second.result, { y: { b: 2 } });
});

test("REGRESSION: errors do not accumulate across calls", () => {
  const bad = { a: "x" };
  const mappings = [{ source: "a", target: "b", cast: "number" as const }];
  map(bad, mappings);
  const second = map(bad, mappings);
  assert.equal(second.errors.length, 1);
});
