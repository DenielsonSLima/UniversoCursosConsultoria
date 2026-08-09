import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Professor usa apenas RPCs seguras e mantém conclusão no backend', async () => {
  const [service, page] = await Promise.all([
    read('./plano-curso.service.ts'),
    read('../../professor/plano-curso/PlanoCursoPage.tsx'),
  ]);

  assert.match(service, /listar_planos_curso_professor_secure/);
  assert.match(service, /obter_plano_curso_professor_secure/);
  assert.match(service, /salvar_plano_curso_professor_secure/);
  assert.match(service, /concluir_plano_curso_professor_secure/);
  assert.doesNotMatch(service, /\.from\(['"]planos_curso['"]\)/);
  assert.match(page, /conteudosAulas:[\s\S]*\.filter\(\(item\) => item\.conteudo\.length > 0\)/);
  assert.doesNotMatch(page, /PlanoCursoPdfPreview/);
  assert.doesNotMatch(page, /preparar_plano_curso_documento_secure/);
});

test('Grade carrega estados em lote e prepara documento diretamente pelo plano canônico', async () => {
  const [service, hooks, grade, turmaRealtime] = await Promise.all([
    read('./plano-curso.service.ts'),
    read('./plano-curso.hooks.ts'),
    read('../../gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/hooks/useTurmaTecnicoRealtime.ts'),
  ]);

  assert.match(service, /listar_planos_curso_gestao_secure['"], \{ p_turma_id: turmaId \}/);
  assert.match(service, /preparar_plano_curso_documento_secure/);
  assert.match(hooks, /candidate\.code === ['"]PGRST202['"]/);
  assert.match(hooks, /failureCount < 1 && !isPostgrestFunctionCacheError\(error\)/);
  assert.match(hooks, /retry: shouldRetryGestaoPlanosCurso/);
  assert.match(grade, /useGestaoPlanosCurso\(turma\.id\)/);
  assert.match(grade, /planoId: plano\.planoId,[\s\S]*revisao: plano\.revisao,[\s\S]*templateRevision: plano\.templateRevision,[\s\S]*documentoFingerprint: plano\.documentoFingerprint/);
  assert.match(grade, /plano\.status !== ['"]CONCLUIDO['"]/);
  assert.match(grade, /planoCursoKeys\.gestaoStatusList\(turma\.id\)/);
  assert.doesNotMatch(grade, /useGestaoPlanoCurso/);
  assert.match(turmaRealtime, /planoCursoKeys\.gestaoStatusList\(turmaId\)/);
});

test('Realtime invalida chaves restritas e suprime o eco da mutation local', async () => {
  const realtime = await read('./plano-curso.realtime.ts');

  assert.match(realtime, /table: ['"]planos_curso['"]/);
  assert.match(realtime, /turma_id=eq\.\$\{turmaId\}/);
  assert.match(realtime, /professor_id=eq\.\$\{professorId\}/);
  assert.match(realtime, /consumeLocalPlanoCursoEvent\(row\)/);
  assert.match(realtime, /candidate\.planoId === planoId[\s\S]*candidate\.revision === revision/);
  assert.doesNotMatch(realtime, /revision > candidate\./);
  assert.match(realtime, /planoCursoKeys\.gestaoStatusList\(turmaId\)/);
  assert.match(realtime, /planoCursoKeys\.professorWorkspace/);
  assert.match(realtime, /plano-curso:professor:\$\{professorId\}:polo:\$\{poloId\}/);
  assert.match(realtime, /config: \{ private: true \}/);
  assert.match(realtime, /['"]broadcast['"][\s\S]*event: ['"]eligibility-changed['"]/);
  assert.match(realtime, /change\.changed !== true/);
  assert.doesNotMatch(realtime, /table: ['"]aulas_turma['"]/);
  assert.doesNotMatch(realtime, /table: ['"]turmas_disciplinas['"]/);
});

test('PDF usa páginas do backend, ativos isolados, rótulos canônicos e assinatura final', async () => {
  const [pdf, preview, service] = await Promise.all([
    read('./plano-curso.pdf.ts'),
    read('./PlanoCursoPdfPreview.tsx'),
    read('./plano-curso.service.ts'),
  ]);

  assert.match(pdf, /documento\.paginas\.forEach/);
  assert.match(pdf, /drawIdentificationPage\(pdf, documento, pagina, contentBottom\)/);
  assert.match(pdf, /drawMeetingBlocks\(pdf, pagina\.encontros, y, contentBottom\)/);
  assert.match(pdf, /index === documento\.paginas\.length - 1/);
  assert.match(pdf, /drawLastPageSignature/);
  assert.match(service, /getSignatureSignedUrl\(signature\.path\)/);
  assert.match(service, /assinatura: \{ \.\.\.signature, url: signedUrl \}/);
  assert.match(pdf, /documento\.rotulos\.assinaturaDocente/);
  assert.match(pdf, /cabecalho\.logoUrl \?\? documento\.cabecalho\.logoDataUri/);
  assert.match(pdf, /marcaDagua\.url \?\? documento\.marcaDagua\.dataUri/);
  assert.match(pdf, /rotacionar \? 35 : 0/);
  assert.doesNotMatch(pdf, /html2canvas|document\.createElement\(['"]canvas['"]\)|Math\.ceil\([^)]*totalAulas/);
  assert.match(preview, /CanonicalDocumentPreviewModal/);
  assert.match(preview, /createPlanoCursoPdf/);
});

test('preview e estados intermediários prendem e restauram o foco do teclado', async () => {
  const [modal, grade] = await Promise.all([
    read('../../gestor/secretaria/shared/CanonicalDocumentPreviewModal.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx'),
  ]);

  assert.match(modal, /returnFocusRef/);
  assert.match(modal, /dialogRef\.current\?\.querySelectorAll/);
  assert.match(modal, /event\.shiftKey/);
  assert.match(modal, /returnFocusRef\.current\?\.isConnected/);
  assert.match(modal, /data-preview-initial-focus/);
  assert.match(grade, /planoCursoDialogRef/);
  assert.match(grade, /data-plano-initial-focus/);
  assert.match(grade, /event\.shiftKey/);
  assert.match(grade, /returnFocus\?\.isConnected/);
});

test('editor preserva draft concorrente e a Grade não transforma erro em loading eterno', async () => {
  const [page, grade, moduleView, disciplineView, statusControl] = await Promise.all([
    read('../../professor/plano-curso/PlanoCursoPage.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeModulo.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.tsx'),
    read('../../gestor/gestao/tecnicos/detalhes/components/grade/plano-curso/PlanoCursoStatusControl.tsx'),
  ]);

  assert.match(page, /reconcilePlanoCursoEditorSession/);
  assert.match(page, /editorSessionRef\.current\.baseRevision/);
  assert.match(page, /hasRemoteConflict/);
  assert.match(page, /Carregar versão atual/);
  assert.match(grade, /planosCursoLoading=\{planosCursoQuery\.isLoading\}/);
  assert.match(grade, /planosCursoError=\{planosCursoQuery\.isError\}/);
  assert.match(moduleView, /planoCursoError=\{planosCursoError\}/);
  assert.match(disciplineView, /isError=\{planoCursoError\}/);
  assert.match(statusControl, /isError \? ['"]Indisponível['"]/);
  assert.match(statusControl, /status === ['"]CONCLUIDO['"]/);
  assert.match(statusControl, /Rascunho é estado[\s\S]*nunca aciona preparação/);
});

test('documento concluído usa identidade completa do snapshot na query key', async () => {
  const [keys, hooks, service, preview] = await Promise.all([
    read('./plano-curso.keys.ts'),
    read('./plano-curso.hooks.ts'),
    read('./plano-curso.service.ts'),
    read('./PlanoCursoPdfPreview.tsx'),
  ]);

  assert.match(keys, /revision,[\s\S]*templateRevision,[\s\S]*documentoFingerprint/);
  assert.match(hooks, /response\.templateRevision !== templateRevision/);
  assert.match(hooks, /response\.documentoFingerprint !== documentoFingerprint/);
  assert.match(hooks, /templateRevision !== null/);
  assert.match(service, /value\.status !== ['"]CONCLUIDO['"]/);
  assert.match(service, /documento\.templateRevision !== value\.templateRevision/);
  assert.match(preview, /payload\.templateRevision,[\s\S]*payload\.documentoFingerprint/);
});
