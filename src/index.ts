/**
 * json-to-json-mapper
 *
 * Remap one JSON shape into another from a declarative list of mappings.
 * The public entry point is {@link map}; it is a pure function with no
 * runtime dependencies.
 */

import { codeOf, type MappingErrorCode } from "./errors.js";
import {
  compactArraysDeep,
  extract,
  leafPaths,
  parsePath,
  pathLabel,
  setValue,
  type Path,
} from "./paths.js";
import {
  applyCast,
  applyLookup,
  castName,
  resolveLookup,
  resolveTransform,
  type Cast,
  type LookupTable,
  type Registry,
  type TransformFn,
} from "./transform.js";

export type { Cast, CastName, LookupTable, Registry, TransformFn } from "./transform.js";
export type { Path } from "./paths.js";
export type { MappingErrorCode } from "./errors.js";

/** A single source-to-target rule. */
export interface Mapping {
  /**
   * Path into the input, e.g. `request.order.id`. Arrays are traversed;
   * a numeric segment picks one element. Use the array form
   * (`["a.b", "c"]`) or `\.` escaping for keys that contain dots.
   * Exactly one of `source` / `sources` must be present.
   */
  source?: Path;
  /**
   * Multiple input paths whose values are collected positionally into an
   * array and passed to `transform` (which is required). Each source
   * contributes its first matched value, or `undefined` when absent.
   */
  sources?: Path[];
  /** Path into the output. `$` denotes an array level; numeric segments write explicit positions. */
  target: Path;
  /** Coerce the value's type: `"string" | "number" | "boolean"` (or the matching constructor). */
  cast?: Cast;
  /**
   * Substitute the value via a lookup table, TypeScript enum, or the name
   * of a table in the registry. Not supported with `sources`.
   */
  lookup?: LookupTable | string;
  /**
   * Arbitrary transform (applied last), or the name of a registry /
   * built-in transform. With `sources`, it receives the positional array
   * of values and is required.
   */
  transform?: TransformFn | string;
  /** Value to use when the source(s) resolve to nothing. */
  default?: unknown;
  /** Keep only the first matched value (for a scalar target fed by an array source). */
  first?: boolean;
  /**
   * Apply this mapping only when the predicate returns truthy. For `source`
   * it is called per matched value (before cast/lookup/transform); for
   * `sources` it is called once with the positional values array. A falsy
   * return skips silently — never an error, even in strict mode.
   */
  when?: (value: any, input: unknown) => boolean;
}

/** A structured error for one mapping that could not be fully applied. */
export interface MappingError {
  /** Stable, documented error code — safe to branch on. */
  code: MappingErrorCode;
  source?: string;
  target?: string;
  message: string;
}

/** The outcome of a {@link map} call. */
export interface MapResult<T = Record<string, unknown>> {
  /** The remapped object. */
  result: T;
  /** Input leaf paths that no mapping consumed. */
  skipped: string[];
  /** Problems encountered while mapping (never thrown; always collected here). */
  errors: MappingError[];
}

export interface MapOptions {
  /** Merge the result into this object instead of a fresh one. */
  into?: Record<string, unknown>;
  /**
   * Report an error when a mapping's source resolves to nothing and no
   * `default` is provided (instead of silently skipping it).
   */
  strict?: boolean;
  /**
   * Remove holes from arrays in the result. By default, source array
   * positions are preserved (a skipped element leaves an empty slot) so
   * multiple field-mappings stay aligned; enable this to get dense arrays
   * once alignment no longer matters.
   */
  compactArrays?: boolean;
  /** Named transforms and lookup tables referenced by string in mappings. */
  registry?: Registry;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Label used for a mapping's source side in errors and `skipped`. */
function sourceLabel(mapping: Mapping): string | undefined {
  if (mapping.source !== undefined) return pathLabel(mapping.source);
  if (Array.isArray(mapping.sources)) return mapping.sources.map(pathLabel).join(" + ");
  return undefined;
}

// ------------------------------------------------------------ compilation

interface PreparedError {
  kind: "error";
  error: MappingError;
}

interface PreparedBase {
  label: { source?: string; target?: string };
  targetParts: string[];
  castTo?: ReturnType<typeof castName>;
  transformFn?: TransformFn;
  when?: (value: any, input: unknown) => boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
}

interface PreparedSingle extends PreparedBase {
  kind: "single";
  sourceParts: string[];
  arrayLevels: number;
  lookupTable?: LookupTable;
  first?: boolean;
}

interface PreparedMulti extends PreparedBase {
  kind: "multi";
  sourcesParts: string[][];
  transformFn: TransformFn; // required for multi
}

type Prepared = PreparedError | PreparedSingle | PreparedMulti;

/** Parse paths and resolve registry references once, up front. */
function prepareMapping(mapping: Mapping, registry: Registry | undefined): Prepared {
  const asError = (code: MappingErrorCode, message: string, label?: PreparedBase["label"]): PreparedError => ({
    kind: "error",
    error: { code, ...label, message },
  });

  if (!mapping || typeof mapping !== "object") {
    return asError("INVALID_MAPPING", "Mapping must be an object");
  }

  const label = {
    source: sourceLabel(mapping),
    target: mapping.target !== undefined ? pathLabel(mapping.target) : undefined,
  };

  const hasSource = mapping.source !== undefined;
  const hasSources = mapping.sources !== undefined;
  if (hasSource === hasSources) {
    return asError("INVALID_MAPPING", "Mapping must have exactly one of 'source' or 'sources'", label);
  }

  const targetParts = mapping.target !== undefined ? parsePath(mapping.target) : null;
  if (!targetParts) {
    return asError("INVALID_MAPPING", "Malformed or missing target path", label);
  }

  let castTo: PreparedBase["castTo"];
  let transformFn: TransformFn | undefined;
  try {
    if (mapping.cast !== undefined) castTo = castName(mapping.cast);
    if (mapping.transform !== undefined) transformFn = resolveTransform(mapping.transform, registry);
  } catch (error) {
    return asError(codeOf(error, "INVALID_MAPPING"), errorMessage(error), label);
  }

  const base: PreparedBase = {
    label,
    targetParts,
    castTo,
    transformFn,
    when: mapping.when,
    hasDefault: "default" in mapping,
    defaultValue: mapping.default,
  };

  if (hasSources) {
    if (!Array.isArray(mapping.sources) || mapping.sources.length === 0) {
      return asError("INVALID_MAPPING", "'sources' must be a non-empty array of paths", label);
    }
    if (transformFn === undefined) {
      return asError("INVALID_MAPPING", "'sources' requires a 'transform' function to combine the values", label);
    }
    if (mapping.lookup !== undefined) {
      return asError("INVALID_MAPPING", "'lookup' is not supported with 'sources'; do the lookup inside 'transform'", label);
    }
    const sourcesParts: string[][] = [];
    for (const path of mapping.sources) {
      const parts = parsePath(path);
      if (!parts) return asError("INVALID_MAPPING", `Malformed source path '${pathLabel(path)}'`, label);
      sourcesParts.push(parts);
    }
    return { ...base, kind: "multi", sourcesParts, transformFn };
  }

  const sourceParts = parsePath(mapping.source as Path);
  if (!sourceParts) {
    return asError("INVALID_MAPPING", `Malformed source path '${label.source}'`, label);
  }

  let lookupTable: LookupTable | undefined;
  try {
    if (mapping.lookup !== undefined) lookupTable = resolveLookup(mapping.lookup, registry);
  } catch (error) {
    return asError(codeOf(error, "INVALID_MAPPING"), errorMessage(error), label);
  }

  let arrayLevels = 0;
  for (const part of targetParts) if (part === "$") arrayLevels++;

  return {
    ...base,
    kind: "single",
    sourceParts,
    arrayLevels,
    lookupTable,
    first: mapping.first,
  };
}

function runSingle(
  prepared: PreparedSingle,
  input: unknown,
  result: Record<string, unknown>,
  errors: MappingError[],
  strict: boolean
): void {
  const push = (code: MappingErrorCode, message: string): void => {
    errors.push({ code, ...prepared.label, message });
  };

  let matches = extract(input, prepared.sourceParts);
  if (matches.length > 0) {
    matches = matches.filter((m) => m.value !== undefined);
  }

  if (matches.length === 0) {
    if (prepared.hasDefault) {
      matches = [{ value: prepared.defaultValue, path: [] }];
    } else {
      if (strict) {
        push("SOURCE_MISSING", `Source '${prepared.label.source}' resolved to no values`);
      }
      return; // Absent optional source: only an error in strict mode.
    }
  }

  if (prepared.when) {
    const kept: typeof matches = [];
    for (const match of matches) {
      try {
        if (prepared.when(match.value, input)) kept.push(match);
      } catch (error) {
        push("TRANSFORM_FAILED", `'when' threw: ${errorMessage(error)}`);
      }
    }
    matches = kept;
    if (matches.length === 0) return; // Skipped by predicate: silent by design.
  }

  if (prepared.first) {
    matches = matches.slice(0, 1);
  }

  if (prepared.arrayLevels === 0 && matches.length > 1) {
    push(
      "TARGET_CONFLICT",
      `Source resolved to ${matches.length} values but target is scalar; use first:true or a '$' target`
    );
    matches = matches.slice(0, 1);
  }

  for (const match of matches) {
    let value = match.value;
    try {
      if (prepared.lookupTable !== undefined) value = applyLookup(prepared.lookupTable, value);
      if (prepared.castTo !== undefined) value = applyCast(prepared.castTo, value);
      if (prepared.transformFn !== undefined) value = prepared.transformFn(value);
    } catch (error) {
      push(codeOf(error, "TRANSFORM_FAILED"), errorMessage(error));
      continue;
    }
    try {
      setValue(result, prepared.targetParts, value, match.path);
    } catch (error) {
      push(codeOf(error, "TARGET_CONFLICT"), errorMessage(error));
    }
  }
}

function runMulti(
  prepared: PreparedMulti,
  input: unknown,
  result: Record<string, unknown>,
  errors: MappingError[],
  strict: boolean
): void {
  const push = (code: MappingErrorCode, message: string): void => {
    errors.push({ code, ...prepared.label, message });
  };

  const values: unknown[] = [];
  let anyPresent = false;
  for (const parts of prepared.sourcesParts) {
    const found = extract(input, parts);
    let value: unknown;
    for (const candidate of found) {
      if (candidate.value !== undefined) {
        value = candidate.value;
        anyPresent = true;
        break;
      }
    }
    values.push(value);
  }

  let value: unknown;
  if (!anyPresent) {
    if (!prepared.hasDefault) {
      if (strict) push("SOURCE_MISSING", "All sources resolved to no values");
      return;
    }
    value = prepared.defaultValue; // Default is final: transform expects the values array.
  } else {
    if (prepared.when) {
      try {
        if (!prepared.when(values, input)) return;
      } catch (error) {
        return push("TRANSFORM_FAILED", `'when' threw: ${errorMessage(error)}`);
      }
    }
    try {
      value = prepared.transformFn(values);
    } catch (error) {
      return push(codeOf(error, "TRANSFORM_FAILED"), errorMessage(error));
    }
  }

  try {
    if (prepared.castTo !== undefined) value = applyCast(prepared.castTo, value);
    setValue(result, prepared.targetParts, value, []);
  } catch (error) {
    push(codeOf(error, "TARGET_CONFLICT"), errorMessage(error));
  }
}

/** Paths consumed by the mappings, for the `skipped` report. */
function consumedPaths(mappings: Mapping[]): Set<string> {
  const consumed = new Set<string>();
  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== "object") continue;
    const paths: Path[] = [];
    if (mapping.source !== undefined) paths.push(mapping.source);
    if (Array.isArray(mapping.sources)) paths.push(...mapping.sources);
    for (const path of paths) {
      const parts = parsePath(path);
      if (parts) consumed.add(parts.join("."));
    }
  }
  return consumed;
}

/** Options accepted by {@link compile} — everything in MapOptions except the per-call `into`. */
export type CompileOptions = Omit<MapOptions, "into">;

/** A reusable mapper produced by {@link compile}. */
export type CompiledMapper<T = Record<string, unknown>> = (
  input: unknown,
  callOptions?: Pick<MapOptions, "into">
) => MapResult<T>;

/**
 * Compile `mappings` once and get back a reusable mapper function. Paths
 * are parsed and registry references resolved a single time, so calling
 * the compiled mapper in a loop is significantly faster than calling
 * {@link map} repeatedly with the same mappings.
 *
 * @example
 * const toOrder = compile([{ source: "id", target: "order.id", cast: "number" }]);
 * for (const row of rows) results.push(toOrder(row).result);
 */
export function compile<T = Record<string, unknown>>(
  mappings: Mapping[],
  options: CompileOptions = {}
): CompiledMapper<T> {
  if (!Array.isArray(mappings)) {
    throw new TypeError("mappings must be an array of Mapping objects");
  }

  const prepared = mappings.map((mapping) => prepareMapping(mapping, options.registry));
  const consumed = consumedPaths(mappings);
  const strict = options.strict === true;

  return (input: unknown, callOptions: Pick<MapOptions, "into"> = {}): MapResult<T> => {
    const result = callOptions.into ?? {};
    const errors: MappingError[] = [];

    for (const p of prepared) {
      if (p.kind === "error") errors.push({ ...p.error });
      else if (p.kind === "single") runSingle(p, input, result, errors, strict);
      else runMulti(p, input, result, errors, strict);
    }

    if (options.compactArrays) {
      compactArraysDeep(result);
    }

    return {
      result: result as T,
      skipped: leafPaths(input).filter((path) => !consumed.has(path)),
      errors,
    };
  };
}

/**
 * Remap `input` into a new object according to `mappings`.
 *
 * Never throws for per-mapping problems — every failure is collected in the
 * returned `errors` array so a partial result is always available.
 * For repeated use of the same mappings, {@link compile} once instead.
 *
 * @example
 * const { result } = map(
 *   { request: { order: { id: "1" } } },
 *   [{ source: "request.order.id", target: "app.ordering.number", cast: "number" }]
 * );
 * // result === { app: { ordering: { number: 1 } } }
 */
export function map<T = Record<string, unknown>>(
  input: unknown,
  mappings: Mapping[],
  options: MapOptions = {}
): MapResult<T> {
  return compile<T>(mappings, options)(input, { into: options.into });
}

export {
  compactArraysDeep,
  extract,
  leafPaths,
  parsePath,
  pathLabel,
  setValue,
  isUnsafeKey,
} from "./paths.js";
export {
  applyCast,
  applyLookup,
  resolveLookup,
  resolveTransform,
  BUILTIN_TRANSFORMS,
} from "./transform.js";
export { validateMappings } from "./validate.js";
export type { ValidationIssue, ValidationCode } from "./validate.js";
