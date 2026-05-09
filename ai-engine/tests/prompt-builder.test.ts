import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../src/services/prompt-builder';

describe('PromptBuilder', () => {
  it('replaces single variable', () => {
    const result = PromptBuilder.build('Hello {name}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    const result = PromptBuilder.build('{a} and {b}', { a: 'X', b: 'Y' });
    expect(result).toBe('X and Y');
  });

  it('replaces repeated occurrences', () => {
    const result = PromptBuilder.build('{x}-{x}', { x: 'val' });
    expect(result).toBe('val-val');
  });

  it('handles special regex characters in variable names', () => {
    const result = PromptBuilder.build('value is {data.input}', { 'data.input': 'OK' });
    expect(result).toBe('value is OK');
  });

  it('leaves unreferenced variables as-is', () => {
    const result = PromptBuilder.build('{a} {b}', { a: 'X' });
    expect(result).toBe('X {b}');
  });

  it('handles empty variables object', () => {
    const result = PromptBuilder.build('{a} static', {});
    expect(result).toBe('{a} static');
  });

  it('handles empty value', () => {
    const result = PromptBuilder.build('{a}', { a: '' });
    expect(result).toBe('');
  });

  it('handles value containing braces', () => {
    const result = PromptBuilder.build('{json}', { json: '{"nested": true}' });
    expect(result).toBe('{"nested": true}');
  });
});
