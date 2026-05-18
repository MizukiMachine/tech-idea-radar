import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'prompts');
const destination = path.join(root, 'dist', 'prompts');

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, {
  recursive: true,
  filter: (entry) => entry.endsWith('.yaml') || !path.extname(entry),
});
