#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname } from 'node:path';

const CONFIG_PATH = 'ai/operacao/qualidade/limite-linhas.json';
const MIGRATION_EXEMPTIONS_PATH = 'ai/operacao/qualidade/migrations-aplicadas.json';
const ACTIVE_LOT_PATH = 'ai/operacao/LOTE_ATIVO.md';
const ALLOWED_IGNORED_EXTENSIONS = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.lock', '.pdf', '.png', '.webp', '.woff', '.woff2',
]);
const ALLOWED_IGNORED_FILE_NAMES = new Set([
  'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
]);
const ALLOWED_GENERATED_PATHS = new Set([
  'ai/operacao/rag/index.json',
  'ai/operacao/rag/embeddings.json',
]);
const read = path => readFileSync(path, 'utf8');
const sha256 = content => createHash('sha256').update(content).digest('hex');
const config = JSON.parse(read(CONFIG_PATH));
const manifestRegistryPath = config.manifestRegistry;
const manifestRegistry = manifestRegistryPath && existsSync(manifestRegistryPath)
  ? JSON.parse(read(manifestRegistryPath))
  : { manifests: [] };
const manifests = [
  ...new Set([
    ...(config.manifests ?? []),
    ...(manifestRegistry.manifests ?? []),
  ]),
];
const migrationExemptionsRegistry = existsSync(MIGRATION_EXEMPTIONS_PATH)
  ? JSON.parse(read(MIGRATION_EXEMPTIONS_PATH))
  : { version: 1, exemptions: [] };
const failures = [];

const countPhysicalLines = content => {
  if (!content) return 0;
  const normalized = content.replaceAll('\r\n', '\n');
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0);
};

const extractManifestPaths = manifestPath => {
  if (!existsSync(manifestPath)) {
    failures.push(`Manifesto não encontrado: ${manifestPath}`);
    return [];
  }

  const source = read(manifestPath);
  const sectionStart = source.indexOf('## Manifesto explícito');
  if (sectionStart < 0) {
    failures.push(`Manifesto sem seção "## Manifesto explícito": ${manifestPath}`);
    return [];
  }

  const sectionBody = source.slice(sectionStart + '## Manifesto explícito'.length);
  const nextSection = sectionBody.search(/^## /m);
  const manifestSection = nextSection >= 0 ? sectionBody.slice(0, nextSection) : sectionBody;
  const paths = [...manifestSection.matchAll(/^- `([^`]+)`/gm)].map(match => match[1]);
  const declaredTotal = manifestSection.match(/^Total:\s*(\d+)\s+arquivos\b/m);
  if (!declaredTotal) {
    failures.push(`Manifesto sem total declarado: ${manifestPath}`);
  } else if (Number(declaredTotal[1]) !== paths.length) {
    failures.push(`${manifestPath}: declara ${declaredTotal[1]} arquivos, mas lista ${paths.length}.`);
  }
  return paths;
};

if (!Number.isInteger(config.maxLines) || config.maxLines !== 500) {
  failures.push(`${CONFIG_PATH}: maxLines deve ser exatamente 500.`);
}
if (manifestRegistryPath && !existsSync(manifestRegistryPath)) {
  failures.push(`Registro de manifestos não encontrado: ${manifestRegistryPath}`);
}
if (manifestRegistryPath && manifestRegistry.version !== 1) {
  failures.push(`${manifestRegistryPath}: version deve ser exatamente 1.`);
}
if (manifests.length === 0) {
  failures.push(`${CONFIG_PATH}: informe ao menos um manifesto auditado.`);
}
const activeLotManifest = read(ACTIVE_LOT_PATH).match(/Manifesto explícito:\s*`([^`]+)`/)?.[1];
if (!activeLotManifest) {
  failures.push(`${ACTIVE_LOT_PATH}: manifesto explícito não identificado.`);
} else if (!manifests.includes(activeLotManifest)) {
  failures.push(`${CONFIG_PATH}: o manifesto do lote ativo não está sendo auditado (${activeLotManifest}).`);
}

if (migrationExemptionsRegistry.version !== 1) {
  failures.push(`${MIGRATION_EXEMPTIONS_PATH}: version deve ser exatamente 1.`);
}

const exemptionEntries = [
  ...(config.exemptions ?? []),
  ...(migrationExemptionsRegistry.exemptions ?? []),
];
const exemptions = new Map();
for (const exemption of exemptionEntries) {
  if (!exemption.path || !exemption.kind || !exemption.reason) {
    failures.push(`${CONFIG_PATH}: toda exceção precisa de path, kind e reason.`);
    continue;
  }
  if (exemption.kind !== 'applied-migration') {
    failures.push(`${CONFIG_PATH}: somente migrations aplicadas podem ser excepcionadas (${exemption.path}).`);
  }
  if (!/^\d{14}$/.test(exemption.remoteId ?? '')) {
    failures.push(`${CONFIG_PATH}: migration aplicada exige remoteId de 14 dígitos (${exemption.path}).`);
  }
  if (!/^[a-f0-9]{64}$/.test(exemption.sha256 ?? '')) {
    failures.push(`${CONFIG_PATH}: migration aplicada exige SHA-256 canônico (${exemption.path}).`);
  }
  if (exemptions.has(exemption.path)) {
    failures.push(`Exceção de migration duplicada: ${exemption.path}`);
  }
  exemptions.set(exemption.path, exemption);
}

const retiredPaths = new Map();
for (const retired of config.retiredPaths ?? []) {
  if (!retired.path || !retired.retiredInManifest || !retired.reason) {
    failures.push(`${CONFIG_PATH}: retirada exige path, retiredInManifest e reason.`);
    continue;
  }
  if (!manifests.includes(retired.retiredInManifest)) {
    failures.push(`${CONFIG_PATH}: retirada aponta para manifesto não auditado (${retired.path}).`);
  }
  if (existsSync(retired.path)) {
    failures.push(`${CONFIG_PATH}: path marcado como retirado ainda existe (${retired.path}).`);
  }
  retiredPaths.set(retired.path, retired);
}

const generatedArtifacts = new Map();
for (const artifact of config.generatedArtifacts ?? []) {
  if (!artifact.path || !artifact.generator || !artifact.reason) {
    failures.push(`${CONFIG_PATH}: artefato gerado exige path, generator e reason.`);
    continue;
  }
  if (!ALLOWED_GENERATED_PATHS.has(artifact.path)) {
    failures.push(`${CONFIG_PATH}: artefato gerado fora da allowlist (${artifact.path}).`);
  }
  if (!existsSync(artifact.path)) {
    failures.push(`${CONFIG_PATH}: artefato gerado não encontrado (${artifact.path}).`);
  }
  generatedArtifacts.set(artifact.path, artifact);
}

const ignoredExtensions = new Set(config.ignoredExtensions ?? []);
const ignoredFileNames = new Set(config.ignoredFileNames ?? []);
for (const extension of ignoredExtensions) {
  if (!ALLOWED_IGNORED_EXTENSIONS.has(extension)) {
    failures.push(`${CONFIG_PATH}: extensão não autorizada na lista de ignorados (${extension}).`);
  }
}
for (const fileName of ignoredFileNames) {
  if (!ALLOWED_IGNORED_FILE_NAMES.has(fileName)) {
    failures.push(`${CONFIG_PATH}: arquivo não autorizado na lista de ignorados (${fileName}).`);
  }
}
const manifestPaths = [...new Set(manifests.flatMap(extractManifestPaths))];
if (manifestPaths.length === 0) {
  failures.push('Nenhum arquivo foi encontrado nos manifestos auditados.');
}
const checked = [];
const skipped = [];

const readGitFile = (ref, path) => {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

for (const path of manifestPaths) {
  if (exemptions.has(path)) {
    const exemption = exemptions.get(path);
    if (!/^supabase\/migrations\/[^/]+\.sql$/.test(path)) {
      failures.push(`Exceção de migration fora do diretório canônico: ${path}`);
    } else if (!existsSync(path)) {
      failures.push(`Migration aplicada não encontrada: ${path}`);
    } else if (sha256(read(path)) !== exemption.sha256) {
      failures.push(`Migration aplicada foi alterada: ${path}`);
    }
    skipped.push({ path, reason: exemptions.get(path).kind });
    continue;
  }
  if (generatedArtifacts.has(path)) {
    skipped.push({ path, reason: 'generated' });
    continue;
  }
  if (ignoredExtensions.has(extname(path).toLowerCase()) || ignoredFileNames.has(basename(path))) {
    skipped.push({ path, reason: 'non-text-or-generated' });
    continue;
  }
  if (!existsSync(path)) {
    if (retiredPaths.has(path)) {
      skipped.push({ path, reason: 'retired' });
    } else {
      failures.push(`Arquivo auditado não encontrado: ${path}`);
    }
    continue;
  }

  const lines = countPhysicalLines(read(path));
  checked.push({ path, lines });
  if (lines > config.maxLines) {
    failures.push(`${path}: ${lines} linhas; teto ${config.maxLines}.`);
  }
}

for (const path of exemptions.keys()) {
  if (!manifestPaths.includes(path)) {
    failures.push(`Exceção sem arquivo correspondente nos manifestos: ${path}`);
  }
}

const diffIndex = process.argv.indexOf('--check-diff');
if (diffIndex >= 0) {
  const base = process.argv[diffIndex + 1];
  const head = process.argv[diffIndex + 2];
  if (!base || !head) {
    failures.push('Informe os commits base e head após --check-diff.');
  } else {
    const baseConfigContent = readGitFile(base, CONFIG_PATH);
    if (baseConfigContent) {
      const baseConfig = JSON.parse(baseConfigContent);
      const baseManifestRegistryContent = baseConfig.manifestRegistry
        ? readGitFile(base, baseConfig.manifestRegistry)
        : null;
      if (baseConfig.manifestRegistry && !baseManifestRegistryContent) {
        failures.push(`Registro de manifestos não encontrado na base: ${baseConfig.manifestRegistry}`);
      }
      const baseManifestRegistry = baseManifestRegistryContent
        ? JSON.parse(baseManifestRegistryContent)
        : { manifests: [] };
      const baseManifests = [
        ...new Set([
          ...(baseConfig.manifests ?? []),
          ...(baseManifestRegistry.manifests ?? []),
        ]),
      ];
      for (const baseManifest of baseManifests) {
        if (!manifests.includes(baseManifest)) {
          failures.push(`Manifesto auditado foi removido da cobertura incremental: ${baseManifest}`);
        }
      }
      const currentRetiredPaths = new Map((config.retiredPaths ?? []).map(item => [item.path, item]));
      for (const baseRetired of baseConfig.retiredPaths ?? []) {
        const currentRetired = currentRetiredPaths.get(baseRetired.path);
        if (!currentRetired || ['retiredInManifest', 'reason'].some(field => currentRetired[field] !== baseRetired[field])) {
          failures.push(`Registro de path retirado foi removido ou alterado: ${baseRetired.path}`);
        }
      }
      const baseRegistryContent = readGitFile(base, MIGRATION_EXEMPTIONS_PATH);
      const baseRegistry = baseRegistryContent
        ? JSON.parse(baseRegistryContent)
        : { exemptions: [] };
      const baseExemptions = [
        ...(baseConfig.exemptions ?? []),
        ...(baseRegistry.exemptions ?? []),
      ];
      for (const baseExemption of baseExemptions) {
        const currentExemption = exemptions.get(baseExemption.path);
        const baseFile = readGitFile(base, baseExemption.path);
        if (!currentExemption) {
          failures.push(`Exceção aplicada foi removida da configuração: ${baseExemption.path}`);
        } else if (['kind', 'remoteId', 'sha256', 'reason'].some(field => currentExemption[field] !== baseExemption[field])) {
          failures.push(`Registro auditável da migration aplicada foi alterado: ${baseExemption.path}`);
        } else if (baseFile && (!existsSync(baseExemption.path) || read(baseExemption.path) !== baseFile)) {
          failures.push(`Migration já versionada na base foi alterada: ${baseExemption.path}`);
        }
      }
    }
  }
}

console.log(`Teto de linhas: ${config.maxLines}`);
console.log(`Arquivos manuais auditados: ${checked.length}`);
console.log(`Exceções/artefatos ignorados: ${skipped.length}`);

if (failures.length > 0) {
  console.error(`\nRESULTADO: FALHOU (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

const largest = checked.sort((left, right) => right.lines - left.lines).slice(0, 5);
largest.forEach(item => console.log(`- ${item.lines} linhas: ${item.path}`));
console.log('\nRESULTADO: OK');
