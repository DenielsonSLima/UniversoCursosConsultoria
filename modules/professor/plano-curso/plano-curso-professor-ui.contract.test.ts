import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');
const [page, form, preview, textarea, assignments, editor, portal] = await Promise.all([
  read('./PlanoCursoPage.tsx'),
  read('./PlanoCursoEditorForm.tsx'),
  read('./PlanoCursoInstitutionalPreview.tsx'),
  read('./PlanoCursoTextArea.tsx'),
  read('./PlanoCursoAssignmentList.tsx'),
  read('./usePlanoCursoEditor.ts'),
  read('../professor.page.tsx'),
]);

test('edição fica no fluxo normal, com ações próprias e campos que acompanham o conteúdo', () => {
  assert.doesNotMatch(form, /sticky|absolute inset|aspect-\[|h-28|resize-none|overflow-hidden/);
  assert.doesNotMatch(page, /<PlanoCursoPaper/);
  assert.match(form, /<PlanoCursoTextArea/);
  assert.match(textarea, /textarea\.scrollHeight/);
  assert.match(textarea, /ResizeObserver/);
  assert.match(textarea, /min-h-32/);
  assert.match(textarea, /text-base/);
  assert.match(form, /min-h-11/);
  assert.match(form, /Salvar rascunho/);
  assert.match(form, /Concluir plano/);
});

test('prévia de leitura mantém cabeçalho, marca e suporte A4 fora da edição', () => {
  const watermarkIndex = preview.indexOf('<ReportWatermark');
  const contentIndex = preview.indexOf('relative z-10 flex-1', watermarkIndex);
  const headerIndex = preview.indexOf('<DocumentHeader', contentIndex);
  assert.ok(watermarkIndex >= 0 && contentIndex > watermarkIndex && headerIndex > contentIndex);
  assert.match(preview, /polo=\{institutionalPolo\} orientation=['"]portrait['"]/);
  assert.match(preview, /data-plano-curso-page=\{pageNumber\}/);
  assert.match(preview, /w-\[794px\]/);
  assert.match(preview, /min-h-\[1123px\]/);
  assert.match(preview, /diasPaginas\.map\(\(diasPagina, pageIndex\)/);
  assert.match(preview, /Página \{pageNumber\} de \{totalPages\}/);
  assert.doesNotMatch(preview, /<textarea|createPdf|download=|window\.print/);
});

test('seleção pesquisável resolve somente os IDs das disciplinas autorizadas', () => {
  assert.match(assignments, /<InstitutionalSelect/);
  assert.match(assignments, /plans\.find\(\(item\) => planoAssignmentId\(item\) === value\)/);
  assert.doesNotMatch(assignments, /<select\b|<datalist\b/);
});

test('sincronização não adiciona atualização manual e conflito preserva rascunho', () => {
  assert.match(page, /usePlanoCursoRealtime\(\{ professorId, poloId \}\)/);
  assert.doesNotMatch(
    page + form + assignments,
    /RefreshCw|\.refetch\(|Carregar versão atual|Tentar novamente/,
  );
  assert.match(form, /Descartar minhas alterações/);
  assert.match(editor, /reconcilePlanoCursoEditorSession/);
  assert.match(editor, /session\.baseRevision/);
  assert.match(editor, /expectedRevision: saved\.revisao/);
  assert.match(editor, /if \(!isMutating && workspace\) hydrateEditor\(workspace\)/);
  assert.match(editor, /submitting\.current/);
});

test('portal preserva os dados visuais autorizados da unidade', () => {
  for (
    const field of [
      'logo_url',
      'endereco',
      'telefone',
      'watermark_url',
      'watermark_opacity',
      'watermark_scale',
      'watermark_rotate',
    ]
  ) {
    assert.match(portal, new RegExp(`\\b${field}\\b`));
  }
  assert.match(portal, /polo=\{currentPolo\}/);
});
