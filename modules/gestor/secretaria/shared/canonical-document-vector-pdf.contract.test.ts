import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { TextDecoder } from 'node:util';

import { createCarteirinhasPreceptorPdf } from '../carteirinhas-preceptor/carteirinhas-preceptor.pdf';
import { createContratosAlunoPdf } from '../contratos-aluno/contratos-aluno.pdf';
import { parseContratoAlunoClosingLayout } from '../../../shared/contrato-aluno/closing-layout';
import { normalizeCanonicalPdfText } from './canonical-document-vector-pdf';
import type { CarteirinhaPreceptorPreparedDocument } from '../carteirinhas-preceptor/types/carteirinhas-preceptor.types';
import type { ContratoAlunoPreparedDocument } from '../contratos-aluno/types/contratos-aluno.types';

const contractFixture = (): ContratoAlunoPreparedDocument => ({
  emissionId: 'contrato-vetorial-teste',
  documentId: null,
  title: 'Contrato de teste',
  targetName: 'Aluno de teste',
  validationCode: 'CON-TESTE-VETORIAL',
  validationUrl: null,
  validUntil: null,
  fileUrl: null,
  statusLabel: null,
  renderPayload: {
    template: null,
    snapshot: { validacao: { validadeExibicao: 'Sem vencimento' } },
    templateRevision: 1,
    rendered: {
      kind: 'CONTRATO_ALUNO',
      pages: [{
        header: 'Universo Cursos e Consultoria',
        title: 'Contrato de prestação de serviços educacionais',
        body: 'Corpo canônico de teste. Este texto deve permanecer selecionável no arquivo PDF.',
        footer: 'Rodapé canônico de teste.',
      }],
      watermark: {
        enabled: true,
        label: 'UNIVERSO',
        imageUrl: null,
        opacity: 0.06,
      },
      qr: {
        enabled: true,
        label: 'Validar documento',
        validityLabel: 'Sem vencimento',
      },
      front: null,
      back: null,
    },
  },
});

const preceptorFixture = (suffix = '1'): CarteirinhaPreceptorPreparedDocument => ({
  emissionId: `preceptor-vetorial-${suffix}`,
  documentId: null,
  title: 'Carteirinha de preceptor',
  targetName: `Professor de teste ${suffix}`,
  validationCode: `PRE-VETORIAL-${suffix}`,
  validationUrl: null,
  validUntil: null,
  fileUrl: null,
  statusLabel: null,
  renderPayload: {
    template: {
      mostrarFoto: false,
      mostrarPolo: true,
      marcaDaguaHabilitada: true,
    },
    snapshot: {
      instituicao: { nome: 'Universo Cursos e Consultoria' },
      validacao: { validadeExibicao: 'Sem vencimento' },
    },
    templateRevision: 1,
    rendered: {
      kind: 'CARTEIRINHA_PRECEPTOR',
      pages: [],
      watermark: {
        enabled: true,
        label: 'UNIVERSO',
        imageUrl: null,
        opacity: 0.08,
      },
      qr: {
        enabled: true,
        label: 'Validação',
        validityLabel: 'Sem vencimento',
      },
      front: {
        subtitle: 'Universo Cursos e Consultoria',
        title: 'Preceptor(a)',
        holder_name: `Professor de teste ${suffix}`,
        role: 'Preceptor(a)',
        area: 'Enfermagem',
        institution: 'Polo Matriz',
      },
      back: {
        message: 'Credencial institucional de uso pessoal e intransferível.',
        footer: 'Documento institucional',
        validity_label: 'Sem vencimento',
      },
    },
  },
});

test('contrato gera PDF nativo e bloqueia paginação visual no navegador', async () => {
  const document = await createContratosAlunoPdf([contractFixture()]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());

  assert.equal(document.fileName, 'contrato-aluno-contrato-vetorial-teste.pdf');
  assert.match(new TextDecoder('latin1').decode(bytes.slice(0, 8)), /^%PDF-/);
  assert.ok(document.blob.size > 1_000);

  const tooLong = contractFixture();
  if (!tooLong.renderPayload?.rendered?.pages[0]) throw new Error('Fixture inválida.');
  tooLong.renderPayload.rendered.pages[0].body = 'Cláusula canônica. '.repeat(4_000);
  await assert.rejects(
    () => createContratosAlunoPdf([tooLong]),
    /ultrapassa a área segura.*paginação no servidor/i,
  );

  if (process.env.CANONICAL_CONTRACT_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CANONICAL_CONTRACT_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('encerramento do contrato preserva quebras e só recebe QR na folha final', async () => {
  const fixture = contractFixture();
  if (!fixture.renderPayload?.rendered) throw new Error('Fixture inválida.');
  fixture.renderPayload.rendered.pages = [
    {
      header: 'Universo Cursos e Consultoria',
      title: 'Contrato de prestação de serviços educacionais',
      body: 'Primeira página canônica sem encerramento ou assinaturas.',
      footer: null,
    },
    {
      header: 'Universo Cursos e Consultoria',
      title: 'Contrato de prestação de serviços educacionais — continuação',
      body: 'Última página canônica.',
      footer: 'Japoatã/SE, 07/08/2026.\\n\\nCONTRATANTE: ____________________________\\nCONTRATADA: ____________________________\\n\\nTestemunhas: ____________________________\\n____________________________',
    },
  ];

  assert.equal(
    normalizeCanonicalPdfText(fixture.renderPayload.rendered.pages[1].footer),
    'Japoatã/SE, 07/08/2026.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunhas: ____________________________\n____________________________',
  );

  const document = await createContratosAlunoPdf([fixture]);
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_CONTRACT_LAST_PAGE_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CANONICAL_CONTRACT_LAST_PAGE_FIXTURE_OUTPUT,
      new Uint8Array(await document.blob.arrayBuffer()),
    );
  }
});

test('encerramento da minuta separa assinaturas e testemunhas em duas colunas', () => {
  const layout = parseContratoAlunoClosingLayout(
    'Japoatã/SE, 07/08/2026.\n\nCONTRATANTE: ____________________________\nCONTRATADA: ____________________________\n\nTestemunhas: ____________________________\n____________________________',
  );

  assert.equal(layout.fallbackText, null);
  assert.equal(layout.location, 'Japoatã/SE, 07/08/2026.');
  assert.deepEqual(layout.parties.map((party) => party.label), ['CONTRATANTE', 'CONTRATADA']);
  assert.deepEqual(layout.parties.map((party) => party.value), ['', '']);
  assert.deepEqual(layout.witnesses.map((witness) => witness.label), ['TESTEMUNHA 1', 'TESTEMUNHA 2']);
  assert.deepEqual(layout.witnesses.map((witness) => witness.value), ['', '']);
});

test('carteirinhas geram PDF nativo com folhas físicas frente e verso', async () => {
  const document = await createCarteirinhasPreceptorPdf([
    preceptorFixture('1'),
    preceptorFixture('2'),
  ]);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());

  assert.equal(document.fileName, 'carteirinhas-preceptor-lote-2.pdf');
  assert.match(new TextDecoder('latin1').decode(bytes.slice(0, 8)), /^%PDF-/);
  assert.ok(document.blob.size > 1_000);

  if (process.env.CANONICAL_PRECEPTOR_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CANONICAL_PRECEPTOR_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('preview oficial recebe um Blob PDF nativo, sem conversor de página em canvas', async () => {
  const [modal, contractPdf, preceptorPdf] = await Promise.all([
    readFile(new URL('./CanonicalDocumentPreviewModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../contratos-aluno/contratos-aluno.pdf.ts', import.meta.url), 'utf8'),
    readFile(new URL('../carteirinhas-preceptor/carteirinhas-preceptor.pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(modal, /<iframe/);
  assert.match(modal, /createPdfRef\.current\(currentItems/);
  assert.match(modal, /createPortal\(modal, document\.body\)/);
  assert.match(modal, /id="canonical-document-preview-modal"/);
  assert.doesNotMatch(modal, /dom-to-selectable-pdf|createSelectablePdfBuilder|html2canvas/);
  assert.doesNotMatch(contractPdf, /html2canvas|createElement\('canvas'\)|toDataURL\(/);
  assert.doesNotMatch(preceptorPdf, /html2canvas|createElement\('canvas'\)|toDataURL\(/);
  assert.match(contractPdf, /contrato-qr-\$\{document\.emissionId\}/);
  assert.match(contractPdf, /visualPageIndex === visual\.pages\.length - 1/);
  assert.match(contractPdf, /const hasClosing = isFinalPage/);
  assert.match(contractPdf, /drawContractClosing/);
  assert.match(contractPdf, /const CLOSING_TOP = 210/);
  assert.match(preceptorPdf, /preceptor-qr-\$\{card\.source\.emissionId\}/);
  assert.match(preceptorPdf, /CARDS_PER_SHEET = 10/);
});
