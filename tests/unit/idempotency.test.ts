import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildIdnumber,
  buildSectionIdnumber,
  isMcpIdnumber,
  IDNUMBER_PREFIX,
  IDNUMBER_HASH_LEN,
} from '../../src/utils/idempotency.js';

function expectedSha1Slice(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex').slice(0, IDNUMBER_HASH_LEN);
}

describe('buildIdnumber', () => {
  it('prepends "mcp:<kind>:" and a 20-hex hash tail', () => {
    const id = buildIdnumber('module', 'ai-fundamentals-2026-u1-c1|exercise-1');
    expect(id.startsWith('mcp:module:')).toBe(true);
    expect(id.length).toBe(
      IDNUMBER_PREFIX.length + 'module'.length + 1 + IDNUMBER_HASH_LEN,
    );
  });

  it('tail is 20 lowercase hex chars', () => {
    const id = buildIdnumber('quiz', '42-my-quiz');
    const tail = id.slice('mcp:quiz:'.length);
    expect(tail).toMatch(/^[0-9a-f]{20}$/);
  });

  it('is deterministic', () => {
    const id1 = buildIdnumber('module', 'lesson-1|comp-1');
    const id2 = buildIdnumber('module', 'lesson-1|comp-1');
    expect(id1).toBe(id2);
  });

  it('matches sha1(kind + "|" + key) truncated', () => {
    const id = buildIdnumber('module', 'lesson-1|comp-1');
    expect(id).toBe('mcp:module:' + expectedSha1Slice('module|lesson-1|comp-1'));
  });

  it('produces different ids for different keys of the same kind', () => {
    const a = buildIdnumber('module', 'lesson-1|comp-1');
    const b = buildIdnumber('module', 'lesson-1|comp-2');
    expect(a).not.toBe(b);
  });

  it('produces different ids for the same key under different kinds', () => {
    const a = buildIdnumber('course', 'ai-fundamentals-2026');
    const b = buildIdnumber('quiz', 'ai-fundamentals-2026');
    expect(a).not.toBe(b);
  });

  it('trims surrounding whitespace before hashing (avoids copy-paste drift)', () => {
    const clean = buildIdnumber('module', 'lesson-1|comp-1');
    const messy = buildIdnumber('module', '  lesson-1|comp-1 \n');
    expect(messy).toBe(clean);
  });

  it('throws on empty kind', () => {
    expect(() => buildIdnumber('' as never, 'c')).toThrow(/kind/);
    expect(() => buildIdnumber('   ' as never, 'c')).toThrow(/kind/);
  });

  it('throws on empty key', () => {
    expect(() => buildIdnumber('module', '')).toThrow(/key/);
    expect(() => buildIdnumber('module', '   ')).toThrow(/key/);
  });
});

describe('buildSectionIdnumber', () => {
  it('equals buildIdnumber("section", lessonId)', () => {
    const lessonId = 'ai-fundamentals-2026-u1-c1';
    expect(buildSectionIdnumber(lessonId)).toBe(buildIdnumber('section', lessonId));
  });

  it('matches the documented formula', () => {
    const lessonId = 'lesson-x';
    expect(buildSectionIdnumber(lessonId)).toBe(
      'mcp:section:' + expectedSha1Slice('section|lesson-x'),
    );
  });
});

describe('isMcpIdnumber', () => {
  it('accepts well-formed ids produced by buildIdnumber', () => {
    expect(isMcpIdnumber(buildIdnumber('module', 'lesson-1|comp-1'))).toBe(true);
    expect(isMcpIdnumber(buildSectionIdnumber('f'))).toBe(true);
    expect(isMcpIdnumber('mcp:quiz:abcdef0123456789abcd')).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isMcpIdnumber('mcp:short')).toBe(false);
    expect(isMcpIdnumber('mcp:module:' + 'g'.repeat(20))).toBe(false); // non-hex char
    expect(isMcpIdnumber('mcp:module:')).toBe(false);
    expect(isMcpIdnumber('other:aaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isMcpIdnumber('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isMcpIdnumber(null)).toBe(false);
    expect(isMcpIdnumber(undefined)).toBe(false);
    expect(isMcpIdnumber(42)).toBe(false);
    expect(isMcpIdnumber({})).toBe(false);
  });
});
