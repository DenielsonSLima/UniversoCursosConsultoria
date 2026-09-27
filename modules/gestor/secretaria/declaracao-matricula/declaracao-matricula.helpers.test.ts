import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DECLARACAO_TEMPLATE_DEFAULT,
  type DeclaracaoAluno,
} from './declaracao-matricula.types.ts';
import { parseDeclaracaoTemplate } from './declaracao-matricula.helpers.ts';

const aluno: DeclaracaoAluno = {
  id: 'aluno-1',
  nome: 'Aluno Teste',
  cpf: '123.456.789-00',
  rg: 'RG-RESIDUAL',
  nascimento: '2000-02-03',
  matricula: '20260001',
  curso: 'Técnico em Testes',
  turmaNome: 'Turma A',
  instituicao: 'Universo Cursos e Consultoria',
  tipoDocumento: 'CARTEIRA DE IDENTIDADE NACIONAL',
  poloNome: 'Polo Teste',
  poloCnpj: '00.000.000/0001-00',
  cidadePolo: 'Aracaju/SE',
};

test('modelo padrão mantém tipo e número documental configuráveis', () => {
  assert.match(DECLARACAO_TEMPLATE_DEFAULT.textContent, /{{ALUNO_DOCUMENTO_TIPO}}/);
  assert.match(DECLARACAO_TEMPLATE_DEFAULT.textContent, /{{ALUNO_RG}}/);
});

test('declaração com CIN exibe o CPF e não o RG residual', () => {
  const parsed = parseDeclaracaoTemplate(
    '{{ALUNO_DOCUMENTO_TIPO}}|{{ALUNO_RG}}|{{ALUNO_CPF}}',
    aluno,
    { frequenciesByStudent: {} },
  );

  assert.match(parsed, /Carteira de Identidade Nacional/);
  assert.equal(parsed.includes('RG-RESIDUAL'), false);
  assert.equal((parsed.match(/123\.456\.789-00/g) || []).length, 2);
});

test('tipo vazio não presume CIN nem reaproveita RG', () => {
  const parsed = parseDeclaracaoTemplate(
    '{{ALUNO_DOCUMENTO_TIPO}}|{{ALUNO_RG}}',
    { ...aluno, tipoDocumento: '', rg: 'RG-RESIDUAL' },
    { frequenciesByStudent: {} },
  );

  assert.equal(parsed, 'Documento não informado|Não informado');
});

test('compositor modular preserva modelo, cabeçalho, QR e os quatro parâmetros da marca', async () => {
  const [page, viewer, pages] = await Promise.all([
    readFile(new URL('./SecretariaDeclaracaoMatriculaPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaDeclaracaoPrintViewer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaDeclaracaoDocumentPages.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /<SecretariaDeclaracaoPrintViewer/);
  assert.match(page, /templateConfig=\{templateConfig\}/);
  assert.match(page, /watermark=\{watermark\}/);
  assert.match(viewer, /<SecretariaDeclaracaoDocumentPages/);
  assert.match(pages, /templateConfig\.textContent/);
  assert.match(pages, /templateConfig\.absoluteFields/);
  assert.match(pages, /<DocumentHeader polo=\{poloInfo\} orientation="portrait"/);
  assert.match(pages, /<LocalQrCodeImage/);
  for (const property of [
    'watermarkUrl',
    'watermarkOpacity',
    'watermarkScale',
    'watermarkRotate',
  ]) {
    assert.ok(pages.includes(property), `Compositor sem ${property}`);
  }
});
