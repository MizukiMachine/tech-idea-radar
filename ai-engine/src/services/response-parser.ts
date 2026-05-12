export class ResponseParser {
  static parse<T>(raw: string): T {
    // Try code block extraction first (```json ... ```)
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    }

    // Try JSON object extraction
    const jsonObj = ResponseParser.extractJsonObject(raw);
    if (jsonObj) {
      return JSON.parse(jsonObj) as T;
    }

    // Try JSON array extraction
    const jsonArr = ResponseParser.extractJsonArray(raw);
    if (jsonArr) {
      return JSON.parse(jsonArr) as T;
    }

    const preview = raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
    throw new Error(`Failed to extract JSON from LLM response. Response preview: ${preview}`);
  }

  private static extractJsonObject(text: string): string | null {
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let bestStart = -1;
    let bestEnd = -1;

    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{') {
        if (depth === 0) bestStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && bestStart !== -1) bestEnd = i;
      }
    }

    if (bestStart === -1 || bestEnd === -1) return null;
    const candidate = text.slice(bestStart, bestEnd + 1);
    try { JSON.parse(candidate); return candidate; } catch { return null; }
  }

  private static extractJsonArray(text: string): string | null {
    const firstBracket = text.indexOf('[');
    if (firstBracket === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let bestStart = -1;
    let bestEnd = -1;

    for (let i = firstBracket; i < text.length; i++) {
      const ch = text[i];

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '[') {
        if (depth === 0) bestStart = i;
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0 && bestStart !== -1) bestEnd = i;
      }
    }

    if (bestStart === -1 || bestEnd === -1) return null;
    const candidate = text.slice(bestStart, bestEnd + 1);
    try { JSON.parse(candidate); return candidate; } catch { return null; }
  }
}
