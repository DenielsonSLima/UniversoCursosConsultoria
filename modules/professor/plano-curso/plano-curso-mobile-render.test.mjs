import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const nativeRequire = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('./PlanoCursoEditorForm.tsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  packages: 'external',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(
  nativeRequire,
  module,
  module.exports,
);
const Form = module.exports.default;
const longContent = 'Conteúdo preparado antecipadamente. '.repeat(160);
const aula = {
  aulaId: 'aula-futura',
  dataAula: '2027-02-15',
  dataExibicao: '15/02/2027',
  sessao: 'M',
  titulo: 'Fundamentos de enfermagem',
  cargaHoraria: 4,
  horaInicio: '08:00',
  horaFim: '12:00',
  conteudo: longContent,
};
const day = {
  dataAula: aula.dataAula,
  dataExibicao: aula.dataExibicao,
  aulaIds: [aula.aulaId],
  titulos: [aula.titulo],
  conteudo: longContent,
  possuiConteudosDivergentes: false,
};
const createEditor = (overrides = {}) => ({
  workspace: {
    canEdit: true,
    status: 'RASCUNHO',
    revisao: 4,
    disciplinaNome: 'Disciplina sintética',
    cursoNome: 'Curso técnico',
    turmaNome: 'Turma2027',
    professorNome: 'Docente sintético',
    totalDias: 1,
    totalAulas: 1,
    aulas: [aula],
  },
  diasEditor: [day],
  conteudosPorDia: { [aula.dataAula]: longContent },
  diasConteudoEditados: new Set(),
  objetivosText: 'Compreender conceitos',
  criteriosText: 'Avaliação prática',
  insumosText: 'Material de apoio',
  editorBaseRevision: 4,
  isEditorDirty: true,
  hasRemoteConflict: false,
  isMutating: false,
  pendingAction: null,
  changeText() {},
  handleDayContentChange() {},
  handleSave() {},
  handleConclude() {},
  discardLocalChanges() {},
  ...overrides,
});

test('editor real mantém conteúdo longo e aula futura com data, horário e carga canônicos', () => {
  const html = renderToStaticMarkup(React.createElement(Form, { editor: createEditor() }));
  assert.ok(html.includes(longContent), 'Conteúdo completo permanece no campo');
  for (const value of ['15/02/2027', '08:00', '12:00', '4 h']) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /text-base/);
  assert.match(html, /resize-y/);
  assert.doesNotMatch(html, /h-28|resize-none|data-plano-curso-page/);
  assert.equal((html.match(/<textarea/g) || []).length, 4, 'Três campos gerais e conteúdo do dia');
});

test('conflito e gravação bloqueiam ações; plano concluído é somente leitura', () => {
  const conflict = renderToStaticMarkup(
    React.createElement(Form, { editor: createEditor({ hasRemoteConflict: true }) }),
  );
  assert.match(conflict, /Descartar minhas alterações/);
  assert.equal(
    (conflict.match(/disabled=""/g) || []).length,
    2,
    'Salvar e concluir bloqueados por conflito',
  );
  const saving = renderToStaticMarkup(
    React.createElement(Form, {
      editor: createEditor({ isMutating: true, pendingAction: 'conclude' }),
    }),
  );
  assert.match(saving, /Concluindo o plano/);
  assert.equal(
    (saving.match(/<textarea[^>]+disabled=""/g) || []).length,
    4,
    'Todos os campos bloqueados durante mutação',
  );
  const editor = createEditor();
  editor.workspace = { ...editor.workspace, canEdit: false, status: 'CONCLUIDO' };
  const completed = renderToStaticMarkup(React.createElement(Form, { editor }));
  assert.doesNotMatch(completed, /<textarea|Salvar rascunho|Concluir plano/);
  assert.ok(completed.includes(longContent), 'Consulta preserva todo o conteúdo');
});
