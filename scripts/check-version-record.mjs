import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = resolve(root, 'internal/versioning/system-version.json');
const changelogPath = resolve(root, 'internal/versioning/CHANGELOG.md');
const changelogArchivePath = resolve(root, 'internal/versioning/changelog');
const versionRecord = JSON.parse(readFileSync(versionPath, 'utf8'));
const changelog = readFileSync(changelogPath, 'utf8');
const archivedChangelogs = existsSync(changelogArchivePath)
  ? readdirSync(changelogArchivePath)
      .filter(file => file.endsWith('.md'))
      .sort()
      .map(file => readFileSync(resolve(changelogArchivePath, file), 'utf8'))
  : [];
const errors = [];

const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const stages = new Set(['alpha', 'beta', 'rc', 'stable']);
const parsedVersion = semverPattern.exec(versionRecord.version ?? '');

if (!parsedVersion) {
  errors.push('system-version.json: "version" deve seguir o padrão semântico.');
}

if (!stages.has(versionRecord.stage)) {
  errors.push('system-version.json: "stage" deve ser alpha, beta, rc ou stable.');
}

if (!Number.isInteger(versionRecord.revision) || versionRecord.revision < 1) {
  errors.push('system-version.json: "revision" deve ser um número inteiro positivo.');
}

if (!datePattern.test(versionRecord.releasedAt ?? '')) {
  errors.push('system-version.json: "releasedAt" deve usar o formato AAAA-MM-DD.');
} else {
  const parsedDate = new Date(`${versionRecord.releasedAt}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== versionRecord.releasedAt) {
    errors.push('system-version.json: "releasedAt" deve ser uma data válida.');
  }
}

if (typeof versionRecord.display !== 'string' || !versionRecord.display.trim()) {
  errors.push('system-version.json: "display" é obrigatório.');
}

if (typeof versionRecord.summary !== 'string' || versionRecord.summary.trim().length < 10) {
  errors.push('system-version.json: "summary" deve descrever a entrega.');
}

if (parsedVersion) {
  const prereleaseStage = parsedVersion[4];
  const prereleaseRevision = parsedVersion[5] ? Number(parsedVersion[5]) : null;

  if (versionRecord.stage === 'stable' && prereleaseStage) {
    errors.push('system-version.json: versões estáveis não devem ter sufixo de pré-lançamento.');
  }

  if (versionRecord.stage !== 'stable') {
    if (prereleaseStage !== versionRecord.stage || prereleaseRevision !== versionRecord.revision) {
      errors.push('system-version.json: "stage" e "revision" devem corresponder ao sufixo da versão.');
    }
    if (versionRecord.display !== String(versionRecord.stage).toUpperCase()) {
      errors.push('system-version.json: "display" deve corresponder à fase atual.');
    }
  }
}

const expectedHeading = `## [${versionRecord.version}] - ${versionRecord.releasedAt}`;
const latestHeading = changelog.match(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/m)?.[0];
if (latestHeading !== expectedHeading) {
  errors.push(`CHANGELOG.md: a entrada mais recente deve ser: ${expectedHeading}`);
}

const versionParts = value => {
  const match = semverPattern.exec(value ?? '');
  if (!match) return null;
  const stageRank = { alpha: 0, beta: 1, rc: 2, stable: 3 };
  const stage = match[4] ?? 'stable';
  return [Number(match[1]), Number(match[2]), Number(match[3]), stageRank[stage], Number(match[5] ?? 0)];
};

const compareVersions = (current, previous) => {
  const currentParts = versionParts(current);
  const previousParts = versionParts(previous);
  if (!currentParts || !previousParts) return null;

  for (let index = 0; index < currentParts.length; index += 1) {
    if (currentParts[index] !== previousParts[index]) {
      return currentParts[index] > previousParts[index] ? 1 : -1;
    }
  }
  return 0;
};

const changelogEntries = source => {
  const headings = [...source.matchAll(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/gm)];
  return headings.map((heading, index) => {
    const next = headings[index + 1]?.index ?? source.length;
    return [heading[0], source.slice(heading.index, next).trim()];
  });
};

const completeHistoryEntries = [changelog, ...archivedChangelogs].flatMap(changelogEntries);
const completeHistory = new Map(completeHistoryEntries);
const completeHistoryVersions = completeHistoryEntries.map(([heading]) => heading.match(/^## \[([^\]]+)\]/)?.[1]);
if (new Set(completeHistoryVersions).size !== completeHistoryVersions.length) {
  const seen = new Set();
  const duplicates = completeHistoryVersions
    .filter(version => seen.has(version) || !seen.add(version));
  errors.push(`Histórico contém versões duplicadas: ${[...new Set(duplicates)].join(', ')}.`);
}

const readGitFile = (ref, file) => {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

const readGitDirectory = (ref, directory) => {
  try {
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', directory], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(path => path.endsWith('.md'));
    return paths.map(path => readGitFile(ref, path)).filter(Boolean);
  } catch {
    return [];
  }
};

const diffIndex = process.argv.indexOf('--check-diff');
if (diffIndex !== -1) {
  const base = process.argv[diffIndex + 1];
  const head = process.argv[diffIndex + 2];

  if (!base || !head) {
    errors.push('Informe os commits base e head após --check-diff.');
  } else {
    const changedFiles = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
      cwd: root,
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
    const productChanged = changedFiles.some(file =>
      !file.startsWith('internal/versioning/') &&
      !file.startsWith('.github/') &&
      !file.endsWith('.md')
    );
    const baseChangelog = readGitFile(base, 'internal/versioning/CHANGELOG.md');
    const baseHistorySources = [
      ...(baseChangelog ? [baseChangelog] : []),
      ...readGitDirectory(base, 'internal/versioning/changelog'),
    ];

    if (productChanged) {
      for (const requiredFile of [
        'internal/versioning/system-version.json',
        'internal/versioning/CHANGELOG.md',
      ]) {
        if (!changedFiles.includes(requiredFile)) {
          errors.push(`Alteração de produto sem atualizar ${requiredFile}.`);
        }
      }

      const baseVersionContent = readGitFile(base, 'internal/versioning/system-version.json');

      if (baseVersionContent) {
        const baseVersionRecord = JSON.parse(baseVersionContent);
        const comparison = compareVersions(versionRecord.version, baseVersionRecord.version);
        if (comparison === null || comparison <= 0) {
          errors.push(`A versão deve avançar em relação à base (${baseVersionRecord.version}).`);
        }
        if (baseChangelog?.includes(expectedHeading)) {
          errors.push('CHANGELOG.md: a versão atual já existia na base; crie uma nova entrada.');
        }
      }
    }

    for (const [heading, entry] of baseHistorySources.flatMap(changelogEntries)) {
      if (completeHistory.get(heading) !== entry) {
        errors.push(`Histórico de versão removido ou alterado: ${heading}.`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Falha no controle de versão:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Controle de versão válido: ${versionRecord.version} (${versionRecord.display}).`);
