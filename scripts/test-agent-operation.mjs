#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(path, 'utf8');
const bytes = (value) => Buffer.byteLength(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const agents = read('AGENTS.md');
const memory = read('ai/operacao/MEMORIA_CANONICA.md');
const activeLot = read('ai/operacao/LOTE_ATIVO.md');
const protocol = read('ai/operacao/PROTOCOLO_DE_LOTES.md');
const pdfPolicy = read('ai/operacao/politicas/PDFS_OFICIAIS.md');
const manifest = JSON.parse(read('ai/operacao/rag/manifesto.json'));
const ragIndexText = read('ai/operacao/rag/index.json');
const ragIndex = JSON.parse(ragIndexText);
const tsconfig = JSON.parse(read('tsconfig.json'));

const activeLotCount = (activeLot.match(/^## Lote:/gm) ?? []).length;
const localBootstrapBytes = bytes(agents) + bytes(memory) + bytes(activeLot) + bytes(protocol);
const manifestPaths = (manifest.sources ?? []).map((source) => source.path);

assert(activeLotCount <= 1, `LOTE_ATIVO contém ${activeLotCount} lotes; máximo permitido: 1.`);
assert(bytes(activeLot) <= 12_000, `LOTE_ATIVO excedeu 12 KB (${bytes(activeLot)} bytes).`);
assert(localBootstrapBytes <= 20_000, `Bootstrap operacional local excedeu 20 KB (${localBootstrapBytes} bytes).`);
assert(/### Ajuste rápido/.test(agents), 'AGENTS perdeu a faixa Ajuste rápido.');
assert(/### Ajuste PDF focado/.test(agents), 'AGENTS perdeu a faixa Ajuste PDF focado.');
assert(/Não leia MEMORIA_CANONICA\.md, LOTE_ATIVO\.md, RAG/.test(agents), 'Ajuste rápido voltou a carregar memória, lote ou RAG.');
assert(/restrinja a primeira busca a essa pasta/.test(agents), 'Busca inicial não está limitada ao módulo nomeado.');
assert(manifestPaths.every((path) => !path.includes('/registros')), 'Registros históricos voltaram ao manifesto RAG.');
assert(manifestPaths.every((path) => !path.includes('/planejamentos')), 'Planejamentos voltaram ao manifesto RAG.');
assert((ragIndex.sources ?? []).length <= 20, `RAG possui fontes demais (${ragIndex.sources?.length ?? 0}).`);
assert((ragIndex.chunks ?? []).length <= 80, `RAG possui trechos demais (${ragIndex.chunks?.length ?? 0}).`);
assert((tsconfig.exclude ?? []).includes('tmp'), 'tmp não está excluído do TypeScript.');
assert(!existsSync('ai/memoria') && !existsSync('ai/rag') && !existsSync('ai/skil'), 'Diretório legado de memória/RAG/skill reapareceu.');
assert(/Nunca rasterize a página/.test(pdfPolicy), 'Política PDF perdeu a proibição de rasterizar página.');
assert(/Pipeline híbrido.+também é proibido/.test(pdfPolicy), 'Política PDF voltou a permitir screenshot com texto sobreposto.');
assert(/Canvas é permitido apenas como buffer temporário para preparar um recurso isolado/.test(pdfPolicy), 'Política PDF perdeu a exceção para recursos isolados.');

const hashBefore = sha256(ragIndexText);
const searchStartedAt = performance.now();
const search = spawnSync(
  process.execPath,
  ['scripts/agent-memory-rag.mjs', 'search', 'ajuste cabecalho pdf', '--limit', '2'],
  { encoding: 'utf8' },
);
const searchElapsedMs = performance.now() - searchStartedAt;
const hashAfter = sha256(read('ai/operacao/rag/index.json'));

assert(search.status === 0, `Busca RAG falhou: ${search.stderr.trim() || 'erro desconhecido'}`);
assert(hashBefore === hashAfter, 'Busca RAG alterou o índice.');
assert(searchElapsedMs <= 1_000, `Busca RAG excedeu 1 segundo (${searchElapsedMs.toFixed(1)} ms).`);

console.log('Contrato operacional dos agentes');
console.log('================================');
console.log(`Lotes ativos: ${activeLotCount}`);
console.log(`Bootstrap local: ${localBootstrapBytes} bytes`);
console.log(`RAG: ${ragIndex.sources.length} fontes / ${ragIndex.chunks.length} trechos`);
console.log(`Busca RAG: ${searchElapsedMs.toFixed(1)} ms / índice imutável: ${hashBefore === hashAfter ? 'SIM' : 'NÃO'}`);

if (failures.length > 0) {
  console.error(`\nRESULTADO: FALHOU (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('\nRESULTADO: OK');
}
