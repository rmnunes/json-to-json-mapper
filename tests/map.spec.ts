import { expect } from "chai";
import { map } from "../src";

describe("Map", () => {
  it("test casting from string to number", () => {
    const input = {
      request: {
        order: {
          id: "1",
        },
      },
    };

    const mappings = [
      {
        source: "request.order.id",
        target: "app.ordering.number",
        cast: Number,
      },
    ];

    const expected = {
      app: {
        ordering: {
          number: 1,
        },
      },
    };
    const { result } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equal(JSON.stringify(result));
  });

  it("test casting from number to string", () => {
    const input = {
      request: {
        order: {
          id: 1,
        },
      },
    };

    const mappings = [
      {
        source: "request.order.id",
        target: "app.ordering.number",
        cast: String,
      },
    ];

    const expected = {
      app: {
        ordering: {
          number: "1",
        },
      },
    };
    const { result } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equals(JSON.stringify(result));
  });

  it("test skipped response", () => {
    const input = {
      request: {
        order: {
          id: 1,
          name: "test",
        },
        details: "string",
      },
      id: 4,
    };

    const mappings = [
      {
        source: "request.order.id",
        target: "app.ordering.number",
        cast: String,
      },
    ];

    const expected = [
      { source: "request.order.name" },
      { source: "request.details" },
      { source: "id" },
    ];
    const { skipped } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equals(skipped);
  });

  it("test errors response", () => {
    const input = {
      request: {
        order: {
          id: 1,
          name: "test",
        },
        details: "string",
      },
      id: 4,
    };

    const mappings = [
      {
        source: "request.order.id",
        target: "app.ordering.number",
        cast: String,
      },
    ];

    const expected = [];
    const { errors } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equals(errors);
  });

  it("test enum mapping", () => {
    enum inputCode {
      test = 1,
    }

    const input = {
      request: {
        order: {
          id: 1,
          code: 1,
        },
        details: "string",
      },
      id: 4,
    };

    const mappings = [
      {
        source: "request.order.id",
        target: "app.ordering.number",
      },
      {
        source: "request.order.code",
        target: "app.ordering.text",
        enum: inputCode,
      },
    ];

    const expected = { app: { ordering: { number: 1, text: "test" } } };
    const { result } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equals(JSON.stringify(result));
  });

  it("test errors element not found", () => {
    const input = {
      request: {
        order: {
          id: 1,
          name: "test",
        },
        details: "string",
      },
      id: 4,
    };

    const mappings = [
      {
        source: "request.order.id1",
        target: "app.ordering.number",
        cast: String,
      },
    ];

    const expected = [
      { ref: "id1", message: "Source Element: id1 not found." },
    ];
    const { errors } = map(input, mappings, false, {});
    expect(JSON.stringify(expected)).to.be.equals(errors);
  });
});
