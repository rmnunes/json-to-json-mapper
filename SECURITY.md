# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Design notes

`map()` is a pure function: it does not mutate its inputs and keeps no state
between calls. Target paths are validated before any write, and the segments
`__proto__`, `constructor`, and `prototype` are rejected so that a
mapping definition (which may be derived from untrusted input) cannot pollute
the JavaScript prototype chain.

Even so, treat mapping definitions as code: `transform` functions run with the
privileges of your process, and a `lookup`/`transform` you did not author should
be reviewed like any other dependency.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the repository's **Security** tab) rather than
opening a public issue. Include a minimal reproduction and the affected version.
You can expect an initial response within a few days; if a fix is warranted it
will be released as a patch version and credited in the changelog.
