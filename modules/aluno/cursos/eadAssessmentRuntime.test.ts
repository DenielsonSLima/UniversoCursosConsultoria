import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEadProgressOperationQueue,
  flushEadActivityDraftSaves,
  getEadActivityDraftKey,
  getEadDraftsAfterConfirmedSave,
  getEadProgressAvailability,
  getEadRetryReleaseToken,
  getEadServerConfirmedRetryUnlockToken,
  getPendingEadActivityDraftSaves,
  type EadProgressOperationInput,
} from './eadAssessmentRuntime.ts';

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushTasks = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const operation = (action: string, itemId?: string, answer?: string): EadProgressOperationInput => ({
  alunoId: 'aluno-1',
  courseId: 'curso-1',
  action,
  itemId,
  payload: answer === undefined ? {} : { answer },
});

test('fila executa mutações diferentes em série', async () => {
  const first = createDeferred<string>();
  const second = createDeferred<string>();
  const calls: string[] = [];
  const queue = createEadProgressOperationQueue(async (input) => {
    calls.push(input.itemId || input.action);
    return calls.length === 1 ? first.promise : second.promise;
  });

  const firstResult = queue.enqueue(operation('toggle_content', 'etapa-1'));
  const secondResult = queue.enqueue(operation('toggle_content', 'etapa-2'));
  assert.deepEqual(calls, ['etapa-1']);
  assert.equal(queue.getSnapshot().pendingCount, 2);

  first.resolve('primeira');
  await flushTasks();
  assert.deepEqual(calls, ['etapa-1', 'etapa-2']);

  second.resolve('segunda');
  assert.equal(await firstResult, 'primeira');
  assert.equal(await secondResult, 'segunda');
  assert.equal(queue.getSnapshot().pendingCount, 0);
});

test('textarea mantém o primeiro envio ativo e coalesce rascunhos intermediários no último', async () => {
  const first = createDeferred<string>();
  const latest = createDeferred<string>();
  const answers: unknown[] = [];
  const queue = createEadProgressOperationQueue(async (input) => {
    answers.push(input.payload?.answer);
    return answers.length === 1 ? first.promise : latest.promise;
  });

  const promiseA = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'A'));
  const promiseB = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'B'));
  const promiseC = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'C'));
  assert.equal(promiseA, promiseB);
  assert.equal(promiseB, promiseC);
  assert.deepEqual(answers, ['A']);

  first.resolve('A salva');
  await flushTasks();
  assert.deepEqual(answers, ['A', 'C']);

  latest.resolve('C salva');
  assert.equal(await promiseC, 'C salva');
  assert.equal(queue.getSnapshot().pendingCount, 0);
});

test('textarea ainda salva a revisão mais nova quando a revisão em voo falha', async () => {
  const first = createDeferred<string>();
  const latest = createDeferred<string>();
  const answers: unknown[] = [];
  const queue = createEadProgressOperationQueue(async (input) => {
    answers.push(input.payload?.answer);
    return answers.length === 1 ? first.promise : latest.promise;
  });

  const saving = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'B'));
  const restored = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'A'));
  assert.equal(saving, restored);

  first.reject(new Error('falha ao salvar B'));
  await flushTasks();
  assert.deepEqual(answers, ['B', 'A']);

  latest.resolve('A restaurada');
  assert.equal(await restored, 'A restaurada');
  assert.equal(queue.getSnapshot().pendingCount, 0);
});

test('conclusão aguarda o último rascunho coalescido ser persistido', async () => {
  const firstSave = createDeferred<string>();
  const latestSave = createDeferred<string>();
  const completion = createDeferred<string>();
  const calls: string[] = [];
  const queue = createEadProgressOperationQueue(async (input) => {
    calls.push(`${input.action}:${String(input.payload?.answer || '')}`);
    if (calls.length === 1) return firstSave.promise;
    if (calls.length === 2) return latestSave.promise;
    return completion.promise;
  });

  const saving = queue.enqueue(operation('set_activity_answer', 'atividade-1', 'A'));
  const completing = queue.enqueue(operation('complete_activity', 'atividade-1'));
  queue.enqueue(operation('set_activity_answer', 'atividade-1', 'C'));

  firstSave.resolve('A salva');
  await flushTasks();
  assert.deepEqual(calls, ['set_activity_answer:A', 'set_activity_answer:C']);
  latestSave.resolve('C salva');
  await flushTasks();
  assert.deepEqual(calls, ['set_activity_answer:A', 'set_activity_answer:C', 'complete_activity:']);

  completion.resolve('concluída');
  assert.equal(await saving, 'C salva');
  assert.equal(await completing, 'concluída');
});

test('duplo envio síncrono da prova compartilha uma única execução', async () => {
  const submitted = createDeferred<string>();
  let executions = 0;
  const queue = createEadProgressOperationQueue(async () => {
    executions += 1;
    return submitted.promise;
  });
  const input = operation('finish_quiz');

  const first = queue.enqueue(input);
  const duplicate = queue.enqueue(input);
  assert.equal(first, duplicate);
  assert.equal(executions, 1);

  submitted.resolve('corrigida');
  assert.equal(await duplicate, 'corrigida');
  assert.equal(executions, 1);
});

test('falha libera a chave e não interrompe a próxima operação', async () => {
  const first = createDeferred<string>();
  const second = createDeferred<string>();
  const retry = createDeferred<string>();
  let executions = 0;
  const queue = createEadProgressOperationQueue(async () => {
    executions += 1;
    if (executions === 1) return first.promise;
    return executions === 2 ? second.promise : retry.promise;
  });

  const failed = queue.enqueue(operation('finish_quiz'));
  const next = queue.enqueue(operation('toggle_video', 'video-principal'));
  first.reject(new Error('rede indisponível'));
  await assert.rejects(failed, /rede indisponível/);
  await flushTasks();
  assert.equal(executions, 2);

  second.resolve('vídeo salvo');
  assert.equal(await next, 'vídeo salvo');

  const deliberateRetry = queue.enqueue(operation('finish_quiz'));
  await flushTasks();
  retry.resolve('retry aceito');
  assert.equal(await deliberateRetry, 'retry aceito');
});

test('token de liberação é estável após o prazo e muda em uma nova reprovação', () => {
  assert.equal(getEadRetryReleaseToken('curso-1', 2_000, 1_999), null);
  const released = getEadRetryReleaseToken('curso-1', 2_000, 2_000);
  assert.equal(released, 'curso-1:2000');
  assert.equal(getEadRetryReleaseToken('curso-1', 2_000, 9_000), released);
  assert.equal(getEadRetryReleaseToken('curso-1', 4_000, 9_000), 'curso-1:4000');
  assert.equal(getEadRetryReleaseToken('', 2_000, 2_000), null);
});

test('nova tentativa é resemeada somente após confirmação do servidor', () => {
  assert.equal(getEadServerConfirmedRetryUnlockToken('curso-1', true, 'curso-1', true, 2_000), null);
  assert.equal(getEadServerConfirmedRetryUnlockToken('curso-1', false, 'curso-1', false, 2_000), null);
  assert.equal(getEadServerConfirmedRetryUnlockToken('curso-1', true, 'curso-2', false, 2_000), null);
  assert.equal(
    getEadServerConfirmedRetryUnlockToken('curso-1', true, 'curso-1', false, 2_000),
    'curso-1:2000',
  );
  assert.equal(
    getEadServerConfirmedRetryUnlockToken('curso-1', true, 'curso-1', false, null),
    'curso-1:server',
  );
});

test('progresso sem fotografia autoritativa bloqueia mutações e distingue retry', () => {
  assert.deepEqual(getEadProgressAvailability(false, true, false), {
    isReady: false,
    isLoading: true,
    isRefreshing: false,
    hasBlockingError: false,
    hasRefreshError: false,
  });
  assert.deepEqual(getEadProgressAvailability(false, false, true), {
    isReady: false,
    isLoading: false,
    isRefreshing: false,
    hasBlockingError: true,
    hasRefreshError: false,
  });
  assert.deepEqual(getEadProgressAvailability(true, true, true), {
    isReady: true,
    isLoading: false,
    isRefreshing: true,
    hasBlockingError: false,
    hasRefreshError: true,
  });
});

test('rascunhos são isolados por aluno e curso e só geram saves quando estão sujos', () => {
  const firstKey = getEadActivityDraftKey('aluno-1:curso-1', 0, 'atividade-1');
  const otherContextKey = getEadActivityDraftKey('aluno-2:curso-1', 0, 'atividade-1');
  assert.notEqual(firstKey, otherContextKey);

  const drafts = { [firstKey]: 'Resposta nova', [otherContextKey]: 'Resposta de outro aluno' };
  assert.deepEqual(getPendingEadActivityDraftSaves(drafts, [{
    draftKey: firstKey,
    activityId: 'atividade-1',
    persistedAnswer: 'Resposta anterior',
  }]), [{ draftKey: firstKey, activityId: 'atividade-1', answer: 'Resposta nova' }]);
  assert.deepEqual(getPendingEadActivityDraftSaves({ [firstKey]: 'Resposta anterior' }, [{
    draftKey: firstKey,
    activityId: 'atividade-1',
    persistedAnswer: 'Resposta anterior',
  }]), []);
});

test('flush usa a revisão síncrona mais recente mesmo antes do próximo render', () => {
  const draftKey = getEadActivityDraftKey('aluno-1:curso-1', 0, 'atividade-1');
  const staleRenderSnapshot: Record<string, string> = {};
  const latestDraftRef = { [draftKey]: 'Último texto digitado' };
  const descriptors = [{ draftKey, activityId: 'atividade-1', persistedAnswer: '' }];

  assert.deepEqual(getPendingEadActivityDraftSaves(staleRenderSnapshot, descriptors), []);
  assert.deepEqual(getPendingEadActivityDraftSaves(latestDraftRef, descriptors), [{
    draftKey,
    activityId: 'atividade-1',
    answer: 'Último texto digitado',
  }]);
});

test('flush de rascunhos aguarda cada save em ordem antes de liberar navegação', async () => {
  const first = createDeferred<string>();
  const second = createDeferred<string>();
  const calls: string[] = [];
  const saves = [
    { draftKey: 'd1', activityId: 'atividade-1', answer: 'A' },
    { draftKey: 'd2', activityId: 'atividade-2', answer: 'B' },
  ];
  const flushing = flushEadActivityDraftSaves(saves, async (draft) => {
    calls.push(draft.activityId);
    return calls.length === 1 ? first.promise : second.promise;
  });

  assert.deepEqual(calls, ['atividade-1']);
  first.resolve('A salva');
  await flushTasks();
  assert.deepEqual(calls, ['atividade-1', 'atividade-2']);
  second.resolve('B salva');
  assert.equal(await flushing, 2);
});

test('falha no flush mantém o rascunho disponível para nova tentativa', async () => {
  const draftKey = getEadActivityDraftKey('aluno-1:curso-1', 0, 'atividade-1');
  let drafts = { [draftKey]: 'Texto preservado' };
  const saves = getPendingEadActivityDraftSaves(drafts, [{
    draftKey,
    activityId: 'atividade-1',
    persistedAnswer: '',
  }]);

  await assert.rejects(
    flushEadActivityDraftSaves(saves, async (draft) => {
      const confirmedAnswer = await Promise.reject<string>(new Error('rede indisponível'));
      drafts = getEadDraftsAfterConfirmedSave(drafts, draft, confirmedAnswer);
    }),
    /rede indisponível/,
  );
  assert.equal(drafts[draftKey], 'Texto preservado');
});

test('draft só é removido quando o servidor confirma a mesma revisão ainda exibida', async () => {
  const draftKey = getEadActivityDraftKey('aluno-1:curso-1', 0, 'atividade-1');
  const save = { draftKey, activityId: 'atividade-1', answer: 'Revisão A' };
  const confirmation = createDeferred<string>();
  let drafts = { [draftKey]: 'Revisão A' };
  const saving = confirmation.promise.then((confirmedAnswer) => {
    drafts = getEadDraftsAfterConfirmedSave(drafts, save, confirmedAnswer);
  });

  drafts = { [draftKey]: 'Revisão B' };
  confirmation.resolve('Revisão A');
  await saving;
  assert.equal(drafts[draftKey], 'Revisão B');

  assert.equal(
    getEadDraftsAfterConfirmedSave({ [draftKey]: 'Revisão A' }, save, 'Outra resposta')[draftKey],
    'Revisão A',
  );
  assert.deepEqual(getEadDraftsAfterConfirmedSave({ [draftKey]: 'Revisão A' }, save, 'Revisão A'), {});
});
