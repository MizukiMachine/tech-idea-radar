import { describe, it, expect } from 'vitest';
import { validateObject } from '../src/services/output-validator';

describe('validateObject', () => {
  it('returns object when all required paths exist', () => {
    const obj = { a: { b: 1 }, c: [1, 2] };
    const result = validateObject(obj, ['a.b', 'c'], 'Test');
    expect(result).toBe(obj);
  });

  it('throws on null input', () => {
    expect(() => validateObject(null, ['a'], 'Test')).toThrow(/expected object, got null/);
  });

  it('throws on undefined input', () => {
    expect(() => validateObject(undefined, ['a'], 'Test')).toThrow(/expected object, got undefined/);
  });

  it('throws on primitive input', () => {
    expect(() => validateObject('string', ['a'], 'Test')).toThrow(/expected object, got string/);
  });

  it('throws on missing top-level property', () => {
    expect(() => validateObject({ a: 1 }, ['b'], 'Test')).toThrow(/missing required property "b"/);
  });

  it('throws when intermediate key is missing', () => {
    // { a: {} } → a.b is undefined → fails at "b" iteration next
    expect(() => validateObject({ a: {} }, ['a.b'], 'Test')).toThrow(/missing required property "a.b"/);
  });

  it('throws when leaf key is missing', () => {
    expect(() => validateObject({ a: { b: {} } }, ['a.b.c'], 'Test')).toThrow(/missing required property "a.b.c"/);
  });

  it('throws on undefined nested property', () => {
    expect(() => validateObject({ a: { b: undefined } }, ['a.b'], 'Test')).toThrow(/missing required property "a.b"/);
  });

  it('warns but does not throw on empty array', () => {
    const obj = { a: [] };
    const result = validateObject(obj, ['a'], 'Test');
    expect(result).toEqual({ a: [] });
  });

  it('handles multiple required paths', () => {
    const obj = { a: 1, b: { c: 2 }, d: [1] };
    const result = validateObject(obj, ['a', 'b.c', 'd'], 'Test');
    expect(result).toBe(obj);
  });

  it('fails on first missing path', () => {
    const obj = { a: 1 };
    expect(() => validateObject(obj, ['a', 'b.missing'], 'Test')).toThrow(/missing required property "b.missing"/);
  });

  it('handles deeply nested paths', () => {
    const obj = { a: { b: { c: { d: 'deep' } } } };
    const result = validateObject(obj, ['a.b.c.d'], 'Test');
    expect(result).toBe(obj);
  });

  it('preserves type assertion', () => {
    const obj = { name: 'test', value: 42 };
    const result = validateObject<{ name: string; value: number }>(obj, ['name', 'value'], 'Test');
    expect(result.name).toBe('test');
    expect(result.value).toBe(42);
  });
});
