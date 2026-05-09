import { describe, it, expect } from 'vitest';
import { ResponseParser } from '../src/services/response-parser';

describe('ResponseParser', () => {
  it('parses plain JSON object', () => {
    const input = '{"key": "value", "num": 42}';
    expect(ResponseParser.parse(input)).toEqual({ key: 'value', num: 42 });
  });

  it('parses JSON in code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(ResponseParser.parse(input)).toEqual({ key: 'value' });
  });

  it('parses JSON in code block without language tag', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(ResponseParser.parse(input)).toEqual({ key: 'value' });
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is the result:\n{"nested": {"deep": true}}\nEnd of response.';
    expect(ResponseParser.parse(input)).toEqual({ nested: { deep: true } });
  });

  it('handles JSON with strings containing braces', () => {
    const input = '{"text": "some {braces} here", "num": 1}';
    expect(ResponseParser.parse(input)).toEqual({ text: 'some {braces} here', num: 1 });
  });

  it('handles JSON with escaped quotes', () => {
    const input = '{"text": "He said \\"hello\\""}';
    expect(ResponseParser.parse(input)).toEqual({ text: 'He said "hello"' });
  });

  it('handles JSON with arrays', () => {
    const input = '{"items": [1, 2, 3], "name": "test"}';
    expect(ResponseParser.parse(input)).toEqual({ items: [1, 2, 3], name: 'test' });
  });

  it('throws on non-JSON response with preview in error', () => {
    expect(() => ResponseParser.parse('no json here')).toThrow(/Response preview:/);
  });

  it('throws on non-JSON response with short message', () => {
    expect(() => ResponseParser.parse('no json here')).toThrow(/no json here/);
  });

  it('handles deeply nested JSON', () => {
    const input = '{"a": {"b": {"c": {"d": 1}}}}';
    expect(ResponseParser.parse(input)).toEqual({ a: { b: { c: { d: 1 } } } });
  });

  it('handles JSON with null values', () => {
    const input = '{"value": null}';
    expect(ResponseParser.parse(input)).toEqual({ value: null });
  });

  it('handles JSON with unicode', () => {
    const input = '{"name": "\\u3042"}';
    expect(ResponseParser.parse(input)).toEqual({ name: 'あ' });
  });
});
