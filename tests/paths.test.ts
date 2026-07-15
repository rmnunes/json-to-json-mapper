import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, setValue, leafPaths } from "../src/paths";

test("extract reads a nested scalar with no array indices", () => {
  assert.deepEqual(extract({ a: { b: 1 } }, ["a", "b"]), [{ value: 1, path: [] }]);
});

test("extract descends through a mid-path array, recording indices", () => {
  const found = extract({ order: [{ id: 1 }, { id: 2 }] }, ["order", "id"]);
  assert.deepEqual(found, [
    { value: 1, path: [0] },
    { value: 2, path: [1] },
  ]);
});

test("extract yields nothing for a missing key", () => {
  assert.deepEqual(extract({ a: 1 }, ["b"]), []);
});

test("extract returns a trailing array verbatim", () => {
  assert.deepEqual(extract({ tags: ["a", "b"] }, ["tags"]), [
    { value: ["a", "b"], path: [] },
  ]);
});

test("setValue builds nested objects", () => {
  const root: Record<string, unknown> = {};
  setValue(root, ["a", "b", "c"], 1, []);
  assert.deepEqual(root, { a: { b: { c: 1 } } });
});

test("setValue builds arrays at $ segments using indices", () => {
  const root: Record<string, unknown> = {};
  setValue(root, ["items", "$", "id"], "x", [0]);
  setValue(root, ["items", "$", "id"], "y", [1]);
  assert.deepEqual(root, { items: [{ id: "x" }, { id: "y" }] });
});

test("setValue refuses unsafe keys", () => {
  const root: Record<string, unknown> = {};
  assert.throws(() => setValue(root, ["__proto__", "x"], 1, []), /unsafe/i);
});

test("leafPaths collapses array indices and de-duplicates", () => {
  assert.deepEqual(
    leafPaths({ order: [{ id: 1 }, { id: 2 }], name: "x" }),
    ["order.id", "name"]
  );
});
