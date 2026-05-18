import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { PromptBuilder } from './prompt-builder';

type PromptRole = 'system' | 'user' | 'assistant';
type InputSensitivity = 'public' | 'user_provided' | 'confidential' | 'secret' | 'forbidden';
type InputRenderMode = 'inline' | 'json' | 'markdown';

interface PromptInputDefinition {
  name: string;
  type: string;
  required: boolean;
  sensitivity: InputSensitivity;
  render_as: InputRenderMode;
}

interface PromptMessageTemplate {
  role: PromptRole;
  content: string;
}

interface PromptTemplate {
  id: string;
  version: number;
  description: string;
  inputs: PromptInputDefinition[];
  messages: PromptMessageTemplate[];
  materials: Record<string, unknown>;
}

interface PromptCatalogFile {
  id: string;
  version: number;
  description: string;
  prompts: Record<string, PromptTemplate>;
}

const TEMPLATE_CONTROL_KEYS = new Set([
  'id',
  'version',
  'title',
  'description',
  'inputs',
  'messages',
  'examples',
  'changelog',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
}

function stringField(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label}.${key} must be an integer`);
  }
  return value;
}

function normalizeInput(value: unknown, label: string): PromptInputDefinition {
  assertRecord(value, label);
  const sensitivity = value.sensitivity ?? 'public';
  const renderAs = value.render_as ?? 'inline';
  if (!['public', 'user_provided', 'confidential', 'secret', 'forbidden'].includes(String(sensitivity))) {
    throw new Error(`${label}.sensitivity is invalid`);
  }
  if (!['inline', 'json', 'markdown'].includes(String(renderAs))) {
    throw new Error(`${label}.render_as is invalid`);
  }

  return {
    name: stringField(value, 'name', label),
    type: stringField(value, 'type', label),
    required: value.required !== false,
    sensitivity: sensitivity as InputSensitivity,
    render_as: renderAs as InputRenderMode,
  };
}

function normalizeMessage(value: unknown, label: string): PromptMessageTemplate {
  assertRecord(value, label);
  const role = stringField(value, 'role', label);
  if (!['system', 'user', 'assistant'].includes(role)) {
    throw new Error(`${label}.role is invalid`);
  }
  return {
    role: role as PromptRole,
    content: stringField(value, 'content', label),
  };
}

function materialEntries(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !TEMPLATE_CONTROL_KEYS.has(key)),
  );
}

function normalizeTemplate(value: unknown, label: string): PromptTemplate {
  assertRecord(value, label);
  const rawInputs = value.inputs ?? [];
  if (!Array.isArray(rawInputs)) throw new Error(`${label}.inputs must be an array`);
  const rawMessages = value.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new Error(`${label}.messages must be a non-empty array`);
  }

  const template: PromptTemplate = {
    id: stringField(value, 'id', label),
    version: numberField(value, 'version', label),
    description: stringField(value, 'description', label),
    inputs: rawInputs.map((input, index) => normalizeInput(input, `${label}.inputs[${index}]`)),
    messages: rawMessages.map((message, index) => normalizeMessage(message, `${label}.messages[${index}]`)),
    materials: materialEntries(value),
  };

  validateTemplateContract(template, label);
  return template;
}

function validateTemplateContract(template: PromptTemplate, label: string): void {
  const inputNames = new Set(template.inputs.map((input) => input.name));
  if (inputNames.size !== template.inputs.length) {
    throw new Error(`${label}.inputs contains duplicate names`);
  }

  const materialNames = new Set(Object.keys(template.materials));
  const placeholders = new Set(
    template.messages.flatMap((message) => PromptBuilder.findPlaceholders(message.content)),
  );
  const allowedNames = new Set([...inputNames, ...materialNames]);
  const unknownPlaceholders = [...placeholders].filter((name) => !allowedNames.has(name));
  if (unknownPlaceholders.length > 0) {
    throw new Error(`${label} has undeclared placeholders: ${unknownPlaceholders.join(', ')}`);
  }

  const unusedInputs = [...inputNames].filter((name) => !placeholders.has(name));
  if (unusedInputs.length > 0) {
    throw new Error(`${label}.inputs has unused entries: ${unusedInputs.join(', ')}`);
  }

  const unusedMaterials = [...materialNames].filter((name) => !placeholders.has(name));
  if (unusedMaterials.length > 0) {
    throw new Error(`${label} has unused prompt materials: ${unusedMaterials.join(', ')}`);
  }
}

function normalizeCatalog(value: unknown): PromptCatalogFile {
  assertRecord(value, 'prompt catalog');
  const rawPrompts = value.prompts;
  assertRecord(rawPrompts, 'prompt catalog.prompts');

  return {
    id: stringField(value, 'id', 'prompt catalog'),
    version: numberField(value, 'version', 'prompt catalog'),
    description: stringField(value, 'description', 'prompt catalog'),
    prompts: Object.fromEntries(
      Object.entries(rawPrompts).map(([key, prompt]) => [key, normalizeTemplate(prompt, `prompts.${key}`)]),
    ),
  };
}

function resolveCatalogPath(): string {
  const candidates = [
    path.resolve(__dirname, '../prompts/catalog.yaml'),
    path.resolve(process.cwd(), 'src/prompts/catalog.yaml'),
    path.resolve(process.cwd(), 'ai-engine/src/prompts/catalog.yaml'),
  ];
  const catalogPath = candidates.find((candidate) => existsSync(candidate));
  if (!catalogPath) {
    throw new Error(`Prompt catalog not found. Tried: ${candidates.join(', ')}`);
  }
  return catalogPath;
}

function renderMaterial(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n');
  }
  if (typeof value === 'string') return value.trimEnd();
  return JSON.stringify(value, null, 2);
}

function renderInputValue(input: PromptInputDefinition, value: unknown): string {
  if ((value === undefined || value === null) && input.required) {
    throw new Error(`Missing required prompt input: ${input.name}`);
  }
  if (input.sensitivity === 'secret' || input.sensitivity === 'forbidden') {
    throw new Error(`Prompt input ${input.name} is marked ${input.sensitivity} and cannot be rendered`);
  }

  if (input.render_as === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
  if (Array.isArray(value)) return value.join(', ');
  if (isRecord(value)) return JSON.stringify(value, null, 2);
  return String(value ?? '');
}

class PromptCatalog {
  constructor(private readonly catalog: PromptCatalogFile) {}

  static load(catalogPath = resolveCatalogPath()): PromptCatalog {
    const parsed = parse(readFileSync(catalogPath, 'utf8'));
    return new PromptCatalog(normalizeCatalog(parsed));
  }

  keys(): string[] {
    return Object.keys(this.catalog.prompts);
  }

  renderRole(promptKey: string, role: PromptRole, variables: Record<string, unknown> = {}): string {
    const template = this.catalog.prompts[promptKey];
    if (!template) throw new Error(`Unknown prompt template: ${promptKey}`);

    const message = template.messages.find((candidate) => candidate.role === role);
    if (!message) throw new Error(`Prompt template ${promptKey} does not define a ${role} message`);

    const inputByName = new Map(template.inputs.map((input) => [input.name, input]));
    const extraVariables = Object.keys(variables).filter((name) => !inputByName.has(name));
    if (extraVariables.length > 0) {
      throw new Error(`Undeclared prompt inputs for ${promptKey}: ${extraVariables.join(', ')}`);
    }

    const replacements: Record<string, string> = Object.fromEntries(
      Object.entries(template.materials).map(([key, value]) => [key, renderMaterial(value)]),
    );
    for (const [name, value] of Object.entries(variables)) {
      const input = inputByName.get(name);
      if (!input) continue;
      replacements[name] = renderInputValue(input, value);
    }

    return PromptBuilder.build(message.content, replacements, { strict: true });
  }
}

const defaultPromptCatalog = PromptCatalog.load();

export function listPromptTemplateKeys(): string[] {
  return defaultPromptCatalog.keys();
}

export function renderPromptRole(
  promptKey: string,
  role: PromptRole,
  variables: Record<string, unknown> = {},
): string {
  return defaultPromptCatalog.renderRole(promptKey, role, variables);
}
