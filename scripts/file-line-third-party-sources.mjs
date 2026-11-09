import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export const NFSE_THIRD_PARTY_REGISTRY = 'ai/operacao/qualidade/fontes-terceiros-nfse.json';
const BASE = 'supabase/functions/_shared/nfse-national/schemas/';
const FILE_NAMES = new Set(['DPS_v1.01.xsd', 'NFSe_v1.01.xsd', 'pedRegEvento_v1.01.xsd',
  'tiposComplexos_v1.01.xsd', 'tiposEventos_v1.01.xsd', 'tiposSimples_v1.01.xsd', 'xmldsig-core-schema.xsd']);
const PACKAGES = {
  '1.01': {
    url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip',
    sha256: 'e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072',
    memberPrefix: 'Schemas/1.01/',
  },
  'prodrest-20261020': {
    url: 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip',
    sha256: '25fdcecc651a67a216496ab10d7566631e6ed10f721e37d62c7845dadb0ea267',
    memberPrefix: '',
  },
};

/** Explicit upstream copies only: neither extensions nor arbitrary directories are exempted. */
export function loadThirdPartySources(registryPath, failures, rootDir = '.') {
  const sources = new Map();
  if (registryPath === undefined) return sources;
  if (registryPath !== NFSE_THIRD_PARTY_REGISTRY) {
    failures.push(`Registro de terceiros fora do caminho autorizado: ${registryPath}`);
    return sources;
  }
  const root = realpathSync(rootDir);
  const registryFile = resolve(root, registryPath);
  if (!existsSync(registryFile)) {
    failures.push(`Registro de fontes de terceiros não encontrado: ${registryPath}`);
    return sources;
  }
  let registry;
  try { registry = JSON.parse(readFileSync(registryFile, 'utf8')); }
  catch {
    failures.push(`Registro de fontes de terceiros inválido: ${registryPath}`);
    return sources;
  }
  if (registry?.version !== 1 || !Array.isArray(registry.sources) || registry.sources.length > 14) {
    failures.push(`${registryPath}: exige version 1 e até 14 fontes oficiais NFS-e.`);
    return sources;
  }
  const declared = new Set();
  for (const entry of registry.sources) {
    const relative = typeof entry?.path === 'string' && entry.path.startsWith(BASE)
      ? entry.path.slice(BASE.length).split('/') : [];
    const [version, name] = relative;
    const upstream = Object.hasOwn(PACKAGES, version) ? PACKAGES[version] : undefined;
    if (relative.length !== 2 || !upstream || !FILE_NAMES.has(name)) {
      failures.push(`Fonte de terceiros fora da allowlist de schemas oficiais: ${entry?.path}`);
      continue;
    }
    if (declared.has(entry.path)) {
      failures.push(`Fonte de terceiros duplicada: ${entry.path}`);
      continue;
    }
    declared.add(entry.path);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || typeof entry.reason !== 'string' || !entry.reason.trim()
      || entry.officialUrl !== upstream.url || entry.archiveSha256 !== upstream.sha256
      || entry.archiveMember !== `${upstream.memberPrefix}${name}`) {
      failures.push(`Fonte de terceiros sem SHA-256, motivo ou procedência oficial válida: ${entry.path}`);
      continue;
    }
    const file = resolve(root, entry.path);
    if (!existsSync(file) || !lstatSync(file).isFile() || realpathSync(file) !== file) {
      failures.push(`Fonte de terceiros ausente ou não regular: ${entry.path}`);
      continue;
    }
    // Hash raw bytes: preserve CRLF, encoding and all upstream formatting verbatim.
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== entry.sha256) {
      failures.push(`Fonte de terceiros foi alterada: ${entry.path}`);
      continue;
    }
    sources.set(entry.path, entry);
  }
  return sources;
}
