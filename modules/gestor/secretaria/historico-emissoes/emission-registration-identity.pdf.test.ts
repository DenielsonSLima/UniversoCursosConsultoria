import assert from 'node:assert/strict';
import test from 'node:test';
import { fichaMatriculaDefaultTemplate, pastaIdentificacaoDefaultTemplate } from '../../cadastros/ficha-matricula/document-layouts';
import { prepareRegistrationIdentityTemplate } from '../../cadastros/ficha-matricula/registration-identity-presentation';
import { createEmissionDocumentsPdf, type EmissionPdfSource } from './emission-document.pdf';

const CPF = '00000000000';
const FORMATTED_CPF = '000.000.000-00';
const RG = '987654321';
const makeSource = (documento: 'pasta_identificacao' | 'ficha_matricula', type: string): EmissionPdfSource => ({
  emission: {
    id: 'fixture-identity', codigo: 'FIXTURE-IDENTITY', documento,
    validacao_publica: false, emitido_em: '2026-09-28T12:00:00Z',
    identidade: 'fixture-identity', matricula_id: 'fixture-enrollment', aluno_id: 'fixture-student',
    polo_id: 'fixture-unit', periodo_referencia: null, referencia_externa: null,
    status: 'ATIVO', ultima_emissao_em: '2026-09-28T12:00:00Z', validade_ate: null,
    revogado_em: null, emitido_por: null, quantidade_emissoes: 1,
    dados_emissao: {
      studentName: 'ALUNA DE EXEMPLO', studentMatricula: 'UNIV-269999',
      studentDocumentType: type, studentCpf: CPF, studentRg: RG,
      studentRgIssuer: 'SSP', studentRgState: 'SE', studentRgIssueDate: '2020-01-01',
      institutionSnapshot: { nome: 'INSTITUIÇÃO DE EXEMPLO' }, watermarkSnapshot: {},
    },
    aluno: { id: 'fixture-student', nome: 'ALUNA DE EXEMPLO', tipo_documento: 'CIN', cpf_cnpj: '11111111111', rg: '111111' },
  } as EmissionPdfSource['emission'],
  preview: {
    template: globalThis.structuredClone(documento === 'pasta_identificacao' ? pastaIdentificacaoDefaultTemplate : fichaMatriculaDefaultTemplate),
    watermark: null, polo: null, academicData: null, certificate: null,
  },
});

const render = async (source: EmissionPdfSource) => {
  const before = globalThis.structuredClone(source);
  const { blob } = await createEmissionDocumentsPdf([source]);
  assert.deepEqual(source, before, 'modelo e dados de cadastro não são alterados');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true }).promise;
  try {
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.filter((item) => 'str' in item).map((item) => item.str).join(' ');
  } finally { await pdf.destroy(); }
};

for (const documento of ['pasta_identificacao', 'ficha_matricula'] as const) {
  test(`${documento}: CIN usa CPF como número único no slot de identidade`, async () => {
    const text = await render(makeSource(documento, 'CIN'));
    assert.match(text, /\bCIN\b/);
    assert.equal(text.split(FORMATTED_CPF).length - 1, 1);
    assert.doesNotMatch(text, /RG \/ DOCUMENTO|\bCPF\b|987654321|SSP|01\/01\/2020/);
    assert.match(text, /UNIV-269999/);
  });
  for (const type of ['RG (ANTIGO)', 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO']) {
    test(`${documento}: ${type} conserva RG e CPF separados sem inferir CIN`, async () => {
      const text = await render(makeSource(documento, type));
      assert.match(text, /RG \/ DOCUMENTO/);
      assert.match(text, /\bCPF\b/);
      assert.ok(text.includes(FORMATTED_CPF));
      assert.ok(text.includes(RG));
      assert.doesNotMatch(text, /111\.111\.111-11/);
    });
  }
}

test('adapter CIN mantém estilos, slots e texto configurado fora das células de identidade', () => {
  const original = '<div style="grid-template-columns:1fr 2fr"><div style="color:red"><strong>RG / Documento</strong>{{ALUNO_RG}}</div><div style="grid-column:span 2"><strong>CPF</strong>{{ALUNO_CPF}}</div><div>Texto institucional</div></div>';
  const result = prepareRegistrationIdentityTemplate(original, true);
  assert.equal(result, '<div style="grid-template-columns:1fr 2fr"><div style="color:red"><strong>CIN</strong>{{ALUNO_RG}}</div><div style="grid-column:span 2"></div><div>Texto institucional</div></div>');
  assert.equal(prepareRegistrationIdentityTemplate(original, false), original);
  const cpfOnly = '<div><strong>CPF</strong>{{ALUNO_CPF}}</div>';
  assert.equal(prepareRegistrationIdentityTemplate(cpfOnly, true), '<div><strong>CIN</strong>{{ALUNO_CPF}}</div>', 'modelo sem slot identidade mantém número único com rótulo CIN');
});
