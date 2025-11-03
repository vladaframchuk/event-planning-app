import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const frontendRoot = path.resolve(currentDir, '..');
const trackedExtensions = new Set(['.tsx', '.ts', '.jsx', '.js', '.json', '.md']);
const ignoredDirectories = new Set(['node_modules', '.next', '.git']);

const decoder1251 = new TextDecoder('windows-1251');

const mojibakeMap: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (let byte = 0; byte < 256; byte += 1) {
    const decoded = decoder1251.decode(Uint8Array.of(byte));
    const mojibake = decoder1251.decode(Buffer.from(decoded, 'utf8'));
    if (mojibake !== decoded) {
      map.set(mojibake, decoded);
    }
  }
  return map;
})();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replacementPattern = new RegExp(
  Array.from(mojibakeMap.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|'),
  'g',
);

const collectFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (trackedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
};

const fixFile = (filePath: string): boolean => {
  const content = fs.readFileSync(filePath, 'utf8');

  replacementPattern.lastIndex = 0;
  if (!replacementPattern.test(content)) {
    return false;
  }

  replacementPattern.lastIndex = 0;
  const fixed = content.replace(replacementPattern, (match) => mojibakeMap.get(match) ?? match);

  if (fixed === content) {
    return false;
  }

  fs.writeFileSync(filePath, fixed, 'utf8');
  return true;
};

const main = (): void => {
  if (replacementPattern.source.length === 0) {
    console.log('No mojibake patterns defined.');
    return;
  }

  const files = collectFiles(frontendRoot);
  const updated: string[] = [];

  for (const file of files) {
    if (fixFile(file)) {
      updated.push(path.relative(repoRoot, file));
    }
  }

  if (updated.length === 0) {
    console.log('No mojibake detected.');
    return;
  }

  console.log('Fixed mojibake in:');
  for (const file of updated) {
    console.log(` - ${file}`);
  }
};

main();
