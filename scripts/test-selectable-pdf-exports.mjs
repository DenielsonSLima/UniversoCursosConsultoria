import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const modulesRoot = resolve(root, 'modules');
const selectablePdfHelper = 'modules/shared/pdf/dom-to-selectable-pdf.ts';
const caixaDownloadHelper = 'modules/shared/pdf/download-pdf-blob.ts';
const caixaPreviewModal = 'modules/gestor/caixa/report/CaixaReportPreviewModal.tsx';
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

const protectedVectorGenerators = [
  'modules/gestor/calendario/calendario.pdf.ts',
  'modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts',
  'modules/aluno/secretaria/student-card-pdf.ts',
  'modules/gestor/caixa/report/caixa-report.vector-pdf.ts',
  'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
  'modules/gestor/secretaria/contratos-aluno/contratos-aluno.pdf.ts',
  'modules/gestor/secretaria/carteirinhas-preceptor/carteirinhas-preceptor.pdf.ts',
  'modules/gestor/secretaria/historico-emissoes/emission-document.pdf.ts',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.ts',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.resources.ts',
];

// Documentos oficiais novos não aceitam nem a ponte híbrida nem canvas de
// página. QR, foto e marca-d'água são ativos isolados; o restante é nativo.
const strictNativeDocumentFlows = [
  'modules/gestor/secretaria/shared/CanonicalDocumentPreviewModal.tsx',
  'modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts',
  'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx',
  'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasPdfPreview.tsx',
  'modules/gestor/secretaria/contratos-aluno/contratos-aluno.pdf.ts',
  'modules/gestor/secretaria/carteirinhas-preceptor/carteirinhas-preceptor.pdf.ts',
  'modules/gestor/secretaria/historico-emissoes/emission-document.pdf.ts',
  'modules/gestor/financeiro/components/FinancialReportPreview.tsx',
  'modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.ts',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts',
  'modules/gestor/financeiro/components/financial-report.vector-pdf.resources.ts',
];

// Inventário temporário de pipelines antigos que ainda rasterizam a página.
// Eles NÃO estão aprovados: permanecem aqui apenas para impedir regressão da
// camada textual enquanto cada fluxo é migrado para composição nativa.
const legacyHybridRasterPipelines = new Map([
  [
    'modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas.pdf.ts',
    {
      reason: 'A página da carteirinha ainda é rasterizada; a camada textual apenas reduz o dano e não torna o pipeline conforme.',
      requiredSignals: [
        ['coleta de texto', /\bcollectPdfTextRuns\s*\(/m],
        ['camada textual', /\baddSelectableTextLayer\s*\(/m],
        ['texto vetorial jsPDF', /\bpdf\.text\s*\(/m],
      ],
    },
  ],
]);

// Novos consumidores da ponte DOM→imagem são proibidos. A lista representa
// somente dívida já existente e deve encolher até chegar a zero.
const knownLegacyHelperConsumers = new Set([
  'modules/aluno/cursos/CursosPage.tsx',
  'modules/aluno/financeiro/FinanceiroPage.tsx',
  'modules/gestor/financeiro/receber/components/modalidade-receber/InstitutionalReceiptModal.tsx',
  'modules/gestor/parceiros/components/export/ParceirosExportModal.tsx',
  'modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx',
  'modules/gestor/secretaria/historico-emissoes/preview-utils.ts',
  'modules/professor/financeiro/FinanceiroPage.tsx',
]);

const normalizePath = (filePath) => relative(root, filePath).split(sep).join('/');
const extensionOf = (filePath) => {
  const match = filePath.match(/(\.[^./]+)$/);
  return match?.[1] || '';
};

const listSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return sourceExtensions.has(extensionOf(entry.name)) ? [entryPath] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
};

const moduleImportPattern = (moduleName) => new RegExp(
  String.raw`(?:from\s*['"]${moduleName}['"]|import\s*\(\s*['"]${moduleName}['"]\s*\)|require\s*\(\s*['"]${moduleName}['"]\s*\))`,
  'm',
);

const helperReferencePattern = /(?:from\s*['"][^'"]*dom-to-selectable-pdf['"]|import\s*\(\s*['"][^'"]*dom-to-selectable-pdf['"]\s*\)|require\s*\(\s*['"][^'"]*dom-to-selectable-pdf['"]\s*\))/m;
const helperRequiredSignals = [
  ['planejamento da camada textual', /\bcollectTextLayerPlan\s*\(/m],
  ['remoção do texto no canvas', /\bhideMarkedCloneText\s*\(/m],
  ['desenho da camada textual', /\bdrawTextRuns\s*\(/m],
  ['texto real no jsPDF', /\bpdf\.text\s*\(/m],
  ['espaços semânticos entre elementos', /\bmergeStandaloneWhitespaceRuns\s*\(/m],
  ['frases semânticas entre estilos', /\bmergeAdjacentSemanticRuns\s*\(/m],
  ['camada invisível sem compressão', /horizontalScale:\s*options\.invisible\s*\?\s*1\s*:/m],
  ['continuidade multipágina no Safari', /window\.setTimeout\(resolve,\s*0\)/m],
  ['validação contra texto cortado', /\bassertNoClippedText\s*\(/m],
];
const addImagePattern = /\.addImage\s*\(/m;
const html2CanvasCallPattern = /\bhtml2canvas\s*\(/m;
const jsPdfConstructionPattern = /\bnew\s+jsPDF\s*\(/m;

const firstLineMatching = (source, pattern) => {
  const match = pattern.exec(source);
  if (!match) return null;
  return source.slice(0, match.index).split('\n').length;
};

const formatSignalLines = (source) => {
  const signals = [
    ['captura', html2CanvasCallPattern],
    ['PDF', jsPdfConstructionPattern],
    ['addImage', addImagePattern],
  ];
  return signals
    .map(([label, pattern]) => `${label}:L${firstLineMatching(source, pattern)}`)
    .join(', ');
};

const files = await listSourceFiles(modulesRoot);
const sources = new Map(await Promise.all(files.map(async (filePath) => [
  normalizePath(filePath),
  await readFile(filePath, 'utf8'),
])));

const helperConsumers = [];
const forbiddenRasterPipelines = [];
const legacyHybridInventory = [];
const legacyHybridFailures = [];
const seenLegacyHybridPipelines = new Set();
const otherHtml2CanvasUses = [];

for (const [filePath, source] of sources) {
  if (filePath === selectablePdfHelper) continue;

  if (helperReferencePattern.test(source)) helperConsumers.push(filePath);

  const hasHtml2Canvas = moduleImportPattern('html2canvas').test(source);
  if (!hasHtml2Canvas) continue;

  const hasJsPdf = moduleImportPattern('jspdf').test(source);
  const bridgesCanvasIntoPdf = addImagePattern.test(source);

  if (hasJsPdf && bridgesCanvasIntoPdf) {
    const legacyHybrid = legacyHybridRasterPipelines.get(filePath);
    if (legacyHybrid) {
      seenLegacyHybridPipelines.add(filePath);
      const missingSignals = legacyHybrid.requiredSignals
        .filter(([, pattern]) => !pattern.test(source))
        .map(([label]) => label);
      legacyHybridInventory.push({
        filePath,
        reason: legacyHybrid.reason,
        status: missingSignals.length === 0
          ? 'LEGADO RASTER NÃO CONFORME (INVENTARIADO)'
          : `LEGADO RASTER E CAMADA TEXTUAL INCOMPLETA: ${missingSignals.join(', ')}`,
      });
      if (missingSignals.length > 0) {
        legacyHybridFailures.push(
          `${filePath} perdeu os sinais obrigatórios da camada textual vetorial: ${missingSignals.join(', ')}.`,
        );
      }
      continue;
    }
    forbiddenRasterPipelines.push({
      filePath,
      signals: formatSignalLines(source),
    });
  } else {
    otherHtml2CanvasUses.push(filePath);
  }
}

for (const filePath of legacyHybridRasterPipelines.keys()) {
  if (seenLegacyHybridPipelines.has(filePath)) continue;
  legacyHybridInventory.push({
    filePath,
    reason: legacyHybridRasterPipelines.get(filePath).reason,
    status: 'DÍVIDA REMOVIDA — APAGAR DO INVENTÁRIO',
  });
}

const unexpectedHelperConsumers = helperConsumers.filter(
  (filePath) => !knownLegacyHelperConsumers.has(filePath),
);

const vectorGeneratorFailures = [];
const vectorGeneratorInventory = [];
for (const filePath of protectedVectorGenerators) {
  const source = sources.get(filePath);
  if (source === undefined) {
    vectorGeneratorFailures.push(`${filePath} não foi encontrado.`);
    vectorGeneratorInventory.push({ filePath, status: 'AUSENTE' });
    continue;
  }
  if (helperReferencePattern.test(source)) {
    vectorGeneratorFailures.push(
      `${filePath} passou a depender de ${selectablePdfHelper}.`,
    );
    vectorGeneratorInventory.push({ filePath, status: 'IMPORTA HELPER HÍBRIDO' });
    continue;
  }
  vectorGeneratorInventory.push({ filePath, status: 'VETORIAL INDEPENDENTE' });
}

const strictNativeDocumentFailures = [];
for (const filePath of strictNativeDocumentFlows) {
  const source = sources.get(filePath);
  if (source === undefined) {
    strictNativeDocumentFailures.push(`${filePath} não foi encontrado.`);
    continue;
  }
  if (
    helperReferencePattern.test(source)
    || moduleImportPattern('html2canvas').test(source)
    || /\bhtml2canvas\s*\(/m.test(source)
    || /\bcreateSelectablePdfBuilder\b/m.test(source)
  ) {
    strictNativeDocumentFailures.push(
      `${filePath} voltou a usar captura rasterizada de página no fluxo documental nativo.`,
    );
  }
}

const calendarioExportPanelPath = 'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx';
const calendarioPdfPreviewPath = 'modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasPdfPreview.tsx';
const calendarioExportPanelSource = sources.get(calendarioExportPanelPath) || '';
const calendarioPdfPreviewSource = sources.get(calendarioPdfPreviewPath) || '';
const calendarCanonicalBlobFailures = [
  ...(!/setPreviewDocument\(pdf\)/m.test(calendarioExportPanelSource)
    ? [`${calendarioExportPanelPath} não entrega o PDF já preparado à prévia.`]
    : []),
  ...(/const\s+downloadPdf\b|URL\.createObjectURL\(pdf\.blob\)/m.test(calendarioExportPanelSource)
    ? [`${calendarioExportPanelPath} voltou a baixar diretamente ou recriar URL fora da prévia canônica.`]
    : []),
  ...(!/createPdf=\{async \(\) => document\}/m.test(calendarioPdfPreviewSource)
    ? [`${calendarioPdfPreviewPath} não reutiliza o mesmo Blob vetorial na prévia, download e impressão.`]
    : []),
];

const helperExists = sources.has(selectablePdfHelper);
const helperSource = sources.get(selectablePdfHelper) || '';
const helperSafariFailures = /\brequestAnimationFrame\s*\(/m.test(helperSource)
  ? [`${selectablePdfHelper} voltou a depender de requestAnimationFrame durante a exportação.`]
  : [];
const caixaReportPdfPath = 'modules/gestor/caixa/report/caixa-report.pdf.ts';
const caixaReportPdfSource = sources.get(caixaReportPdfPath) || '';
const caixaVectorPdfPath = 'modules/gestor/caixa/report/caixa-report.vector-pdf.ts';
const caixaVectorPdfSource = sources.get(caixaVectorPdfPath) || '';
const caixaReportDocumentPath = 'modules/gestor/caixa/report/CaixaReportDocument.tsx';
const caixaReportDocumentSource = sources.get(caixaReportDocumentPath) || '';
const caixaDownloadHelperSource = sources.get(caixaDownloadHelper) || '';
const caixaPreviewModalSource = sources.get(caixaPreviewModal) || '';
const caixaDownloadIntegrationFailures = [
  ...(!sources.has(caixaDownloadHelper)
    ? [`${caixaDownloadHelper} não foi encontrado no snapshot publicado.`]
    : []),
  ...(!/export\s+const\s+downloadPdfBlob\b/m.test(caixaDownloadHelperSource)
    ? [`${caixaDownloadHelper} não exporta downloadPdfBlob.`]
    : []),
  ...(!/from\s*['"]\.\.\/\.\.\/\.\.\/shared\/pdf\/download-pdf-blob['"]/m.test(caixaPreviewModalSource)
    ? [`${caixaPreviewModal} não aponta para o helper de download isolado.`]
    : []),
];
const caixaSafariFailures = [
  ...(helperReferencePattern.test(caixaReportPdfSource)
    ? [`${caixaReportPdfPath} voltou a depender do helper híbrido de captura DOM.`]
    : []),
  ...(/html2canvas|stagePageForSafariCapture|appendChild\(page\)|renderingMode:\s*['"]invisible/m.test(`${caixaReportPdfSource}\n${caixaVectorPdfSource}`)
    ? [`O exportador do Caixa voltou a rasterizar, mover a prévia ou desenhar texto invisível.`]
    : []),
  ...(!/CAIXA_REPORT_PDF_PIPELINE\s*=\s*['"]native-vector['"]/m.test(caixaVectorPdfSource)
    || !/pdf\.text\s*\(/m.test(caixaVectorPdfSource)
    || !/pdf\.(?:rect|roundedRect|line)\s*\(/m.test(caixaVectorPdfSource)
    ? [`${caixaVectorPdfPath} perdeu os sinais obrigatórios do gerador vetorial nativo.`]
    : []),
  ...(!/grid-rows-\[auto_minmax\(0,1fr\)_auto\]/m.test(caixaReportDocumentSource)
    || !/data-caixa-report-header/m.test(caixaReportDocumentSource)
    ? [`${caixaReportDocumentPath} perdeu as linhas fixas que protegem o cabeçalho durante a captura.`]
    : []),
];
const financialReportPreviewPath = 'modules/gestor/financeiro/components/FinancialReportPreview.tsx';
const reportPdfPreviewModalPath = 'modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx';
const financialReportVectorPath = 'modules/gestor/financeiro/components/financial-report.vector-pdf.ts';
const financialReportLayoutPath = 'modules/gestor/financeiro/components/financial-report.vector-pdf.layout.ts';
const financialReportResourcesPath = 'modules/gestor/financeiro/components/financial-report.vector-pdf.resources.ts';
const financialReportPreviewSource = sources.get(financialReportPreviewPath) || '';
const reportPdfPreviewModalSource = sources.get(reportPdfPreviewModalPath) || '';
const financialReportVectorSource = sources.get(financialReportVectorPath) || '';
const financialReportPipelineSource = [
  financialReportVectorSource,
  sources.get(financialReportLayoutPath) || '',
  sources.get(financialReportResourcesPath) || '',
].join('\n');
const financialReportNativeFailures = [
  ...(!/FINANCIAL_REPORT_PDF_PIPELINE\s*=\s*['"]native-vector['"]/m.test(financialReportVectorSource)
    || !/drawCanonicalInstitutionalHeader/m.test(financialReportVectorSource)
    || !/pdf\.text\s*\(/m.test(financialReportPipelineSource)
    || !/pdf\.(?:rect|roundedRect|line)\s*\(/m.test(financialReportPipelineSource)
    ? [`${financialReportVectorPath} perdeu os sinais do compositor vetorial nativo.`]
    : []),
  ...(/html2canvas|dom-to-selectable-pdf|buildSelectablePdfBlobFromElements/i.test(
    `${financialReportPreviewSource}\n${reportPdfPreviewModalSource}\n${financialReportPipelineSource}`,
  )
    ? [`O relatório financeiro voltou a depender de captura rasterizada de página.`]
    : []),
  ...(!/<ReportPdfPreviewModal/m.test(financialReportPreviewSource)
    || !/downloadPdfBlob\(preparedPdf\.blob, preparedPdf\.fileName\)/m.test(reportPdfPreviewModalSource)
    || !/await printPdfBlob\(preparedPdf\.blob/m.test(reportPdfPreviewModalSource)
    || !/URL\.createObjectURL\(preparedPdf\.blob\)/m.test(reportPdfPreviewModalSource)
    || !/<iframe[\s\S]*src=\{previewUrl\}/m.test(reportPdfPreviewModalSource)
    ? [`${financialReportPreviewPath} e ${reportPdfPreviewModalPath} não reutilizam o mesmo Blob na prévia, download e impressão.`]
    : []),
];
const missingHelperSignals = helperRequiredSignals
  .filter(([, pattern]) => !pattern.test(helperSource))
  .map(([label]) => label);
const helperStillRequired = helperConsumers.length > 0;
const failures = [
  ...(helperStillRequired && !helperExists ? [`${selectablePdfHelper} não foi encontrado.`] : []),
  ...(helperStillRequired && missingHelperSignals.length > 0
    ? [`${selectablePdfHelper} perdeu proteções temporárias da camada textual legada: ${missingHelperSignals.join(', ')}.`]
    : []),
  ...unexpectedHelperConsumers.map((filePath) => (
    `${filePath} é um novo consumidor proibido da ponte raster ${selectablePdfHelper}.`
  )),
  ...forbiddenRasterPipelines.map(({ filePath }) => (
    `${filePath} ainda usa html2canvas diretamente para inserir canvas em PDF.`
  )),
  ...legacyHybridFailures,
  ...vectorGeneratorFailures,
  ...strictNativeDocumentFailures,
  ...calendarCanonicalBlobFailures,
  ...helperSafariFailures,
  ...caixaDownloadIntegrationFailures,
  ...caixaSafariFailures,
  ...financialReportNativeFailures,
];

console.log('Contrato de exportações PDF vetoriais e selecionáveis');
console.log('=====================================================');
console.log(`Ponte raster legada: ${!helperStillRequired ? 'SEM CONSUMIDORES' : helperExists && missingHelperSignals.length === 0 ? 'INVENTARIADA' : 'INCOMPLETA'} — ${selectablePdfHelper}`);
console.log(`Download isolado do Caixa: ${caixaDownloadIntegrationFailures.length === 0 ? 'OK' : 'INCOMPLETO'} — ${caixaDownloadHelper}`);
console.log(`Estrutura vetorial do Caixa: ${caixaSafariFailures.length === 0 ? 'OK' : 'INCOMPLETA'} — ${caixaVectorPdfPath}`);
console.log(`Relatório financeiro nativo: ${financialReportNativeFailures.length === 0 ? 'OK' : 'INCOMPLETO'} — ${financialReportVectorPath}`);

console.log(`\nConsumidores legados da ponte raster (${helperConsumers.length}):`);
if (helperConsumers.length === 0) console.log('  (nenhum)');
else helperConsumers.forEach((filePath) => console.log(`  - ${filePath}`));

console.log(`\nGeradores vetoriais protegidos (${vectorGeneratorInventory.length}):`);
vectorGeneratorInventory.forEach(({ filePath, status }) => {
  console.log(`  - [${status}] ${filePath}`);
});

console.log(`\nPipelines raster legados inventariados (${legacyHybridInventory.length}):`);
if (legacyHybridInventory.length === 0) console.log('  (nenhum)');
else legacyHybridInventory.forEach(({ filePath, reason, status }) => {
  console.log(`  - [${status}] ${filePath}`);
  console.log(`    Motivo: ${reason}`);
});

console.log(`\nPipelines raster diretos proibidos (${forbiddenRasterPipelines.length}):`);
if (forbiddenRasterPipelines.length === 0) console.log('  (nenhum)');
else forbiddenRasterPipelines.forEach(({ filePath, signals }) => {
  console.log(`  - ${filePath} (${signals})`);
});

console.log(`\nOutros usos de html2canvas sem ponte canvas→jsPDF (${otherHtml2CanvasUses.length}):`);
if (otherHtml2CanvasUses.length === 0) console.log('  (nenhum)');
else otherHtml2CanvasUses.forEach((filePath) => console.log(`  - ${filePath}`));

if (failures.length > 0) {
  console.error(`\nRESULTADO: FALHOU (${failures.length} violação(ões))`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exitCode = 1;
} else {
  const legacyDebtCount = helperConsumers.length + seenLegacyHybridPipelines.size;
  console.log(`\nRESULTADO: OK — nenhum pipeline raster novo; ${legacyDebtCount} fluxo(s) legado(s) não conforme(s) permanecem inventariado(s).`);
}
