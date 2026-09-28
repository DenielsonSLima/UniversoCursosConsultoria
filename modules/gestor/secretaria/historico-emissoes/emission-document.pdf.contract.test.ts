import './emission-document.pdf.snapshot.contract.test.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { createEmissionDocumentsPdf, emissionHtmlToVectorText, resolveRegistrationSnapshotTemplate } from './emission-document.pdf';
import { repairFichaVoterGrid } from '../../cadastros/ficha-matricula/voter-template-repair';
import { stripRedundantPastaFooter } from '../../cadastros/ficha-matricula/pasta-template-geometry';
import { extractPdfText, REAL_DOCUMENTS_GRID, REAL_LEGACY_FICHA_DOCUMENTS_GRID, makePreview, makeSource } from './emission-document.pdf.contract.fixtures';

test('texto HTML vira objetos textuais sem carregar marcação ou script', () => {
  assert.equal(
    emissionHtmlToVectorText('<section><strong>Nome</strong><span>Pessoa Exemplo</span><script>falha()</script></section>'),
    'Nome: Pessoa Exemplo',
  );
});

test('documentos oficiais reutilizam o cabeçalho institucional compartilhado', async () => {
  const [exporter, canonicalHeader] = await Promise.all([
    readFile(new URL('./emission-document.pdf.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/canonical-institutional-header-pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(exporter, /drawCanonicalInstitutionalHeader/);
  assert.doesNotMatch(exporter, /const\s+draw(?:Institution|Institutional)Header\s*=/);
  assert.match(canonicalHeader, /PORTRAIT_INSTITUTIONAL_HEADER_LAYOUT/);
  assert.match(canonicalHeader, /LANDSCAPE_INSTITUTIONAL_HEADER_LAYOUT/);
  assert.match(canonicalHeader, /institution\.unitLabel\.toUpperCase\(\)/);
  assert.match(canonicalHeader, /CANONICAL_INSTITUTIONAL_HEADER_LEGACY_LABELS/);
  assert.match(canonicalHeader, /["']CNPJ["']/);
  assert.match(canonicalHeader, /["']Contato["']/);
  assert.match(canonicalHeader, /["']Endereço["']/);
  assert.match(canonicalHeader, /["']Email["']/);
});

test('fixture reproduz os 10 blocos visuais oficiais de Documentos em 92px', () => {
  assert.match(REAL_DOCUMENTS_GRID, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.match(REAL_DOCUMENTS_GRID, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  const dataCells = (REAL_DOCUMENTS_GRID.match(/<strong>/g) || []).length;
  assert.equal(dataCells, 9);
  assert.equal(dataCells + 1, 10, 'cabeçalho Documentos + nove células canônicas');
  const field = (makePreview().template as { absoluteFields: Array<{ id: string; height: number }> })
    .absoluteFields.find((item) => item.id === 'ficha_documentos');
  assert.equal(field?.height, 92);
});

test('fixture real legada 4x2 é reparada e gera PDF sem overflow', async () => {
  const repaired = repairFichaVoterGrid(REAL_LEGACY_FICHA_DOCUMENTS_GRID);
  assert.match(repaired, /grid-template-columns:1\.15fr 1\.15fr \.6fr \.6fr 1fr 1fr/);
  assert.match(repaired, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((repaired.match(/<strong\b/g) || []).length, 9);

  const preview = makePreview();
  const template = preview.template as { absoluteFields: Array<{ id: string; value: string }> };
  const documentField = template.absoluteFields.find((field) => field.id === 'ficha_documentos');
  assert.ok(documentField);
  documentField.value = repaired;

  const pdf = await createEmissionDocumentsPdf([makeSource(1, preview)]);
  assert.ok(pdf.blob.size > 1_000);
});

test('compositor repara snapshot legado e quebra o código completo abaixo do QR', async () => {
  const validationCode = 'FICHA-MAT-D278-1719-6ABC-9XYZ';
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_documentos',
      type: 'text',
      value: REAL_LEGACY_FICHA_DOCUMENTS_GRID,
      x: 76,
      y: 622,
      width: 642,
      height: 92,
      style: { fontSize: '10px' },
    }, {
      id: 'ficha_qr_regressao',
      type: 'qrcode',
      value: '',
      x: 611,
      y: 929,
      width: 100,
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  source.emission.codigo = validationCode;
  source.emission.validacao_publica = true;
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    studentVoterId: '123456789012',
    studentVoterZone: '987',
    studentVoterSection: '6543',
    studentVoterIssueDate: '2024-03-04',
    studentVoterState: 'AL',
  };

  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);
  const compactText = text.replace(/\s/g, '');

  assert.match(text, /ZONA/i);
  assert.match(text, /SEÇÃO/i);
  assert.match(text, /EMISSÃO \/ UF/i);
  assert.match(text, /987/);
  assert.match(text, /6543/);
  assert.match(text, /04\/03\/2024 \/ AL/);
  assert.ok(compactText.includes(validationCode), 'o código completo deve sobreviver às quebras de linha');
  assert.doesNotMatch(text, /…|\.\.\./);

  const outputPath = process.env.SECRETARIA_FICHA_QR_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('Pasta legada usa a mesma grade eleitoral completa da Ficha', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'pasta_documentos',
      type: 'text',
      value: REAL_LEGACY_FICHA_DOCUMENTS_GRID,
      x: 76,
      y: 690,
      width: 642,
      height: 92,
      style: { fontSize: '10px' },
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(2, preview);
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    studentVoterId: '123456789012',
    studentVoterZone: '987',
    studentVoterSection: '6543',
    studentVoterIssueDate: '2024-03-04',
    studentVoterState: 'AL',
  };

  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);

  assert.match(text, /ZONA/i);
  assert.match(text, /SEÇÃO/i);
  assert.match(text, /EMISSÃO \/ UF/i);
  assert.match(text, /987/);
  assert.match(text, /6543/);
  assert.match(text, /04\/03\/2024 \/ AL/);

  const outputPath = process.env.SECRETARIA_PASTA_VOTER_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('assinaturas da Ficha preservam linhas vetoriais e rótulos centralizados', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_assinaturas',
      type: 'text',
      value: '{{FICHA_ASSINATURAS}}',
      x: 76,
      y: 946,
      width: 642,
      height: 42,
      style: { fontSize: '10px' },
    }],
    enrollmentFormRequiresSignature: true,
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  const resolved = resolveRegistrationSnapshotTemplate(
    '{{FICHA_ASSINATURAS}}',
    source.emission,
    source.preview,
  );

  assert.match(resolved, /display:grid/i);
  assert.match(resolved, /border-top:1px solid #0f172a/i);
  const pdf = await createEmissionDocumentsPdf([source]);
  const text = await extractPdfText(pdf.blob);
  assert.match(text, /ASSINATURA DO ALUNO OU RESPONSÁVEL/i);
  assert.match(text, /DEFERIMENTO DA DIRETORIA/i);

  const outputPath = process.env.SECRETARIA_FICHA_SIGNATURE_PDF_FIXTURE_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, new Uint8Array(await pdf.blob.arrayBuffer()));
  }
});

test('código de QR maior que a área reservada falha em vez de truncar', async () => {
  const preview = makePreview({
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'ficha_qr_sem_altura',
      type: 'qrcode',
      value: '',
      x: 611,
      y: 929,
      width: 60,
      height: 80,
    }],
  });
  preview.watermark = null;
  preview.polo = { ...preview.polo, logoUrl: null };
  const source = makeSource(1, preview);
  source.emission.codigo = `FICHA-MAT-${'CODIGO-MUITO-LONGO-'.repeat(8)}`;
  source.emission.validacao_publica = true;

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /código de validação.+ultrapassa a área canônica/i,
  );
});

test('snapshot legado da Pasta remove somente o rodapé institucional duplicado', async () => {
  const legacyFooter = {
    id: 'pasta_rodape',
    type: 'text',
    value: `
      <section style="padding:5px 8px;text-align:center;">
        <strong>{{POLO_NOME}}</strong><span> • CNPJ {{POLO_CNPJ}}</span><br>
        <span>{{POLO_ENDERECO_COMPLETO}}</span><br>
        <span>Telefone: {{POLO_TELEFONE}} • E-mail: {{POLO_EMAIL}}</span>
      </section>
    `,
    x: 76,
    y: 1013,
    width: 642,
    style: { fontSize: '10px' },
  };
  const legacyTemplate = {
    v: 9,
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [legacyFooter],
  };
  const source = makeSource(2, makePreview(legacyTemplate));
  source.emission.documento = 'pasta_identificacao';

  await assert.rejects(
    createEmissionDocumentsPdf([source]),
    /pasta_rodape.*ultrapassa a área canônica da página/,
  );

  const stripped = stripRedundantPastaFooter(legacyTemplate);
  assert.notEqual(stripped, legacyTemplate);
  assert.equal(legacyFooter.y, 1013, 'o snapshot persistido não pode ser mutado');
  assert.equal(legacyTemplate.absoluteFields.length, 1);
  assert.equal(stripped.absoluteFields.length, 0);

  source.preview.template = stripped;
  const pdf = await createEmissionDocumentsPdf([source]);
  assert.ok(pdf.blob.size > 1_000);
  const text = await extractPdfText(pdf.blob);
  assert.equal(
    text.match(/INSTITUIÇÃO CONGELADA DE EXEMPLO/g)?.length,
    1,
    'a identidade institucional deve aparecer somente no cabeçalho canônico',
  );

  if (process.env.SECRETARIA_PASTA_FOOTER_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.SECRETARIA_PASTA_FOOTER_PDF_FIXTURE_OUTPUT,
      new Uint8Array(await pdf.blob.arrayBuffer()),
    );
  }
});

test('modelo v13 da Pasta remove o rodapé canônico que repete o cabeçalho', async () => {
  const template = {
    v: 13,
    pageCount: 1,
    textContent: '<div style="min-height:1px;"></div>',
    absoluteFields: [{
      id: 'pasta_rodape',
      type: 'text',
      value: `
        <section style="padding:5px 8px;text-align:center;">
          <strong>{{POLO_NOME}}</strong><span> • CNPJ {{POLO_CNPJ}}</span><br>
          <span>{{POLO_ENDERECO_COMPLETO}}</span><br>
          <span>Telefone: {{POLO_TELEFONE}} • E-mail: {{POLO_EMAIL}}</span>
        </section>
      `,
      x: 76,
      y: 930,
      width: 642,
      height: 100,
      style: { fontSize: '10px' },
    }],
  };
  const source = makeSource(2, makePreview(template));
  source.emission.documento = 'pasta_identificacao';
  source.emission.dados_emissao = {
    ...source.emission.dados_emissao,
    institutionSnapshot: {
      nome: 'INSTITUIÇÃO EDUCACIONAL DE EXEMPLO COM RAZÃO SOCIAL EXTENSA',
      nomeFantasia: 'INSTITUIÇÃO EDUCACIONAL DE EXEMPLO',
      cnpj: '00.000.000/0000-00',
      endereco: 'AVENIDA INSTITUCIONAL DE EXEMPLO COM DENOMINAÇÃO PROPOSITALMENTE EXTENSA',
      numero: '1000',
      complemento: 'BLOCO ADMINISTRATIVO',
      bairro: 'BAIRRO DE EXEMPLO',
      cidade: 'CIDADE DE EXEMPLO',
      uf: 'EX',
      cep: '00000-000',
      telefone: '(00) 00000-0000 / (00) 0000-0000',
      email: 'secretaria.documentos.institucionais@example.invalid',
      logoUrl: null,
    },
  };

  const stripped = stripRedundantPastaFooter(template);
  assert.notEqual(stripped, template);
  assert.equal(template.absoluteFields.length, 1, 'o snapshot original deve permanecer intacto');
  assert.equal(stripped.absoluteFields.length, 0);
  source.preview.template = stripped;
  const pdf = await createEmissionDocumentsPdf([source]);
  assert.ok(pdf.blob.size > 1_000);
  const text = await extractPdfText(pdf.blob);
  assert.equal(
    text.match(/INSTITUIÇÃO EDUCACIONAL DE EXEMPLO/g)?.length,
    1,
    'o rodapé não deve repetir o nome institucional do cabeçalho',
  );
});

test('rodapé personalizado da Pasta não é removido pela compatibilidade', () => {
  const template = {
    v: 13,
    absoluteFields: [{
      id: 'pasta_rodape',
      type: 'text',
      value: '<p>Texto personalizado que não repete o cabeçalho.</p>',
      x: 76,
      y: 930,
      width: 642,
      height: 100,
    }],
  };

  assert.equal(stripRedundantPastaFooter(template), template);
});

