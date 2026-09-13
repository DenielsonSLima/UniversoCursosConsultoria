import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { automaticProescCycleReviewOptions } from './proesc-cycle-review.query';
import { matriculaTecnicaFinanceiroKeys } from './matricula-tecnica-financeiro.keys';

type Result = { success: true; turmaId: string; reviewed: number };
const result = (turmaId: string): Result => ({ success: true, turmaId, reviewed: 12 });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
};

test('entrada financeira dispara uma revisão por turma e deduplica observadores durante a mesma consulta', async () => {
  const client = new QueryClient();
  const pending = deferred();
  let calls = 0;
  const review = async (turmaId: string) => {
    assert.equal(turmaId, 'class-a');
    calls++;
    return pending.promise;
  };
  const options = () => automaticProescCycleReviewOptions(client, 'class-a', review);
  const workspaceKey = matriculaTecnicaFinanceiroKeys.workspace('class-a');
  client.setQueryData(workspaceKey, { original: true });
  const observer = new QueryObserver(client, { ...options(), enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  let otherUnsubscribe = () => {};
  try {
    await flush();
    assert.equal(calls, 0, 'Sem necessidade canônica, T42/estado não importado não consulta Proesc');
    observer.setOptions({ ...options(), enabled: true });
    const other = new QueryObserver(client, options());
    otherUnsubscribe = other.subscribe(() => {});
    await flush();
    assert.equal(calls, 1, 'Montagem concorrente não duplica o batch da turma');
    pending.resolve(result('class-a'));
    await flush();
    await flush();
    assert.equal(observer.getCurrentResult().data?.turmaId, 'class-a');
    assert.equal(client.getQueryState(workspaceKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(options().queryKey)?.isInvalidated, false,
      'A invalidação financeira não pode invalidar a própria revisão');
    for (let index = 0; index < 10; index++) observer.setOptions({ ...options(), enabled: true });
    await flush();
    assert.equal(calls, 1, 'Atualização do workspace não cria repetição infinita');
  } finally {
    unsubscribe();
    otherUnsubscribe();
    client.clear();
  }
});

test('retornar à turma faz uma nova consulta automática sem depender de botão', async () => {
  const client = new QueryClient();
  let calls = 0;
  const options = () => automaticProescCycleReviewOptions(client, 'class-a', async (id) => {
    calls++;
    return result(id);
  });
  let unsubscribe = () => {};
  try {
    unsubscribe = new QueryObserver(client, options()).subscribe(() => {});
    await flush();
    await flush();
    assert.equal(calls, 1);
    unsubscribe();
    unsubscribe = new QueryObserver(client, options()).subscribe(() => {});
    await flush();
    await flush();
    assert.equal(calls, 2, 'Nova entrada revalida uma vez, usando cache de fonte do servidor');
  } finally { unsubscribe(); client.clear(); }
});

test('falha de consulta não gera retry automático nem invalidação repetida do workspace', async () => {
  const client = new QueryClient();
  const workspaceKey = matriculaTecnicaFinanceiroKeys.workspace('class-error');
  client.setQueryData(workspaceKey, { original: true });
  let calls = 0;
  const review = async () => { calls++; throw new Error('Falha controlada'); };
  const options = () => automaticProescCycleReviewOptions(client, 'class-error', review);
  const observer = new QueryObserver(client, options());
  const unsubscribe = observer.subscribe(() => {});
  try {
    await flush();
    await flush();
    assert.equal(observer.getCurrentResult().isError, true);
    for (let index = 0; index < 10; index++) observer.setOptions(options());
    await flush();
    assert.equal(calls, 1);
    assert.equal(client.getQueryState(workspaceKey)?.isInvalidated, false);
    assert.equal(options().retry, false);
    assert.equal(options().refetchOnWindowFocus, false);
    assert.equal(options().refetchOnReconnect, false);
  } finally { unsubscribe(); client.clear(); }
});

test('conferência parcial atualiza o workspace uma vez e mantém a falha visível sem repetição', async () => {
  const client = new QueryClient();
  const workspaceKey = matriculaTecnicaFinanceiroKeys.workspace('class-partial');
  client.setQueryData(workspaceKey, { original: true });
  let calls = 0;
  let invalidations = 0;
  let reviewInvalidations = 0;
  const unsubscribeCache = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
    if (JSON.stringify(event.query.queryKey) === JSON.stringify(workspaceKey)) invalidations++;
    if (event.query.queryKey[0] === 'proesc-cycle-review') reviewInvalidations++;
  });
  const options = () => automaticProescCycleReviewOptions(client, 'class-partial', async (turmaId) => {
    calls++;
    return { success: false, turmaId, reviewed: 4, failed: 1 };
  });
  const observer = new QueryObserver(client, options());
  const unsubscribe = observer.subscribe(() => {});
  try {
    await flush();
    await flush();
    assert.equal(observer.getCurrentResult().isError, true);
    assert.match(observer.getCurrentResult().error?.message ?? '', /não foi concluída para todos/);
    assert.equal(client.getQueryState(workspaceKey)?.isInvalidated, true);
    for (let index = 0; index < 10; index++) observer.setOptions(options());
    await flush();
    assert.equal(calls, 1);
    assert.equal(invalidations, 1, 'Os resultados já conferidos reaparecem sem reiniciar a conferência');
    assert.equal(reviewInvalidations, 0, 'O erro não dispara invalidateQueries sobre a própria revisão');
  } finally { unsubscribe(); unsubscribeCache(); client.clear(); }
});

test('conferência sem alterações não invalida o workspace', async () => {
  const client = new QueryClient();
  const workspaceKey = matriculaTecnicaFinanceiroKeys.workspace('class-empty');
  client.setQueryData(workspaceKey, { original: true });
  try {
    const options = automaticProescCycleReviewOptions(client, 'class-empty', async (turmaId) => ({
      success: true, turmaId, reviewed: 0,
    }));
    assert.deepEqual(await client.fetchQuery(options), { success: true, turmaId: 'class-empty', reviewed: 0 });
    assert.equal(client.getQueryState(workspaceKey)?.isInvalidated, false);
    assert.equal(client.getQueryState(options.queryKey)?.isInvalidated, false);
  } finally { client.clear(); }
});

test('trocar de turma durante consulta não apresenta a resposta da turma anterior', async () => {
  const client = new QueryClient();
  const first = deferred();
  const calls: string[] = [];
  const review = async (id: string) => {
    calls.push(id);
    return id === 'class-a' ? first.promise : result(id);
  };
  const options = (id: string) => automaticProescCycleReviewOptions(client, id, review);
  const observer = new QueryObserver(client, options('class-a'));
  const observed: Array<string | undefined> = [];
  const unsubscribe = observer.subscribe((snapshot) => observed.push(snapshot.data?.turmaId));
  try {
    observer.setOptions(options('class-b'));
    observed.length = 0;
    await flush();
    first.resolve(result('class-a'));
    await flush();
    await flush();
    assert.deepEqual(calls, ['class-a', 'class-b']);
    assert.equal(observer.getCurrentResult().data?.turmaId, 'class-b');
    assert.ok(!observed.includes('class-a'));
  } finally { unsubscribe(); client.clear(); }
});

test('revisão automática não oferece etapa extra nem chama emissão ou ativação', () => {
  const base = resolve(process.cwd(), 'modules/gestor/gestao/tecnicos/detalhes/components/financeiro');
  for (const file of ['FinanceiroAlunosList.tsx', 'FinanceiroAlunosTable.tsx', 'FinanceiroCicloManualStatus.tsx']) {
    const source = readFileSync(resolve(base, file), 'utf8');
    assert.doesNotMatch(source, /onReviewProesc|Conferir ciclos Proesc/);
  }
  const automatic = readFileSync(resolve(base, 'proesc-cycle-review.query.ts'), 'utf8');
  assert.doesNotMatch(automatic, /matriculaTecnicaCicloManualService|\.generate\(|\.resume\(|ativar_|generate_tecnico/);
});
