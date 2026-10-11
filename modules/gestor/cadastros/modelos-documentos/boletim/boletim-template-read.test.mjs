import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const entry = fileURLToPath(new URL('./boletim.service.ts', import.meta.url));
const shared = fileURLToPath(new URL('../shared/document-template.service.ts', import.meta.url));
const history = '../../../secretaria/historico-emissoes/';
const historyFile = (name) => fileURLToPath(new URL(history + name, import.meta.url));
const result = await build({
  stdin: { contents: `export {boletimService} from ${JSON.stringify(entry)};
    export {migrateBoletimTemplate} from ${JSON.stringify(entry)};
    export {createDocumentTemplateService} from ${JSON.stringify(shared)};
    export {createEmissionDocumentsPdf} from ${JSON.stringify(historyFile('emission-document.pdf.ts'))};
    export {resolveAcademicSnapshotTemplate} from ${JSON.stringify(historyFile('emission-registration-snapshot.ts'))};
    export {makeBoletimSource} from ${JSON.stringify(historyFile('emission-document.pdf.contract.fixtures.ts'))};
    export {buildAcademicPreviewFromPayload,loadAcademicPreview} from ${JSON.stringify(historyFile('academic-preview.ts'))};`,
    resolveDir: '/', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  banner: { js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(import.meta.url)});` },
  plugins: [{ name: 'template-query', setup(plugin) {
    // O mapper só usa escapeHtmlText; nenhuma sanitização DOM participa do PDF nativo.
    plugin.onResolve({ filter: /^dompurify$/ }, () => ({ path: 'unused-purify', namespace: 'node-only' }));
    plugin.onLoad({ filter: /.*/, namespace: 'node-only' }, () => ({ loader: 'js', contents:
      `export default {addHook(){},sanitize(){throw new Error('Sanitização DOM inesperada no teste vetorial')}};` }));
    plugin.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
      export const supabase={rpc(name,args){
        const io=globalThis.__boletimTemplateReadIo;io.rpcCalls.push({name,args});
        return Promise.resolve({data:io.academic,error:null});
      },from(table){
        if(table!=='documentos_templates')throw new Error('Unexpected table');
        return{select(){return this},eq(field,id){this.id=id;return this},async maybeSingle(){
          const io=globalThis.__boletimTemplateReadIo;io.queries.push(this.id);
          return io.results[this.id]??{data:null,error:null};
        }};
      }};` }));
  } }],
});
const { boletimService, migrateBoletimTemplate, createDocumentTemplateService,
  createEmissionDocumentsPdf, resolveAcademicSnapshotTemplate, makeBoletimSource,
  buildAcademicPreviewFromPayload, loadAcademicPreview } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);
const start = (results = {}) => {
  globalThis.__boletimTemplateReadIo = { results, queries: [], rpcCalls: [], academic: null };
  return globalThis.__boletimTemplateReadIo;
};

test('boletim bloqueia erro no modelo principal sem substituir por modelo legado ou genérico', async () => {
  const error = new Error('Falha sintética na consulta principal');
  const io = start({ boletim_tecnico: { data: null, error } });
  await assert.rejects(boletimService.getTemplate('TECNICO'), (actual) => actual === error);
  assert.deepEqual(io.queries, ['boletim_tecnico']);
});

test('ausência principal permite modelo legado persistido, mas erro legado bloqueia emissão', async () => {
  const frozen = { v: 3, textContent: 'Modelo sintético legado', absoluteFields: [] };
  const io = start({ boletim_tecnico_TECNICO: { data: { conteudo: frozen }, error: null } });
  assert.equal(await boletimService.getTemplate('TECNICO'), frozen);
  assert.deepEqual(io.queries, ['boletim_tecnico', 'boletim_tecnico_TECNICO']);
  const error = new Error('Falha sintética na consulta legada');
  start({ boletim_tecnico_TECNICO: { data: null, error } });
  await assert.rejects(boletimService.getTemplate('TECNICO'), (actual) => actual === error);
});

test('boletim usa o fallback do editor somente após ausência confirmada dos dois modelos', async () => {
  const io = start();
  const fallback = await boletimService.getTemplate('TECNICO');
  assert.deepEqual(io.queries, ['boletim_tecnico', 'boletim_tecnico_TECNICO']);
  assert.equal(fallback.v, 4);
  assert.match(fallback.textContent, /TABELA_BOLETIM_TECNICO/);
  assert.equal(fallback.absoluteFields.find((field) => field.id === 'boletim_assinatura').y, 930);
});

test('outros documentos preservam fallback anterior quando não habilitam leitura estrita', async () => {
  const fallback = { textContent: 'Fallback sintético', absoluteFields: [] };
  const service = createDocumentTemplateService('synthetic', fallback);
  const io = start({ synthetic_POLO: { data: null, error: { message: 'Falha sintética' } } });
  assert.deepEqual(await service.getTemplate('POLO'), fallback);
  assert.deepEqual(io.queries, ['synthetic_POLO']);
});

const studentHeader = '<p>Aluno(a): {{ALUNO_NOME}} &nbsp; Matrícula: {{ALUNO_MATRICULA}}</p>';
const identityLine = '<p>CPF nº {{ALUNO_CPF}}, {{ALUNO_DOCUMENTO_TIPO}} nº {{ALUNO_RG}}</p>';

test('modelo vivo padrão recebe identificação sem alterar assinatura, QR, estilos ou coordenadas', async () => {
  start();
  const fallback = await boletimService.getTemplate('TECNICO');
  const saved = { ...fallback, v: 3, textContent: fallback.textContent.replace(identityLine, ''),
    absoluteFields: [
      { id: 'boletim_data', type: 'text', value: 'Emitido em {{DATA_ATUAL}}', x: 78, y: 881,
        width: 260, style: { fontSize: '12px', textAlign: 'left', fontWeight: 'bold' } },
      { id: 'boletim_assinatura', type: 'text', value: '___________________________________________\nDiretora(a) Geral',
        x: 236, y: 997, width: 325, style: { fontSize: '13px', textAlign: 'center', whiteSpace: 'pre-line' } },
      { id: 'test-qr', type: 'qrcode', value: 'QR_VALIDADOR', x: 618, y: 825,
        width: 100, style: { zIndex: 50 } },
      { id: 'test-signature', type: 'image', value: 'SYNTHETIC_SIGNATURE', x: 274, y: 892,
        width: 241, height: 207, style: { zIndex: 50, mixBlendMode: 'multiply' } },
    ] };
  const before = JSON.stringify(saved);
  const updated = migrateBoletimTemplate(saved);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(updated.textContent, fallback.textContent);
  assert.deepEqual(updated.absoluteFields, saved.absoluteFields);
  assert.equal(updated.v, 4);
  assert.equal(migrateBoletimTemplate(updated), updated);
  for (const textContent of ['Modelo personalizado sem cabeçalho padrão',
    studentHeader + '<p>Documento {{ALUNO_RG}}</p>',
    studentHeader + '<p>Texto acadêmico personalizado sem identidade</p>']) {
    const custom = { ...saved, textContent };
    assert.equal(migrateBoletimTemplate(custom), custom);
  }
  const escapedLegacy = { ...saved, textContent: saved.textContent.replaceAll('"', '\\"') };
  assert.equal(migrateBoletimTemplate(escapedLegacy).textContent,
    escapedLegacy.textContent.replace(studentHeader, studentHeader + identityLine));
});

test('mapper puro preserva campos canônicos, inclusive vazios, sem substituir a RPC autorizada do aluno', async () => {
  const io = start();
  io.academic = { studentMatricula: 'UNIV-26010001', studentDocumentType: null, studentCpf: '',
    studentRg: null, componentes: [], mediaGeral: 7.8, frequenciaGeral: 82,
    cargaHorariaTotal: 90, cargaHorariaCumprida: 50 };
  const academic = buildAcademicPreviewFromPayload(io.academic);
  assert.equal(academic.studentMatricula, io.academic.studentMatricula);
  assert.equal(academic.studentDocumentType, null);
  assert.equal(academic.studentCpf, '');
  assert.equal(academic.studentRg, null);
  assert.equal(academic.mediaGeral, 7.8);
  assert.equal(academic.frequenciaGeral, 82);
  assert.equal(academic.cargaHorariaTotal, 90);
  assert.equal(io.rpcCalls.length, 0);
  assert.equal(Object.hasOwn(buildAcademicPreviewFromPayload({}), 'studentCpf'), false);
  const loaded = await loadAcademicPreview({ matricula_id: 'synthetic-enrollment', documento: 'historico_escolar' });
  assert.deepEqual(loaded, academic);
  assert.deepEqual(io.rpcCalls, [{ name: 'get_secretaria_documento_academico',
    args: { p_matricula_id: 'synthetic-enrollment', p_documento: 'historico_escolar' } }]);
});

test('boletim legado usa matrícula humana acadêmica e bloqueia falta de número sem imprimir UUID', () => {
  const source = makeBoletimSource();
  source.preview.academicData.studentMatricula = 'UNIV-26010269';
  for (const studentMatricula of [undefined, source.emission.matricula_id, '']) {
    source.emission.dados_emissao.studentMatricula = studentMatricula;
    const text = resolveAcademicSnapshotTemplate(source, 'Matrícula: {{ALUNO_MATRICULA}}');
    assert.equal(text, 'Matrícula: UNIV-26010269');
    assert.doesNotMatch(text, new RegExp(source.emission.matricula_id));
  }
  source.preview.academicData.studentMatricula = source.emission.matricula_id;
  assert.throws(() => resolveAcademicSnapshotTemplate(source, '{{ALUNO_MATRICULA}}'), /número da matrícula acadêmica/);
});

test('boletim do aluno conserva desempate canônico do backend nas duas tabelas', () => {
  const row = { moduleId: 'module', moduleName: 'Módulo 1', moduleOrder: 1,
    disciplineOrder: 1, cargaHoraria: 40, nota: 8, frequencia: 90, situacao: 'Aprovado' };
  const componentes = [{ ...row, discipline: 'Zoologia' }, { ...row, discipline: 'Anatomia' }];
  const payload = { componentes, mediaGeral: 8, frequenciaGeral: 90 };
  const canonical = buildAcademicPreviewFromPayload(payload, null, true);
  assert.deepEqual(canonical.componentes, componentes);
  assert.notEqual(canonical.componentes, componentes);
  for (const table of [canonical.componentesTable, canonical.historicoTable]) {
    assert.ok(table.indexOf('Zoologia') < table.indexOf('Anatomia'));
  }
  const gestor = buildAcademicPreviewFromPayload(payload);
  assert.deepEqual(gestor.componentes.map(component => component.discipline), ['Anatomia', 'Zoologia']);
  assert.deepEqual(payload.componentes, componentes);
});

const pngAsset = () => {
  const width = 280;
  const height = 90;
  const rowSize = width * 3 + 1;
  const pixels = Buffer.alloc(rowSize * height, 255);
  for (let row = 0; row < height; row += 1) pixels[row * rowSize] = 0;
  for (let x = 20; x < 260; x += 1) {
    const y = Math.round(43 + Math.sin(x / 19) * 15);
    pixels.set([37, 85, 155], y * rowSize + 1 + x * 3);
  }
  const chunk = (type, bytes) => {
    const body = Buffer.concat([Buffer.from(type), bytes]);
    let checksum = 0xffffffff;
    for (const byte of body) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit += 1) checksum = checksum >>> 1 ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    const crc = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')}`;
};

const textFromPdf = async (blob) => {
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    assert.equal(pdf.numPages, 1);
    const content = await (await pdf.getPage(1)).getTextContent();
    return content.items.filter(item => 'str' in item).map(item => item.str).join('\n');
  } finally { await pdf.destroy(); }
};

for (const [caseName, studentDocumentType, studentCpf, studentRg, expected, forbidden] of [
  ['rg', 'RG', '12345678909', '12.345.678', /CPF nº 123\.456\.789-09, RG/, /CIN/],
  ['cin', 'CIN', '12345678909', 'RG RESIDUAL', /CIN nº 123\.456\.789-09/, /CPF nº|RG RESIDUAL/],
  ['cni', 'CNI', '123.456.789-09', 'RG RESIDUAL', /CIN nº 123\.456\.789-09/, /CPF nº|RG RESIDUAL/],
  ['cpf', '', '12345678909', null, /CPF nº 123\.456\.789-09/, /CIN|Não informado|, nº/],
  ['no-number', 'RG', null, null, /DADOS ACADÊMICOS/, /CPF nº|RG nº|CIN nº|Não informado/],
]) test(`PDF ${caseName} usa modelo completo com seis disciplinas e identidade adaptável`, async () => {
  start();
  const template = await boletimService.getTemplate('TECNICO');
  const asset = pngAsset();
  const source = makeBoletimSource();
  Object.assign(source.emission.dados_emissao, {
    studentName: 'ALUNA SINTÉTICA DE TESTE', studentMatricula: 'UNIV-26010269',
    studentDocumentType, studentCpf, studentRg,
  });
  source.emission.dados_emissao.institutionSnapshot.logoUrl = asset;
  source.emission.dados_emissao.watermarkSnapshot = {
    watermarkUrl: asset, watermarkOpacity: 0.17, watermarkScale: 37, watermarkRotate: false,
  };
  source.preview.academicData.componentes = source.preview.academicData.componentes.slice(0, 6);
  source.preview.template = { ...template, absoluteFields: [
    { id: 'boletim_data', type: 'text', value: 'Emitido em {{DATA_ATUAL}}', x: 78, y: 881,
      width: 260, style: { fontSize: '12px', textAlign: 'left', fontWeight: 'bold' } },
    { id: 'boletim_assinatura', type: 'text', value: '___________________________________________\nDiretora(a) Geral',
      x: 236, y: 997, width: 325, style: { fontSize: '13px', textAlign: 'center', whiteSpace: 'pre-line' } },
    { id: 'test-qr', type: 'qrcode', value: 'QR_VALIDADOR', x: 618, y: 825,
      width: 100, style: { zIndex: 50 } },
    { id: 'test-signature', type: 'image', value: asset, x: 274, y: 892,
      width: 241, height: 207, style: { zIndex: 50, mixBlendMode: 'multiply' } },
  ] };
  const before = JSON.stringify(source);
  const result = await createEmissionDocumentsPdf([source]);
  assert.equal(JSON.stringify(source), before);
  const text = await textFromPdf(result.blob);
  assert.match(text, expected);
  assert.doesNotMatch(text, forbidden);
  assert.match(text, /UNIV-26010269/);
  assert.match(text, /Diretora\(a\) Geral/);
  assert.match(text, /Microbiologia, Parasitologia e Patologia/);
  assert.doesNotMatch(text, /\{\{|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
  const page = pdf.getPage(0);
  const images = page.node.Resources().lookup(PDFName.of('XObject'), PDFDict);
  const imageDimensions = images.keys().map(key => images.lookup(key))
    .filter(value => value instanceof PDFRawStream && String(value.dict.get(PDFName.of('Subtype'))) === '/Image')
    .map(value => [Number(String(value.dict.get(PDFName.of('Width')))), Number(String(value.dict.get(PDFName.of('Height'))))]);
  assert.ok(imageDimensions.length >= 2);
  assert.ok(imageDimensions.every(([width, height]) => width <= 640 && height <= 640), 'Somente assets isolados');
  const states = page.node.Resources().lookup(PDFName.of('ExtGState'), PDFDict);
  assert.ok(states.keys().some(key => String(states.lookup(key, PDFDict).get(PDFName.of('ca'))) === '0.17'));
  if (process.env.BOLETIM_PDF_ARTIFACTS) {
    await mkdir(process.env.BOLETIM_PDF_ARTIFACTS, { recursive: true });
    await writeFile(join(process.env.BOLETIM_PDF_ARTIFACTS, `boletim-${caseName}.pdf`),
      new Uint8Array(await result.blob.arrayBuffer()));
  }
});

test('snapshot histórico conserva texto e documento vazio explicitamente, ignorando cadastro atual', async () => {
  start();
  const source = makeBoletimSource();
  const template = await boletimService.getTemplate('TECNICO');
  const frozen = { ...template, v: 3, textContent: template.textContent.replace(identityLine, '') };
  source.preview.template = frozen;
  const frozenBefore = JSON.stringify(frozen);
  const text = await textFromPdf((await createEmissionDocumentsPdf([source])).blob);
  assert.equal(JSON.stringify(source.preview.template), frozenBefore);
  assert.doesNotMatch(text, /CPF nº|RG nº|CIN nº/);
  Object.assign(source.emission.dados_emissao, { studentDocumentType: 'CIN', studentCpf: null, studentRg: null });
  Object.assign(source.preview.academicData, { studentDocumentType: 'CIN', studentCpf: '12345678909', studentRg: 'DADO VIVO' });
  assert.equal(resolveAcademicSnapshotTemplate(source, identityLine), '<p></p>');
});

test('modelo personalizado conserva nome, matrícula, tags e snapshot ao adaptar RG/CIN/CNI', async () => {
  const bodies = [
    '<div style="color:blue"><strong>Aluno(a):</strong> {{ALUNO_NOME}}; Matrícula: {{ALUNO_MATRICULA}}; <b>CPF nº</b> <span>{{ALUNO_CPF}}</span></div><div><strong>RG / Documento</strong> {{ALUNO_RG}}</div>',
    '<div><strong>Aluno(a): {{ALUNO_NOME}}; CPF nº {{ALUNO_CPF}}; Matrícula: {{ALUNO_MATRICULA}}</strong></div><div><strong>RG / Documento</strong> {{ALUNO_RG}}</div>',
    '<div><strong>Aluno(a): {{ALUNO_NOME}}</strong>; Matrícula: {{ALUNO_MATRICULA}}; RG nº {{ALUNO_RG}}</div>',
    '<div><strong>{{ALUNO_NOME}}</strong><span> - RG nº {{ALUNO_RG}}</span></div><p>Matrícula {{ALUNO_MATRICULA}}</p>',
    '<div><strong>{{ALUNO_NOME}}</strong>; Matrícula: {{ALUNO_MATRICULA}}; <b>CPF:</b> nº <span>{{ALUNO_CPF}}</span>; <strong>RG:</strong> nº {{ALUNO_RG}}</div>',
    '<p style="color:blue"><strong>Aluno(a): {{ALUNO_NOME}}</strong>; Matrícula: {{ALUNO_MATRICULA}}; CPF: nº {{ALUNO_CPF}}; RG: nº {{ALUNO_RG}}</p>',
    '<table><tbody><tr><td style="padding:4px"><strong>Aluno(a): {{ALUNO_NOME}}</strong>; Matrícula: {{ALUNO_MATRICULA}}; CPF: nº {{ALUNO_CPF}}; RG: nº {{ALUNO_RG}}</td></tr></tbody></table>',
  ];
  for (const body of bodies) {
    for (const studentDocumentType of ['RG', 'CIN', 'CNI', '']) {
      const source = makeBoletimSource();
      Object.assign(source.emission.dados_emissao, {
        studentName: 'ALUNA SINTETICA REVIEW', studentMatricula: 'UNIV-SYNTHETIC-001',
        studentDocumentType, studentCpf: '12345678909', studentRg: 'RG-REVIEW',
      });
      const template = { ...source.preview.template, v: 3,
        textContent: body + '{{TABELA_BOLETIM_TECNICO}}' };
      source.emission.dados_emissao.documentTemplateSnapshot = template;
      source.preview.template = template;
      const before = JSON.stringify(source);
      assert.equal(migrateBoletimTemplate(template), template);
      const parsed = resolveAcademicSnapshotTemplate(source, body);
      if (studentDocumentType) assert.deepEqual(parsed.match(/<[^>]*>/g), body.match(/<[^>]*>/g));
      assert.match(parsed, /ALUNA SINTETICA REVIEW/);
      assert.match(parsed, /UNIV-SYNTHETIC-001/);
      const result = await createEmissionDocumentsPdf([source]);
      const text = await textFromPdf(result.blob);
      assert.match(text, /ALUNA SINTETICA REVIEW/);
      assert.match(text, /UNIV-SYNTHETIC-001/);
      if (studentDocumentType === 'RG') {
        assert.match(text, /RG-REVIEW/);
      } else if (studentDocumentType) {
        assert.match(text, /CIN/);
        assert.equal(text.split('123.456.789-09').length - 1, 1);
        assert.doesNotMatch(text, /RG-REVIEW|CPF nº/);
      } else {
        if (body.includes('{{ALUNO_CPF}}')) assert.match(text, /CPF:?\s+nº\s+123\.456\.789-09/);
        assert.doesNotMatch(text, /RG-REVIEW|RG nº|CIN/);
      }
      assert.equal(JSON.stringify(source), before);
    }
  }
});

test('data canônica congelada rege data escrita, data numérica e ano letivo do boletim', () => {
  for (const [documentIssueDate, emitidoEm, expected] of [
    ['2026-10-11', '2026-10-12T00:30:00.000Z', '11 de outubro de 2026|11/10/2026|2026'],
    ['2026-12-31', '2027-01-01T00:30:00.000Z', '31 de dezembro de 2026|31/12/2026|2026'],
  ]) {
    const source = makeBoletimSource();
    source.emission.emitido_em = emitidoEm;
    source.emission.dados_emissao.documentIssueDate = documentIssueDate;
    const before = JSON.stringify(source);
    assert.equal(resolveAcademicSnapshotTemplate(source,
      '{{DATA_ATUAL}}|{{DATA_EMISSAO}}|{{ANO_LETIVO}}'), expected);
    assert.equal(JSON.stringify(source), before);
  }
  for (const documentIssueDate of [null, '', '2026-02-30', '11/10/2026']) {
    const source = makeBoletimSource();
    source.emission.dados_emissao.documentIssueDate = documentIssueDate;
    assert.throws(() => resolveAcademicSnapshotTemplate(source, '{{DATA_ATUAL}}'), /data canônica.*inválida/);
  }
});
