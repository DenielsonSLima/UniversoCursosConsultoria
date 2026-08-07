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
    exibirMarcaDagua: true,
    exibirModulo: true,
    cabecalhosTabela: {
      componente: 'Componente curricular',
      data: 'Data',
      horario: 'Horário',
      professorObservacao: 'Professor(es) / observação',
    },
    marcaDaguaTexto: 'Universo',
    marcaDaguaDataUri: null,
    marcaDaguaOpacidade: 0.1,
    logoDataUri: null,
    arquivoNome: 'calendario-enfermagem-40.pdf',
    emitidoEm: 'Emitido em 07/08/2026',
  },
  linhas: Array.from({ length: 34 }, (_, index) => ({
    componenteCurricular: index % 2 === 0
      ? 'Fundamentos da Enfermagem'
      : 'Princípios de Farmacologia',
    dataExibicao: `${String((index % 28) + 1).padStart(2, '0')}/08/2026`,
    horarioExibicao: index === 3 ? 'Horário não informado' : '08:00 - 16:00',
    professoresObservacao: index === 17
      ? 'Prof.ª Pollyanna. Laboratório de práticas em enfermagem, com orientação registrada pela coordenação pedagógica.'
      : 'Prof.ª Pollyanna',
  })),
});

test('mantém o escopo hierárquico da cache por polo, modalidade e turma', () => {
  assert.deepEqual(
    calendarioAulasExportacaoQueryKeys.turmas('polo-matriz', 'SUPERIOR'),
    ['gestor', 'calendario', 'exportacao-aulas', 'turmas', 'polo-matriz', 'SUPERIOR'],
  );
  assert.deepEqual(
    calendarioAulasExportacaoQueryKeys.documento('polo-matriz', 'EAD', 'turma-ead-1'),
    ['gestor', 'calendario', 'exportacao-aulas', 'documento', 'polo-matriz', 'EAD', 'turma-ead-1'],
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

  if (process.env.CALENDARIO_AULAS_PDF_FIXTURE_OUTPUT) {
    await writeFile(process.env.CALENDARIO_AULAS_PDF_FIXTURE_OUTPUT, bytes);
  }
});

test('respeita a revisão do modelo para módulo e imagens data URI, sem fetch externo', async () => {
  const payload = makePayload();
  if (!payload.documento) throw new Error('Fixture de calendário inválida.');
  const logoBytes = await readFile('public/LogoUniverso.png');
  const inlineLogo = `data:image/png;base64,${logoBytes.toString('base64')}`;
  payload.documento.exibirModulo = false;
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
