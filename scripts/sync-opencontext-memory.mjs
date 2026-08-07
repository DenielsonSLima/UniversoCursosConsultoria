#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultTarget = resolve(homedir(), '.opencontext/contexts/universo-cursos-e-consultoria');
const args = process.argv.slice(2);
const targetArgumentIndex = args.indexOf('--target');
const target = targetArgumentIndex >= 0 ? resolve(args[targetArgumentIndex + 1]) : defaultTarget;
const dryRun = args.includes('--dry-run');

const readProjectFile = (path) => readFile(resolve(root, path), 'utf8');
const projectPath = (path) => relative(root, path).split(sep).join('/');

const listDecisionFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listDecisionFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
};

const buildDecisionsDocument = async () => {
  const decisionsDirectory = resolve(root, 'docs/decisions');
  const files = await listDecisionFiles(decisionsDirectory);
  const blocks = await Promise.all(files.map(async (path) => (
    `## ${projectPath(path)}\n\n${await readFile(path, 'utf8').then((content) => content.trim())}`
  )));
  return `# Decisões arquiteturais ativas\n\nSincronizado automaticamente da fonte versionada em \`docs/decisions/\`.\n\n${blocks.join('\n\n---\n\n')}\n`;
};

const documents = async () => ({
  'MEMORIA_CANONICA.md': await readProjectFile('ai/operacao/MEMORIA_CANONICA.md'),
  'LOTE_ATIVO.md': await readProjectFile('ai/operacao/LOTE_ATIVO.md'),
  'PROTOCOLO_DE_LOTES.md': await readProjectFile('ai/operacao/PROTOCOLO_DE_LOTES.md'),
  'REGISTROS.md': `# Registros operacionais\n\n${await readProjectFile('ai/operacao/registros/ALTERACOES.md')}\n\n---\n\n${await readProjectFile('ai/operacao/registros/COMMITS_E_DEPLOYS.md')}`,
  'DECISOES_ATIVAS.md': await buildDecisionsDocument(),
});

try {
  if (!dryRun && !existsSync(target)) {
    throw new Error(`Pasta OpenContext ausente: ${target}. Execute \`oc init --tools codex\` e registre os documentos antes da sincronização.`);
  }
  const contentByName = await documents();
  const names = Object.keys(contentByName);
  if (dryRun) {
    console.log(JSON.stringify({ target, documents: names, mode: 'DRY_RUN' }, null, 2));
  } else {
    await mkdir(target, { recursive: true });
    await Promise.all(names.map((name) => writeFile(resolve(target, name), contentByName[name])));
    console.log(`OpenContext sincronizado: ${names.length} documentos em ${target}.`);
  }
} catch (error) {
  console.error(`OpenContext sync: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
