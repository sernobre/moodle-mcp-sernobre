import { createHash } from 'node:crypto';

/**
 * Prefix used to tag every Moodle `idnumber` managed by this MCP.
 * Lets operators grep / list / clean up MCP-owned resources in Moodle.
 */
export const IDNUMBER_PREFIX = 'mcp:';

/** Length of the hex hash slice appended after the `kind:` segment. 20 hex chars = 80 bits of entropy. */
export const IDNUMBER_HASH_LEN = 20;

/**
 * Entity kinds this MCP can own an `idnumber` for. The kind is embedded in
 * the idnumber (`mcp:<kind>:<hash>`) so operators can filter by type and we
 * never produce ambiguous ids.
 */
export type IdnumberKind =
  | 'course'
  | 'section'
  | 'module'
  | 'quiz'
  | 'question-category'
  | 'question'
  | 'user'
  | 'group'
  | 'badge'
  | 'calendar-event'
  | 'forum';

/**
 * Build a stable Moodle `idnumber` for an entity of `kind`, based on
 * `sha1(kind + "|" + key)` truncated to {@link IDNUMBER_HASH_LEN} hex
 * characters and prefixed with `mcp:<kind>:`.
 *
 * Determinism of this function is what makes every write an upsert — the same
 * (kind, key) maps to the same `idnumber` forever.
 *
 * Inputs are normalised: whitespace around the key is trimmed and the empty
 * key is rejected (an empty key would yield a hash that collides across
 * different entities — a real correctness risk, not a style issue).
 *
 * @example
 * buildIdnumber('course', 'ai-fundamentals-2026')
 *   // => "mcp:course:91f82a17c9de31a6b9e0"
 */
export function buildIdnumber(kind: IdnumberKind, key: string): string {
  const k = assertNonEmpty(kind, 'kind');
  const cleaned = assertNonEmpty(key, 'key');
  const hash = createHash('sha1')
    .update(`${k}|${cleaned}`, 'utf8')
    .digest('hex')
    .slice(0, IDNUMBER_HASH_LEN);
  return `${IDNUMBER_PREFIX}${k}:${hash}`;
}

/**
 * Shortcut for the Moodle section that holds a whole lesson.
 */
export function buildSectionIdnumber(lessonId: string): string {
  return buildIdnumber('section', lessonId);
}

/**
 * Type guard: returns true iff `value` looks like an idnumber this MCP would
 * have produced (has the correct `mcp:` prefix, a `kind` segment, and a hex
 * tail of at least {@link IDNUMBER_HASH_LEN} characters).
 */
export function isMcpIdnumber(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(IDNUMBER_PREFIX)) return false;
  const m = /^mcp:([a-z-]+):([0-9a-f]+)$/.exec(value);
  if (!m) return false;
  const tail = m[2];
  return tail !== undefined && tail.length >= IDNUMBER_HASH_LEN;
}

function assertNonEmpty(value: string, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`${name} must not be empty`);
  }
  return trimmed;
}
