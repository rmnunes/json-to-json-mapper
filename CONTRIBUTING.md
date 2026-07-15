# Contributing

Thanks for your interest in improving json-to-json-mapper!

## Development setup

Requirements: Node.js >= 18 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm run typecheck   # type-check everything (src, tests, no emit)
pnpm run build       # dual CJS + ESM build into dist/
pnpm test            # compile tests, run them with node:test
pnpm run test:coverage
pnpm run check:dist  # smoke-test both built entry points
```

There are no runtime dependencies and no test-framework dependencies — tests
use Node's built-in `node:test` runner. Please keep it that way: PRs that add
a runtime dependency will generally not be accepted.

## Making changes

1. Fork and create a topic branch.
2. Add or update tests for any behavior change. Bug fixes should include a
   regression test that fails without the fix.
3. Make sure `pnpm run typecheck`, `pnpm run build`, `pnpm test`, and
   `pnpm run check:dist` all pass.
4. If the change is user-visible, add a line to `CHANGELOG.md` and update the
   README.
5. Open a pull request describing what changed and why.

## Design principles

- `map()` is a **pure function**: no module-level state, no mutation of
  inputs, safe for concurrent use.
- **Never throw for per-mapping problems** — collect them in `errors` so a
  partial result is always available. Throwing is reserved for caller bugs
  (e.g. `mappings` not being an array).
- **Safety first**: target-path writes must go through `setValue`, which
  rejects `__proto__`, `constructor`, and `prototype`.
- New test files must be added to the `test` / `test:coverage` scripts in
  `package.json` (explicit file lists — `node --test` glob support is not
  available on all supported Node versions).

## Reporting security issues

Please do not open public issues for suspected vulnerabilities — see
[SECURITY.md](./SECURITY.md).
