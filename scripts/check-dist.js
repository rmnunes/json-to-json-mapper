/**
 * Smoke-test both built entry points the way real consumers load them:
 * require() for the CJS build and dynamic import() for the ESM build.
 * Fails loudly if either flavor is broken, so a bad dual build can never
 * reach the registry (wired into prepublishOnly and CI).
 */
const assert = require("assert");
const { pathToFileURL } = require("url");
const path = require("path");

const INPUT = { request: { order: { id: "1" } } };
const MAPPINGS = [
  { source: "request.order.id", target: "app.ordering.number", cast: "number" },
];
const EXPECTED = JSON.stringify({ app: { ordering: { number: 1 } } });

function verify(flavor, mod) {
  assert.equal(typeof mod.map, "function", `${flavor}: map export missing`);
  const { result, errors } = mod.map(INPUT, MAPPINGS);
  assert.equal(JSON.stringify(result), EXPECTED, `${flavor}: wrong result`);
  assert.equal(errors.length, 0, `${flavor}: unexpected errors`);
  console.log(`${flavor} build OK`);
}

async function main() {
  const root = path.join(__dirname, "..");
  verify("cjs", require(path.join(root, "dist/cjs/index.js")));
  verify("esm", await import(pathToFileURL(path.join(root, "dist/esm/index.js")).href));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
