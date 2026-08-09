import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSubmitPlanoCursoEditorSession,
  dirtyPlanoCursoEditorSession,
  hydratedPlanoCursoEditorSession,
  reconcilePlanoCursoEditorSession,
} from './plano-curso-editor-session';

test('preserva draft e revisão-base quando outra sessão atualiza o plano', () => {
  const firstSession = dirtyPlanoCursoEditorSession(
    hydratedPlanoCursoEditorSession('turma-1:disciplina-1', 4),
  );

  const remoteUpdate = reconcilePlanoCursoEditorSession(
    firstSession,
    'turma-1:disciplina-1',
    5,
  );

  assert.equal(remoteUpdate.action, 'PRESERVE');
  assert.equal(remoteUpdate.session.baseRevision, 4);
  assert.equal(remoteUpdate.session.dirty, true);
  assert.equal(remoteUpdate.session.conflict, true);
  assert.equal(canSubmitPlanoCursoEditorSession(remoteUpdate.session), false);

  const reloaded = hydratedPlanoCursoEditorSession('turma-1:disciplina-1', 5);
  assert.equal(reloaded.baseRevision, 5);
  assert.equal(reloaded.dirty, false);
  assert.equal(reloaded.conflict, false);
  assert.equal(canSubmitPlanoCursoEditorSession(reloaded), true);
});

test('hidrata automaticamente revisão remota somente quando o editor está limpo', () => {
  const cleanSession = hydratedPlanoCursoEditorSession('turma-1:disciplina-1', 4);
  const remoteUpdate = reconcilePlanoCursoEditorSession(
    cleanSession,
    'turma-1:disciplina-1',
    5,
  );

  assert.equal(remoteUpdate.action, 'HYDRATE');
  assert.equal(remoteUpdate.session.baseRevision, 5);
  assert.equal(remoteUpdate.session.dirty, false);
  assert.equal(remoteUpdate.session.conflict, false);
});
