import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { createEmissionDocumentsPdf, getRegistrationWatermarkGeometry, resolveRegistrationSnapshotTemplate } from './emission-document.pdf';
import { makeEmission, makePreview, makeSource, makeBoletimSource } from './emission-document.pdf.contract.fixtures';

test('marca congelada respeita escala não padrão em geometria A4 canônica', () => {
  const geometry = getRegistrationWatermarkGeometry(37);
  assert.equal(geometry.scale, 37);
  assert.equal(geometry.width, 77.7);
  assert.equal(geometry.height, 109.89);
  assert.equal(geometry.x, 66.15);
  assert.equal(geometry.y, 93.555);
  assert.notEqual(geometry.width, getRegistrationWatermarkGeometry(50).width);
});

test('segunda via preserva campos eleitorais vazios do snapshot sem ler cadastro vivo', () => {
  const emission = makeEmission(1);
  emission.dados_emissao = {
    ...emission.dados_emissao,
    studentVoterId: '',
    studentVoterZone: '',
    studentVoterSection: '',
    studentVoterIssueDate: '',
    studentVoterState: '',
  };
  emission.aluno = {
    id: emission.aluno_id,
    nome: 'PESSOA EXEMPLO',
    cpf_cnpj: '00000000000',
    titulo_eleitor: 'DADO-VIVO-INDEVIDO',
    titulo_eleitor_zona: '999',
    titulo_eleitor_secao: '8888',
    titulo_eleitor_data_emissao: '2026-01-01',
    titulo_eleitor_uf: 'AL',
  };

  const rendered = resolveRegistrationSnapshotTemplate(
    '{{ALUNO_TITULO_ELEITOR}}|{{ALUNO_TITULO_ZONA}}|{{ALUNO_TITULO_SECAO}}|{{ALUNO_TITULO_EMISSAO}}|{{ALUNO_TITULO_UF}}',
    emission,
    makePreview(),
  );
  assert.equal(rendered, '|||—|');
  assert.doesNotMatch(rendered, /DADO-VIVO-INDEVIDO|999|8888|2026|AL/);
});

test('snapshot por presença impede vazamento de qualquer dado oficial vivo', () => {
  const emission = makeEmission(1);
  emission.dados_emissao = {
    ...emission.dados_emissao,
    studentName: '',
    studentCpf: '',
    studentRg: '',
    studentBirthDate: '',
    studentMotherName: '',
    enrollmentStatus: '',
  };
  emission.aluno = {
    id: emission.aluno_id,
    nome: 'NOME VIVO INDEVIDO',
    cpf_cnpj: '11111111111',
    rg: 'RG-VIVO-INDEVIDO',
    data_nascimento: '1999-01-01',
    nome_mae: 'MÃE VIVA INDEVIDA',
  };
  emission.matricula = {
    id: emission.matricula_id,
    status: 'STATUS-VIVO-INDEVIDO',
  };

  const rendered = resolveRegistrationSnapshotTemplate(
    '{{ALUNO_NOME}}|{{ALUNO_CPF}}|{{ALUNO_RG}}|{{ALUNO_NASCIMENTO}}|{{ALUNO_MAE}}|{{MATRICULA_STATUS}}|{{POLO_NOME}}',
    emission,
    makePreview(),
  );
  assert.equal(rendered, '|||—|||INSTITUIÇÃO CONGELADA DE EXEMPLO');
  assert.doesNotMatch(rendered, /VIVO|111\.111|1999/);
});

test('lote representativo gera um único PDF vetorial multipágina e selecionável', async () => {
  const progress: number[] = [];
  const sources = Array.from({ length: 12 }, (_, index) => makeSource(index + 1));
  const result = await createEmissionDocumentsPdf(sources, {
    onProgress: ({ current }) => progress.push(current),
  });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const latin1 = new TextDecoder('latin1').decode(bytes);

  assert.match(latin1.slice(0, 8), /^%PDF-/);
  assert.ok(result.blob.size > 10_000);
  assert.equal(progress.at(-1), 12);
  assert.ok((latin1.match(/\/Type\s*\/Page\b/g) || []).length >= 24);
  assert.match(latin1, /\/Subtype\s*\/Image/);
  assert.doesNotMatch(latin1, /\/Width\s+(?:595|794)\b[\s\S]*?\/Height\s+(?:842|1123)\b/);

  if (process.env.SECRETARIA_REGISTRATION_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.SECRETARIA_REGISTRATION_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('boletim com sete componentes reserva o rodapé e gera tabela totalmente vetorial', async () => {
  const result = await createEmissionDocumentsPdf([makeBoletimSource()]);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const latin1 = new TextDecoder('latin1').decode(bytes);

  assert.match(latin1.slice(0, 8), /^%PDF-/);
  assert.ok(result.blob.size > 5_000);
  assert.doesNotMatch(latin1, /\/Width\s+(?:595|794)\b[\s\S]*?\/Height\s+(?:842|1123)\b/);

  if (process.env.SECRETARIA_BOLETIM_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.SECRETARIA_BOLETIM_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('boletim bloqueia explicitamente uma tabela maior do que a área segura', async () => {
  const source = makeBoletimSource();
  const academicData = source.preview.academicData;
  assert.ok(academicData);
  const example = academicData.componentes[0];
  academicData.componentes = Array.from({ length: 30 }, (_, index) => ({
    ...example,
    disciplineOrder: index + 1,
    discipline: `Componente curricular de exemplo ${index + 1}`,
  }));

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /tabela do boletim invade a faixa reservada/i,
  );
});

test('overflow e token residual falham sem inventar nova página', async () => {
  await assert.rejects(
    createEmissionDocumentsPdf([makeSource(1, makePreview({
      pageCount: 1,
      textContent: `<p>${'CONTEÚDO CANÔNICO '.repeat(2_000)}</p>`,
    }))]),
    /ultrapassa a área canônica da página/,
  );

  await assert.rejects(
    createEmissionDocumentsPdf([makeSource(2, makePreview({
      pageCount: 1,
      textContent: '<p>{{VARIAVEL_NAO_RESOLVIDA}}</p>',
    }))]),
    /variável não resolvida/,
  );
});

test('pipeline vetorial oficial não captura DOM nem rasteriza folha A4', async () => {
  const [compositor, issuedModal, historyPage, historyService, emissionService, contractHistory] = await Promise.all([
    readFile(new URL('./emission-document.pdf.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/SecretariaIssuedDocumentModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaHistoricoEmissoesPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./historico-emissoes.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/secretaria-documentos.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('./contract-history-pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(compositor, /html2canvas|createElement\(['"]canvas|toDataURL\(/);
  assert.match(issuedModal, /isOfficialVectorDocument/);
  assert.match(issuedModal, /VectorIssuedDocumentModal/);
  assert.match(issuedModal, /CanonicalDocumentPreviewModal/);
  assert.match(historyPage, /isContractDocument\(selectedEmission\.documento\)[\s\S]*isOfficialVectorDocument\(selectedEmission\.documento\)/);
  assert.match(historyPage, /import \{ createContractHistoryPdf[^}]*\} from '\.\/contract-history-pdf'/);
  assert.match(contractHistory, /createContratosAlunoPdf\(\[toContractPreparedDocument\(emission\)\]\)/);
  assert.match(contractHistory, /isContratoAlunoRenderPayloadReady\(document\)/);
  assert.match(contractHistory, /frozen\.templateSnapshot/);
  assert.match(contractHistory, /frozen\.contractSnapshot/);
  assert.match(contractHistory, /frozen\.renderedDocument/);
  assert.match(historyPage, /await printPdfBlob\(pdfBlob/);
  assert.match(historyService, /hasSnapshotKey\(emission, 'institutionSnapshot'\)/);
  assert.match(historyService, /hasSnapshotKey\(emission, 'watermarkSnapshot'\)/);
  assert.match(emissionService, /O snapshot oficial de Pasta\/Ficha não pôde ser relido/);
});
