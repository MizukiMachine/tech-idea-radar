export function validateObject<T>(
  value: unknown,
  requiredPaths: string[],
  label: string,
): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new Error(`${label}: expected object, got ${value === null ? 'null' : typeof value}`);
  }

  for (const path of requiredPaths) {
    const parts = path.split('.');
    let current: unknown = value;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        throw new Error(`${label}: missing required property "${path}" (failed at "${part}")`);
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (current === undefined) {
      throw new Error(`${label}: missing required property "${path}"`);
    }
    if (Array.isArray(current) && current.length === 0) {
      console.warn(`${label}: required array "${path}" is empty — proceeding with degraded data`);
    }
  }

  return value as T;
}
