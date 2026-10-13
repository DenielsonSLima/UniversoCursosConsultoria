import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const directory = import.meta.dirname;
const temporary = await mkdtemp(join(directory, '.contract-preview-test-'));
after(() => rm(temporary, { recursive: true, force: true }));
await build({
  stdin: { contents: `
    export * from './components/ContratoAlunoCanvas';
    export * from './components/contract-structural-pagination';
  `, resolveDir: directory, loader: 'ts' },
  outfile: join(temporary, 'preview.mjs'), bundle: true, format: 'esm',
  platform: 'node', packages: 'external', logLevel: 'silent',
});
const { ContratoAlunoCanvas, autoPaginateContractText, CONTRACT_STRUCTURAL_V4: V4,
  STRUCTURAL_V4_LAYOUT: geometry, estimateStructuralV4Lines } = await import(pathToFileURL(join(temporary, 'preview.mjs')).href);
const V3 = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA';
const footer = 'Cidade, data.\nCONTRATANTE: Nome de exemplo\nCONTRATADA: Instituição de exemplo\nTESTEMUNHAS:\n1: _____\n2: _____';
const paragraph = 'CONTRATANTE declara ciência das condições individuais, inclusive {{financeiro.valorTotalContrato}} e {{financeiro.quantidadeParcelas}}. ';
const completeBody = Array.from({ length: 35 }, (_, i) => `${i + 1}. ${paragraph.repeat(6)}`).join('\n\n');
const compact = (text) => text.replace(/\s+/gu, '');
const positions = { version: 1, elements: { qr: { x: 171.2, y: 232.8, width: 20 } } };
const props = (presentationVersion, corpo) => ({
  presentationVersion, corpo, tituloDocumento: 'Contrato de prestação de serviços educacionais',
  cabecalho: '', rodape: footer, destaquesCriticos: [], destaquesAtencao: [],
  observacaoEscopo: '', layoutEncerramento: positions,
  qr: { habilitado: true, rotulo: 'Validar', modoValidade: 'SEM_VENCIMENTO', diasValidade: null },
});

test('Canvas V4 recebe o preset, usa 12 pt/1.25 e informa que a contagem depende dos dados do aluno', () => {
  const sourceProps = props(V4, completeBody);
  const before = structuredClone(sourceProps);
  const markup = renderToStaticMarkup(React.createElement(ContratoAlunoCanvas, sourceProps));
  const pages = autoPaginateContractText(completeBody, footer, V4, true);
  assert.equal((markup.match(/data-contract-page="true"/g) || []).length, pages.length);
  assert.equal((markup.match(/font-size:12pt;line-height:1.25/g) || []).length, pages.length);
  assert.match(markup, /Páginas estimadas/);
  assert.match(markup, /depende dos dados do aluno/);
  assert.match(markup, /\{\{financeiro.valorTotalContrato\}\}/);
  assert.doesNotMatch(markup, /text-\[10\.5px\]/);
  assert.deepEqual(sourceProps, before, 'Renderizar não pode alterar configuração, corpo ou posições.');
  assert.equal((markup.match(/data-contract-closing-element=/g) || []).length, 5);
  const firstPage = markup.slice(markup.indexOf('<article'), markup.indexOf('</article>'));
  assert.doesNotMatch(firstPage, /data-contract-closing-element=/);
  const qrLeftPx = positions.elements.qr.x * 794 / 210;
  assert.ok(markup.includes(`left:${qrLeftPx}px`), 'Coordenada salva do QR atravessa a prévia.');
});

test('parágrafos longos, palavras largas e encerramento preservam texto e respeitam a área estimada', () => {
  const longBody = `${paragraph.repeat(180)}\n\n${'WWWWWW AÇÃO '.repeat(600)}`;
  const pages = autoPaginateContractText(longBody, footer, V4, true);
  assert.ok(pages.length > 2, 'Um parágrafo maior que uma folha precisa ser dividido.');
  assert.equal(compact(pages.map((page) => page.body).join('')), compact(longBody));
  assert.equal(pages.filter((page) => page.footer).length, 1);
  assert.equal(pages.at(-1).footer, footer);
  pages.forEach((page, index) => {
    const lines = estimateStructuralV4Lines(page.body);
    const top = index ? geometry.continuationBodyTopMm : geometry.firstBodyTopMm;
    const bottom = top + lines * geometry.lineHeightMm;
    assert.ok(bottom < (index === pages.length - 1 ? 205 : 281), `Página ${index + 1}: área estimada ${bottom} mm.`);
  });
});

test('V4 reserva o encerramento também quando há somente QR e respeita quebras configuradas', () => {
  const body = `${paragraph.repeat(8)}---QUEBRA_DE_PAGINA---Texto final.`;
  const pages = autoPaginateContractText(body, '', V4, true);
  assert.ok(pages.length >= 2);
  assert.equal(pages.at(-1).body, 'Texto final.');
  const qrOnly = autoPaginateContractText(Array(36).fill('Linha.').join('\n'), '', V4, true);
  assert.equal(qrOnly.at(-1).body, '', 'Reserva a área do QR mesmo sem rodapé textual.');
});

test('V3 compacto e modelo legado preservam paginação e tipografia anteriores', () => {
  assert.ok(completeBody.length > 20_000);
  for (const body of ['Texto curto.', completeBody]) {
    const legacy = autoPaginateContractText(body, footer);
    assert.deepEqual(autoPaginateContractText(body, footer, V3), legacy);
    const markup = renderToStaticMarkup(React.createElement(ContratoAlunoCanvas, props(V3, body)));
    assert.doesNotMatch(markup, /font-size:12pt/);
    assert.ok(markup.includes(body.length >= 20_000 ? 'text-[10.5px]' : 'text-[11.5px]'));
  }
  assert.ok(autoPaginateContractText(completeBody, footer, V4).length > autoPaginateContractText(completeBody, footer, V3).length);
});

test('Editor transmite a versão sem alterar as guardas de aprovação e salvamento', async () => {
  const source = await readFile(join(directory, 'components/ContratoAlunoTemplateEditor.tsx'), 'utf8');
  assert.match(source, /<ContratoAlunoCanvas\s+presentationVersion=\{draft\.presentationVersion\}/);
  assert.match(source, /disabled=\{templateQuery\.data\.status === 'ATIVO' \|\| isDirty \|\| approveMutation\.isPending\}/);
  assert.match(source, /disabled=\{!isDirty \|\| saveMutation\.isPending \|\| closingErrors\.length > 0\}/);
});
