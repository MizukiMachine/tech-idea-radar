export class PromptBuilder {
  private static readonly placeholderPattern = /\$\{([A-Za-z0-9_.-]+)\}|\{\{([A-Za-z0-9_.-]+)\}\}|\{([A-Za-z0-9_.-]+)\}/g;

  static findPlaceholders(template: string): string[] {
    const placeholders = new Set<string>();
    for (const match of template.matchAll(this.placeholderPattern)) {
      const name = match[1] ?? match[2] ?? match[3];
      if (name) placeholders.add(name);
    }
    return [...placeholders];
  }

  static build(
    template: string,
    variables: Record<string, string>,
    options: { strict?: boolean } = {},
  ): string {
    if (options.strict) {
      const missing = this.findPlaceholders(template).filter((name) => !(name in variables));
      if (missing.length > 0) {
        throw new Error(`Missing prompt variables: ${missing.join(', ')}`);
      }
    }

    return template.replace(this.placeholderPattern, (match, dollarName, mustacheName, braceName) => {
      const name = dollarName ?? mustacheName ?? braceName;
      return name in variables ? variables[name] : match;
    });
  }
}
