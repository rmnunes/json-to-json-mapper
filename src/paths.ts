/**
 * Path utilities for reading from and writing to nested objects using
 * dot-notation strings such as `request.order.id`.
 *
 * These helpers are pure: they never rely on module-level state, so `map`
 * can be called any number of times, concurrently, without cross-talk.
 */

import { CodedError } from "./errors.js";

/** Keys that must never be written, to prevent prototype pollution. */
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A value extracted from the source, tagged with the array indices it came from. */
export interface Extracted {
  value: unknown;
  /** Array indices encountered while descending, outermost first. */
  path: number[];
}

/**
 * A path into a JSON structure: either a dot-notation string
 * (`"request.order.id"`, with `\.` escaping a literal dot) or an array of
 * raw segments (`["a.b", "c"]`) for keys that contain dots. The array form
 * is the canonical representation; the string form is sugar.
 */
export type Path = string | string[];

const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

/**
 * Normalize a {@link Path} to its segments, or return `null` when the path
 * is malformed (empty path, empty segment, or a non-string segment).
 *
 * String parsing honors `\.` (literal dot) and `\\` (literal backslash);
 * any other backslash is kept verbatim.
 */
export function parsePath(path: Path): string[] | null {
  if (Array.isArray(path)) {
    if (path.length === 0) return null;
    for (const segment of path) {
      if (typeof segment !== "string" || segment.length === 0) return null;
    }
    return [...path];
  }
  if (typeof path !== "string" || path.length === 0) return null;

  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === "\\" && (path[i + 1] === "." || path[i + 1] === "\\")) {
      current += path[i + 1];
      i++;
    } else if (char === ".") {
      if (current.length === 0) return null;
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.length === 0) return null;
  parts.push(current);
  return parts;
}

/** Human-readable label for a path, used in error entries and `skipped`. */
export function pathLabel(path: Path): string {
  if (Array.isArray(path)) return path.join(".");
  return typeof path === "string" ? path : String(path);
}

/**
 * Collect every value reachable at `parts` within `node`.
 *
 * Arrays encountered *in the middle* of the path are transparent: the
 * remaining path is applied to each element, and the element index is
 * recorded in `path`. A numeric segment (e.g. `order.0.id`) instead picks
 * that single element deliberately, without recording an index. An array
 * reached at the *end* of the path is returned as-is (copied verbatim).
 * Missing keys yield no entry rather than throwing, so optional and
 * heterogeneous fields are handled gracefully.
 */
export function extract(node: unknown, parts: string[]): Extracted[] {
  const out: Extracted[] = [];
  extractInto(node, parts, 0, [], out);
  return out;
}

/** Index-based recursion: no per-level array slicing/spreading (hot path). */
function extractInto(
  node: unknown,
  parts: string[],
  offset: number,
  indexTrail: number[],
  out: Extracted[]
): void {
  if (offset === parts.length) {
    out.push({ value: node, path: indexTrail.slice() });
    return;
  }

  if (Array.isArray(node)) {
    const head = parts[offset];
    if (ARRAY_INDEX.test(head)) {
      const index = Number(head);
      if (index < node.length) extractInto(node[index], parts, offset + 1, indexTrail, out);
      return;
    }
    for (let index = 0; index < node.length; index++) {
      indexTrail.push(index);
      extractInto(node[index], parts, offset, indexTrail, out);
      indexTrail.pop();
    }
    return;
  }

  if (!isObject(node)) {
    return;
  }

  const head = parts[offset];
  if (!Object.prototype.hasOwnProperty.call(node, head)) {
    return;
  }
  extractInto(node[head], parts, offset + 1, indexTrail, out);
}

/** Should the container created for `segment` be an array? */
function segmentWantsArray(segment: string | undefined): boolean {
  return segment === "$" || (segment !== undefined && ARRAY_INDEX.test(segment));
}

/**
 * Write `value` into `root` at the target `parts`.
 *
 * A `$` segment denotes an array level whose concrete index is taken from
 * `indices` in order (defaulting to 0). A numeric segment (`coords.0`)
 * addresses an explicit array position when the container is an array —
 * containers created on demand become arrays whenever the *next* segment is
 * `$` or numeric, otherwise objects. On a pre-existing plain object, a
 * numeric segment falls back to being an ordinary key, so `into` targets
 * keep their shape. Unsafe keys throw before any mutation happens.
 */
export function setValue(
  root: Record<string, unknown> | unknown[],
  parts: string[],
  value: unknown,
  indices: number[]
): void {
  let node: any = root;
  let indexCursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const isLast = i === parts.length - 1;

    if (key === "$") {
      if (!Array.isArray(node)) {
        throw new CodedError(
          "TARGET_CONFLICT",
          `Target segment '$' expects an array but found ${typeof node}`
        );
      }
      const index = indices[indexCursor++] ?? 0;
      if (isLast) {
        node[index] = value;
      } else {
        if (!isObject(node[index]) && !Array.isArray(node[index])) {
          node[index] = segmentWantsArray(parts[i + 1]) ? [] : {};
        }
        node = node[index];
      }
      continue;
    }

    if (Array.isArray(node) && ARRAY_INDEX.test(key)) {
      const index = Number(key);
      if (isLast) {
        node[index] = value;
      } else {
        if (!isObject(node[index]) && !Array.isArray(node[index])) {
          node[index] = segmentWantsArray(parts[i + 1]) ? [] : {};
        }
        node = node[index];
      }
      continue;
    }

    if (isUnsafeKey(key)) {
      throw new CodedError("UNSAFE_TARGET", `Refusing to write unsafe target key '${key}'`);
    }

    if (isLast) {
      node[key] = value;
    } else {
      if (!isObject(node[key]) && !Array.isArray(node[key])) {
        node[key] = segmentWantsArray(parts[i + 1]) ? [] : {};
      }
      node = node[key];
    }
  }
}

/**
 * List every leaf path in `node` using dot notation. Array indices are
 * collapsed, so `{ order: [{ id: 1 }] }` yields `order.id` (matching how
 * sources are written). Duplicates are removed, preserving first-seen order.
 */
export function leafPaths(node: unknown): string[] {
  const out: string[] = [];
  walkLeaves(node, "", out);
  const seen = new Set<string>();
  return out.filter((path) => (seen.has(path) ? false : seen.add(path)));
}

/**
 * Recursively remove holes (never-assigned slots) from every array in
 * `node`, in place for objects, returning dense arrays. Assigned `null`s
 * are kept — only true holes (`!(i in array)`) are dropped.
 */
export function compactArraysDeep(node: unknown): unknown {
  if (Array.isArray(node)) {
    const dense: unknown[] = [];
    for (let i = 0; i < node.length; i++) {
      if (i in node) dense.push(compactArraysDeep(node[i]));
    }
    return dense;
  }
  if (isObject(node)) {
    for (const key of Object.keys(node)) {
      node[key] = compactArraysDeep(node[key]);
    }
    return node;
  }
  return node;
}

function walkLeaves(node: unknown, prefix: string, out: string[]): void {
  if (Array.isArray(node)) {
    for (const element of node) walkLeaves(element, prefix, out);
    return;
  }
  if (isObject(node)) {
    for (const key of Object.keys(node)) {
      const next = prefix ? `${prefix}.${key}` : key;
      walkLeaves(node[key], next, out);
    }
    return;
  }
  if (prefix) out.push(prefix);
}
