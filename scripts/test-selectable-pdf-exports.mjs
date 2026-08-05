import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const modulesRoot = resolve(root, 'modules');
const selectablePdfHelper = 'modules/shared/pdf/dom-to-selectable-pdf.ts';
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

const protectedVectorGenerators = [
  'modules/gestor/calendario/calendario.pdf.ts',
  'modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts',
  'modules/aluno/secretaria/student-card-pdf.ts',
];

const approvedHybridRasterPipelines = new Map([
  [
    'modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas.pdf.ts',
    {
      reason: 'A arte da carteirinha é raster, mas o texto visível é removido do canvas e redesenhado como camada vetorial selecionável.',
      requiredSignals: [
        ['coleta de texto', /\bcollectPdfTextRuns\s*\(/m],
        ['camada textual', /\baddSelectableTextLayer\s*\(/m],
        ['texto vetorial jsPDF', /\bpdf\.text\s*\(/m],
      ],
    },
  ],
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
const approvedHybridInventory = [];
const approvedHybridFailures = [];
const seenApprovedHybridPipelines = new Set();
const otherHtml2CanvasUses = [];

for (const [filePath, source] of sources) {
  if (filePath === selectablePdfHelper) continue;

  if (helperReferencePattern.test(source)) helperConsumers.push(filePath);

  const hasHtml2Canvas = moduleImportPattern('html2canvas').test(source);
  if (!hasHtml2Canvas) continue;

  const hasJsPdf = moduleImportPattern('jspdf').test(source);
  const bridgesCanvasIntoPdf = addImagePattern.test(source);

  if (hasJsPdf && bridgesCanvasIntoPdf) {
    const approvedHybrid = approvedHybridRasterPipelines.get(filePath);
    if (approvedHybrid) {
      seenApprovedHybridPipelines.add(filePath);
      const missingSignals = approvedHybrid.requiredSignals
        .filter(([, pattern]) => !pattern.test(source))
        .map(([label]) => label);
      approvedHybridInventory.push({
        filePath,
        reason: approvedHybrid.reason,
        status: missingSignals.length === 0
          ? 'HÍBRIDO VETORIAL APROVADO'
          : `CONTRATO HÍBRIDO INCOMPLETO: ${missingSignals.join(', ')}`,
      });
      if (missingSignals.length > 0) {
        approvedHybridFailures.push(
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

for (const filePath of approvedHybridRasterPipelines.keys()) {
  if (seenApprovedHybridPipelines.has(filePath)) continue;
  approvedHybridFailures.push(
    `${filePath} está na allowlist híbrida, mas não possui mais o pipeline raster esperado; remova a exceção obsoleta.`,
  );
  approvedHybridInventory.push({
    filePath,
    reason: approvedHybridRasterPipelines.get(filePath).reason,
    status: 'EXCEÇÃO OBSOLETA',
  });
}

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

const helperExists = sources.has(selectablePdfHelper);
const helperSource = sources.get(selectablePdfHelper) || '';
const missingHelperSignals = helperRequiredSignals
  .filter(([, pattern]) => !pattern.test(helperSource))
  .map(([label]) => label);
const failures = [
  ...(!helperExists ? [`${selectablePdfHelper} não foi encontrado.`] : []),
  ...(missingHelperSignals.length > 0
    ? [`${selectablePdfHelper} perdeu partes obrigatórias do contrato híbrido: ${missingHelperSignals.join(', ')}.`]
    : []),
  ...forbiddenRasterPipelines.map(({ filePath }) => (
    `${filePath} ainda usa html2canvas diretamente para inserir canvas em PDF.`
  )),
  ...approvedHybridFailures,
  ...vectorGeneratorFailures,
];

console.log('Contrato de exportações PDF selecionáveis');
console.log('========================================');
console.log(`Helper híbrido central: ${helperExists && missingHelperSignals.length === 0 ? 'OK' : 'INCOMPLETO'} — ${selectablePdfHelper}`);

console.log(`\nConsumidores do helper híbrido (${helperConsumers.length}):`);
if (helperConsumers.length === 0) console.log('  (nenhum)');
else helperConsumers.forEach((filePath) => console.log(`  - ${filePath}`));

console.log(`\nGeradores vetoriais protegidos (${vectorGeneratorInventory.length}):`);
vectorGeneratorInventory.forEach(({ filePath, status }) => {
  console.log(`  - [${status}] ${filePath}`);
});

console.log(`\nPipelines híbridos aprovados explicitamente (${approvedHybridInventory.length}):`);
if (approvedHybridInventory.length === 0) console.log('  (nenhum)');
else approvedHybridInventory.forEach(({ filePath, reason, status }) => {
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
  console.log('\nRESULTADO: OK — nenhum PDF de página inteira usa rasterização direta fora do helper central.');
}
