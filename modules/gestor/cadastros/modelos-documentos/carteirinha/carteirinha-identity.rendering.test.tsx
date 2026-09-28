import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CarteirinhaPreview from './components/CarteirinhaPreview';
import { getPreviewStudent } from '../../../secretaria/historico-emissoes/preview-utils';
import type { EmissionLog } from '../../../secretaria/historico-emissoes/historico-emissoes.types';

const student = {
  nome: 'ESTUDANTE FICTÍCIO', cpf: '123.456.789-00', rg: '9876543',
  nascimento: '01/02/2000', matricula: 'TESTE-01', curso: 'Curso de teste',
  instituicao: 'Instituição de teste', validade: 'Sem vencimento',
};

for (const absolute of [false, true]) {
  const render = (tipoDocumento: string) => renderToStaticMarkup(
    <CarteirinhaPreview
      page="frente" zoomLevel={100} showValidationQrCode={false}
      aluno={{ ...student, tipoDocumento }}
      formData={{
        assinaturaOrigem: 'none', exibirRotulos: true,
        usePhotoshopLayout: absolute,
        bgFrenteUrl: absolute ? 'data:image/png;base64,TEST' : '',
        posicoes: { rg: { x: 31, y: 57 }, cpf: { x: 32, y: 73 } },
      }}
    />,
  );

  test(`carteirinha ${absolute ? 'absoluta' : 'padrão'} CIN usa identidade e deixa CPF vazio`, () => {
    const html = render('CARTEIRA DE IDENTIDADE NACIONAL');
    assert.match(html, />CIN:?<\/span>|>CIN<\/p>/);
    assert.equal(html.split(student.cpf).length - 1, 1);
    assert.ok(!html.includes(student.rg));
    assert.doesNotMatch(html, />CPF:?<\/|>RG:?<\//);
    if (absolute) assert.ok(html.includes('left:31%;top:57%'));
  });

  test(`carteirinha ${absolute ? 'absoluta' : 'padrão'} RG mantém CPF e RG distintos`, () => {
    const html = render('RG (ANTIGO)');
    assert.match(html, />RG:?<\//);
    assert.match(html, />CPF:?<\//);
    assert.ok(html.includes(student.cpf));
    assert.ok(html.includes(student.rg));
  });

  test(`carteirinha ${absolute ? 'absoluta' : 'padrão'} tipo legado não é inferido como CIN`, () => {
    const html = render('CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
    assert.doesNotMatch(html, />CIN:?<\//);
    assert.ok(html.includes(student.rg));
  });

  test(`carteirinha ${absolute ? 'absoluta' : 'padrão'} tipo vazio não inventa RG ou CIN`, () => {
    const html = render('');
    assert.doesNotMatch(html, />CIN:?<\/|>RG:?<\//);
    assert.ok(!html.includes(student.rg));
    assert.ok(html.includes(student.cpf));
  });
}

test('histórico da carteirinha preserva tipo e números congelados antes do cadastro atual', () => {
  const emission = {
    dados_emissao: {
      studentDocumentType: 'CARTEIRA DE IDENTIDADE NACIONAL',
      studentCpf: student.cpf, studentRg: '',
    },
    aluno: { tipo_documento: 'RG (ANTIGO)', cpf_cnpj: '99999999999', rg: 'RG-NOVO' },
    matricula_id: '00000000-0000-4000-8000-000000000001',
    emitido_em: '2026-09-27', polo_id: 'TEST',
  } as unknown as EmissionLog;
  const result = getPreviewStudent(emission, {});
  assert.equal(result.tipoDocumento, 'CARTEIRA DE IDENTIDADE NACIONAL');
  assert.equal(result.rg, student.cpf);
  assert.equal(result.cpf, student.cpf);
});

test('prévia, impressão e exportação ativa usam a apresentação compartilhada de identidade', () => {
  for (const path of [
    'modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPrintLayout.tsx',
    'modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /<CarteirinhaPreview/);
    assert.match(source, /page="frente"/);
    assert.match(source, /page="verso"/);
  }
  const page = readFileSync('modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx', 'utf8');
  assert.match(page, /downloadCarteirinhasPdf\(printContentRef\.current/);
  assert.match(page, /tipoDocumento: enrollment\.tipoDocumento/);
});
