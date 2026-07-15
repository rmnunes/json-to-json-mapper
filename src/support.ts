/**
 * @deprecated Import from the package root (`json-to-json-mapper`) instead.
 * This module is retained only so existing deep imports keep resolving; the
 * old stateful `dotNotation`/`checkSkippedFieldsFromSource`/`save` helpers were
 * removed in v2 because they leaked state across calls. Use `leafPaths` and the
 * pure `map` API instead.
 */
export { leafPaths, extract, setValue, isUnsafeKey } from "./paths.js";
