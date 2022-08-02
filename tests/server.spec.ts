import { expect } from "chai";
import { assignValue } from "../src";

describe("Value Assignment", () => {
  it("assign object", () => {
    const target = {};
    const expected = { key: "value" };
    assignValue(target, "key", "value", undefined, false);
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(target));
  });

  it("assign array of object", () => {
    const target = { key: [] };
    const expected = { key: [{ key: "value" }] };
    assignValue(target["key"], "key", "value", 0, false);
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(target));
  });

  it("assign array of object to object", () => {
    const target = { key: [{ key: {} }] };
    const expected = { key: [{ key: { key: "value" } }] };
    assignValue(target.key[0].key, "key", "value", undefined, false);
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(target));
  });

  it("assign array", () => {
    let target = { key: [] };
    const expected = { key: ["value"] };
    assignValue(target["key"], "key", "value", 0, true);
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(target));
  });

  it("assign array of object with null value", () => {
    const target = { key: [] };
    const expected = { key: [{ key: null }] };
    assignValue(target["key"], "key", null, 0, false);
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(target));
  });
});
