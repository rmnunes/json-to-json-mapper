/**
 * Path utilities for reading from and writing to nested objects using
 * dot-notation strings such as `request.order.id`.
 *
 * These helpers are pure: they never rely on module-level state, so `map`
 * can be called any number of times, concurrently, without cross-talk.
 */

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
 * Collect every value reachable at `parts` within `node`.
 *
 * Arrays encountered *in the middle* of the path are transparent: the
 * remaining path is applied to each element, and the element index is
 * recorded in `path`. An array reached at the *end* of the path is returned
 * as-is (copied verbatim). Missing keys yield no entry rather than throwing,
 * so optional and heterogeneous fields are handled gracefully.
 */
export function extract(node: unknown, parts: string[]): Extracted[] {
  if (parts.length === 0) {
    return [{ value: node, path: [] }];
  }

  if (Array.isArray(node)) {
    const out: Extracted[] = [];
    node.forEach((element, index) => {
      for (const found of extract(element, parts)) {
        out.push({ value: found.value, path: [index, ...found.path] });
      }
    });
    return out;
  }

  if (!isObject(node)) {
    return [];
  }

  const [head, ...rest] = parts;
  if (!Object.prototype.hasOwnProperty.call(node, head)) {
    return [];
  }
  return extract(node[head], rest);
}

/**
 * Write `value` into `root` at the target `parts`.
 *
 * A `$` segment denotes an array level; the concrete index is taken from
 * `indices` in order (defaulting to 0). Intermediate containers are created
 * on demand — an object, unless the following segment is `$`, in which case
 * an array. Unsafe keys throw before any mutation happens.
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
        throw new Error(`Target segment '$' expects an array but found ${typeof node}`);
      }
      const index = indices[indexCursor++] ?? 0;
      if (isLast) {
        node[index] = value;
      } else {
        if (!isObject(node[index]) && !Array.isArray(node[index])) {
          node[index] = parts[i + 1] === "$" ? [] : {};
        }
        node = node[index];
      }
      continue;
    }

    if (isUnsafeKey(key)) {
      throw new Error(`Refusing to write unsafe target key '${key}'`);
    }

    if (isLast) {
      node[key] = value;
    } else {
      const nextIsArray = parts[i + 1] === "$";
      if (!isObject(node[key]) && !Array.isArray(node[key])) {
        node[key] = nextIsArray ? [] : {};
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
