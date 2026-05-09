export class PromptBuilder {
  static build(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\{${escaped}\\}`, 'g'), () => value);
    }
    return result;
  }
}
