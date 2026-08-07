import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { TextDecoder } from 'node:util';

import { createCalendarioAulasPdf } from './calendarioAulasExportacao.pdf';
import { calendarioAulasExportacaoQueryKeys } from './calendarioAulasExportacao.queryKeys';
import { getCalendarioAulasRealtimeSubscription } from './calendarioAulasExportacao.realtime';
import type { CalendarioAulasExportacaoPayload } from './types';

const makePayload = (): CalendarioAulasExportacaoPayload => ({
  status: 'PRONTO',
  mensagem: null,
  documento: {
    titulo: 'Calendário de aulas teóricas',
    subtitulo: 'SUBTITULO-CANONICO',
    rodape: 'RODAPE-CANONICO',
    instituicao: 'Universo Cursos e Consultoria',
    polo: 'Matriz - Japoatã/SE',
    curso: 'Técnico em Enfermagem',
    turma: 'Enfermagem 40',
    modulo: 'MODULO-CANONICO',
    exibirMarcaDagua: false,
    exibirModulo: true,
    cabecalhosTabela: {
      componente: 'Componente curricular',
      data: 'Data',
      horario: 'Horário',
      professorObservacao: 'Professor(a)',
    },
    marcaDaguaTexto: 'Universo',
    marcaDaguaDataUri: null,
    marcaDaguaUrl: null,
    marcaDaguaOpacidade: 0.1,
    marcaDaguaEscala: 50,
    marcaDaguaRotacionar: true,
    logoDataUri: null,
    cabecalhoInstitucional: {
      nome: 'Universo Cursos e Consultoria',
      cnpj: '13.278.137/0001-54',
      contato: '(79) 99602-8316',
      email: 'contato@universocursos.com',
      endereco: 'Rua C',
      numero: 'S/N',
      bairro: 'Centro',
      cidade: 'Japoatã',
      estado: 'SE',
      cep: '49950-000',
      isMatriz: true,
      logoUrl: null,
    },
    arquivoNome: 'calendario-enfermagem-40.pdf',
    emitidoEm: 'Emitido em 07/08/2026',
  },
  linhas: Array.from({ length: 34 }, (_, index) => ({
    componenteCurricular: index % 2 === 0
      ? 'Fundamentos da Enfermagem'
      : 'Princípios de Farmacologia',
    dataExibicao: `${String((index % 28) + 1).padStart(2, '0')}/08/2026`,
    horarioExibicao: index === 3 ? 'Horário não informado' : '08:00 - 16:00',
    professoresObservacao: 'Prof.ª Pollyanna',
  })),
});

test('mantém o escopo hierárquico da cache por polo, modalidade e turma', () => {
  assert.deepEqual(
    calendarioAulasExportacaoQueryKeys.turmas('polo-matriz', 'SUPERIOR'),
    ['gestor', 'calendario', 'exportacao-aulas', 'turmas', 'polo-matriz', 'SUPERIOR'],
  );
  assert.deepEqual(
    calendarioAulasExportacaoQueryKeys.modulos('polo-matriz', 'TECNICO', 'turma-tec-1'),
    ['gestor', 'calendario', 'exportacao-aulas', 'modulos', 'polo-matriz', 'TECNICO', 'turma-tec-1'],
  );
  assert.deepEqual(
    calendarioAulasExportacaoQueryKeys.documento('polo-matriz', 'EAD', 'turma-ead-1', '2026-08-01'),
    ['gestor', 'calendario', 'exportacao-aulas', 'documento', 'polo-matriz', 'EAD', 'turma-ead-1', '2026-08-01'],
  );
  assert.deepEqual(
    getCalendarioAulasRealtimeSubscription('turma-ead-1'),
    { table: 'aulas_turma', filter: 'turma_id=eq.turma-ead-1' },
  );
});

test('gera PDF A4 retrato vetorial somente com o payload canônico', async () => {
  const document = await createCalendarioAulasPdf(makePayload());
  const bytes = new Uint8Array(await document.blob.arrayBuffer());
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 8));
  const source = new TextDecoder('latin1').decode(bytes);

  assert.equal(document.fileName, 'calendario-enfermagem-40.pdf');
  assert.ok(document.blob.size > 1_000);
  assert.match(header, /^%PDF-/);
  assert.match(source, /SUBTITULO-CANONICO/);
  assert.match(source, /RODAPE-CANONICO/);
  assert.match(source, /Componente curricular/);
  assert.match(source, /MODULO-CANONICO/);
  assert.match(source, /UNIVERSO CURSOS E/);
  assert.match(source, /CONSULTORIA/);
  assert.match(source, /13\.278\.137\/0001-54/);
  assert.match(source, /MATRIZ/);

  if (process.env.CALENDARIO_AULAS_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CALENDARIO_AULAS_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('respeita a revisão do modelo e incorpora ativos institucionais isolados', async () => {
  const payload = makePayload();
  if (!payload.documento) throw new Error('Fixture de calendário inválida.');
  const logoBytes = await readFile('public/LogoUniverso.png');
  const inlineLogo = `data:image/png;base64,${logoBytes.toString('base64')}`;
  payload.documento.exibirModulo = false;
  payload.documento.exibirMarcaDagua = true;
  payload.documento.modulo = 'MODULO-OCULTO';
  payload.documento.logoDataUri = inlineLogo;
  payload.documento.marcaDaguaDataUri = inlineLogo;

  const document = await createCalendarioAulasPdf(payload);
  const bytes = new Uint8Array(await document.blob.arrayBuffer());
  const source = new TextDecoder('latin1').decode(bytes);

  assert.ok(document.blob.size > 1_000);
  assert.doesNotMatch(source, /MODULO-OCULTO/);

  if (process.env.CALENDARIO_AULAS_PDF_BRANDED_FIXTURE_OUTPUT) {
    await writeFile(process.env.CALENDARIO_AULAS_PDF_BRANDED_FIXTURE_OUTPUT, bytes);
  }
});

test('prévia do editor reutiliza o cabeçalho e a marca institucional configurados', async () => {
  const editor = await readFile(
    'modules/gestor/cadastros/modelos-documentos/calendario-aulas/components/CalendarioAulasTemplateEditor.tsx',
    'utf8',
  );

  assert.match(editor, /DocumentHeader company=\{companyInfo \|\| undefined\}/);
  assert.match(editor, /previewWatermarkUrl/);
  assert.match(editor, /const PREVIEW_PAGE_WIDTH = 794/);
  assert.match(editor, /window\.ResizeObserver/);
  assert.match(editor, /transform: `scale\(\$\{previewScale\}\)`/);
  assert.doesNotMatch(editor, />UNIVERSO<\/span>/);
});

test('mantém a marca gráfica visível sob as linhas transparentes da grade', async () => {
  const renderer = await readFile(
    'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
    'utf8',
  );
  const rowRendererStart = renderer.indexOf('const drawRowChunk');
  const rowRendererEnd = renderer.indexOf('/**', rowRendererStart);
  const rowRenderer = renderer.slice(rowRendererStart, rowRendererEnd);

  assert.match(rowRenderer, /pdf\.rect\(x, y, column\.width, height, 'S'\)/);
  assert.doesNotMatch(rowRenderer, /'FD'/);
});

test('centraliza o conteúdo da grade no PDF e no espelho do editor', async () => {
  const renderer = await readFile(
    'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
    'utf8',
  );
  const editor = await readFile(
    'modules/gestor/cadastros/modelos-documentos/calendario-aulas/components/CalendarioAulasTemplateEditor.tsx',
    'utf8',
  );
  const rowRendererStart = renderer.indexOf('const drawRowChunk');
  const rowRendererEnd = renderer.indexOf('/**', rowRendererStart);
  const rowRenderer = renderer.slice(rowRendererStart, rowRendererEnd);

  assert.match(rowRenderer, /x \+ column\.width \/ 2, textY, \{ align: 'center' \}/);
  assert.match(editor, /items-center justify-center p-3 text-center/);
  assert.match(editor, /Professor\(a\)/);
  assert.doesNotMatch(editor, /Professor\(es\) \/ observação/);
});

test('envia o mês ativo da agenda para a preparação canônica do calendário', async () => {
  const workspace = await readFile(
    'modules/gestor/calendario/components/AgendaWorkspace.tsx',
    'utf8',
  );
  const panel = await readFile(
    'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx',
    'utf8',
  );
  const service = await readFile(
    'modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.service.ts',
    'utf8',
  );

  assert.match(workspace, /mesReferencia=\{`\$\{currentYear\}-\$\{String\(currentMonthIndex \+ 1\)\.padStart\(2, '0'\)\}-01`\}/);
  assert.match(panel, /mesReferencia,/);
  assert.match(service, /p_mes_referencia: input\.mesReferencia/);
});

test('a migration limita a RPC ao mês ativo e não projeta observações como professor', async () => {
  const migration = await readFile(
    'supabase/migrations/20260807153000_filter_calendario_por_mes_selecionado.sql',
    'utf8',
  );

  assert.match(migration, /p_mes_referencia date/);
  assert.match(migration, /class_meeting\.data_aula >= v_inicio_periodo/);
  assert.match(migration, /class_meeting\.data_aula < v_fim_periodo/);
  assert.match(migration, /'professores_observacao', calendar_line\.professor_nome/);
  assert.doesNotMatch(migration, /string_agg\(distinct nullif\(btrim\(class_meeting\.titulo\)/);
  assert.match(migration, /'Professor\(a\)'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.preparar_calendario_aulas_exportacao_secure\(uuid, text, uuid, date\)/);
});

test('a migration do calendário inclui seleção opcional de módulo para técnico', async () => {
  const migration = await readFile(
    'supabase/migrations/20260807180000_filtro_modulo_exportacao_calendario_aulas.sql',
    'utf8',
  );

  assert.match(migration, /listar_modulos_calendario_aulas_secure/);
  assert.match(migration, /p_modulo_id uuid default null/);
  assert.match(migration, /p_modulo_id is not null and v_modalidade <> 'TECNICO'/);
  assert.match(migration, /p_modulo_id is null or module\.id = p_modulo_id/);
});

test('a migration final do calendário remove recorte mensal quando módulo técnico é informado', async () => {
  const migration = await readFile(
    'supabase/migrations/20260808090000_filtro_modulo_sem_limiite_mensal_calendario_aulas.sql',
    'utf8',
  );

  assert.match(
    migration,
    /v_aplica_recorte_mensal\s*:=\s*p_modulo_id\s+is\s+null/,
  );
  assert.match(
    migration,
    /not\s+v_aplica_recorte_mensal\s+or\s*\(class_meeting\.data_aula\s+>=\s+v_inicio_periodo\s+and\s+class_meeting\.data_aula\s+<\s+v_fim_periodo\)/,
  );
  assert.match(
    migration,
    /and \(\s*not\s+v_aplica_recorte_mensal\s+or\s*\(class_meeting\.data_aula\s+>=\s+v_inicio_periodo\s+and\s+class_meeting\.data_aula\s+<\s+v_fim_periodo\)\s*\)/,
  );
});

test('alinha a escala e o centro da marca do PDF à prévia A4 do editor', async () => {
  const renderer = await readFile(
    'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
    'utf8',
  );
  const editor = await readFile(
    'modules/gestor/cadastros/modelos-documentos/calendario-aulas/components/CalendarioAulasTemplateEditor.tsx',
    'utf8',
  );

  assert.match(editor, /width: `\$\{previewWatermarkScale\}%`/);
  assert.match(renderer, /const scaleImageToWidth/);
  assert.match(renderer, /pageWidth \* \(scale \/ 100\)/);
  assert.match(renderer, /const getCenteredRotatedImageOrigin/);
  assert.match(renderer, /const origin = getCenteredRotatedImageOrigin/);
  assert.doesNotMatch(renderer, /pageWidth - PAGE_MARGIN_X \* 2\) \* \(scale \/ 100\)/);
});

test('espelha a tipografia e a área segura do cabeçalho da Declaração', async () => {
  const renderer = await readFile(
    'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
    'utf8',
  );

  assert.match(renderer, /const HEADER_MARGIN_X = 20/);
  assert.match(renderer, /const HEADER_TOP = 20/);
  assert.match(renderer, /const HEADER_BOTTOM = 55/);
  assert.match(renderer, /pdf\.setFont\('times', 'bold'\)/);
  assert.match(renderer, /pdf\.setFont\('times', 'normal'\)/);
  assert.match(renderer, /pdf\.line\(HEADER_MARGIN_X, HEADER_BOTTOM/);
});

test('painel entrega o mesmo PDF pronto ao visualizador, sem download direto ou rasterização', async () => {
  const panel = await readFile(
    'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx',
    'utf8',
  );
  const preview = await readFile(
    'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasPdfPreview.tsx',
    'utf8',
  );

  assert.match(panel, /setPreviewDocument\(pdf\)/);
  assert.match(panel, /CalendarioAulasPdfPreview/);
  assert.doesNotMatch(panel, /const downloadPdf/);
  assert.match(preview, /createPdf=\{async \(\) => document\}/);
  assert.doesNotMatch(preview, /html2canvas|addImage\(.*canvas/i);
});
