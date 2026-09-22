import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';

const turmaId = 'turma-atual';
const poloId = 'polo-atual';
const fixtures = [
  {
    name: 'resumo', file: './useGestaoRealtime.ts', hook: 'useGestaoRealtime',
    args: [poloId], scope: 'polo_id', scopeId: poloId, delay: 250,
    channel: `gestao-resumo-${poloId}`, count: 3,
    firstKey: ['gestao', 'resumos'],
  },
  {
    name: 'presencial', file: './useTurmaPresencialRealtime.ts', hook: 'useTurmaPresencialRealtime',
    args: [{ turmaId, modalidade: 'LIVRE', channelPrefix: 'gestao-livre' }],
    scope: 'turma_id', scopeId: turmaId, delay: 300,
    channel: `gestao-livre-${turmaId}`, count: 7,
    firstKey: ['academic-lifecycle', 'turma', turmaId],
  },
  {
    name: 'EAD', file: '../ead/detalhes/hooks/useTurmaEadRealtime.ts', hook: 'useTurmaEadRealtime',
    args: [turmaId], scope: 'turma_id', scopeId: turmaId, delay: 300,
    channel: `gestao-ead-turma-${turmaId}`, count: 1,
    firstKey: ['gestao-ead-turma', turmaId],
  },
  {
    name: 'técnico', file: '../tecnicos/detalhes/hooks/useTurmaTecnicoRealtime.ts', hook: 'useTurmaTecnicoRealtime',
    args: [turmaId], scope: 'turma_id', scopeId: turmaId, delay: 300,
    channel: `turma-tecnico-${turmaId}`, count: 8,
    firstKey: ['academic-lifecycle', 'turma', turmaId],
  },
];

// Execute the real hook effect and subscriptions; replace only its environment.
// No browser, Supabase connection or wall-clock timers are used.
for (const fixture of fixtures) {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(fixture.file, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{
      name: 'realtime-hook-environment',
      setup(builder) {
        const stubs = {
          react: 'export const useEffect = (effect) => globalThis.harness.effects.push(effect());',
          '@tanstack/react-query': 'export const useQueryClient = () => globalThis.harness.queryClient;',
          supabase: 'export const supabase = globalThis.harness.supabase;',
        };
        builder.onResolve({ filter: /^(react|@tanstack\/react-query)$|\/lib\/supabase$/ }, ({ path }) => ({
          path: path.endsWith('/lib/supabase') ? 'supabase' : path,
          namespace: 'hook-stub',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'hook-stub' }, ({ path }) => ({ contents: stubs[path] }));
      },
    }],
  });
  fixture.code = bundle.outputFiles[0].text;
}

function mount(fixture, args = fixture.args) {
  const subscriptions = [];
  const timers = new Map();
  const invalidations = [];
  const refetches = [];
  const effects = [];
  let nextTimer = 0;
  let channelName;
  let removed = false;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const clock = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const channel = {
    on(type, config, callback) {
      assert.equal(type, 'postgres_changes');
      subscriptions.push({ config, callback });
      return channel;
    },
    subscribe(callback) { callback?.('SUBSCRIBED'); return channel; },
  };
  const harness = {
    effects,
    queryClient: {
      invalidateQueries(options) { invalidations.push(copy(options)); return Promise.resolve(); },
      refetchQueries(options) { refetches.push(copy(options)); return Promise.resolve(); },
      getQueryData() { return undefined; },
    },
    supabase: {
      channel(name) { channelName = name; return channel; },
      removeChannel(value) { assert.equal(value, channel); removed = true; },
    },
  };
  const module = { exports: {} };
  runInNewContext(fixture.code, { module, exports: module.exports, harness, window: clock, ...clock });
  module.exports[fixture.hook](...args);
  return {
    invalidations, refetches, timers,
    get channelName() { return channelName; },
    get removed() { return removed; },
    emit(eventType, row, table = 'gestao_realtime_events') {
      for (const { config, callback } of subscriptions) {
        if (config.schema !== 'public' || config.table !== table) continue;
        if (config.event !== '*' && config.event !== eventType) continue;
        // DELETE notifications may lack filter columns. Deliver them to every
        // wildcard subscriber so the test also covers that Realtime behavior.
        if (eventType !== 'DELETE' && config.filter) {
          const [column, value] = config.filter.split('=eq.');
          if (row[column] !== value) continue;
        }
        callback({ eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'DELETE' ? row : {} });
      }
    },
    flush() {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.callback();
      }
    },
    unmount() { effects.forEach((cleanup) => cleanup?.()); },
  };
}

for (const fixture of fixtures) {
  test(`${fixture.name}: INSERT atualiza o escopo atual com o debounce existente`, () => {
    const hook = mount(fixture);
    assert.equal(hook.channelName, fixture.channel);
    hook.emit('INSERT', { [fixture.scope]: 'outro-escopo', source_table: 'turmas' });
    assert.equal(hook.invalidations.length, 0);
    assert.equal(hook.timers.size, 0);
    const row = { [fixture.scope]: fixture.scopeId, source_table: 'turmas' };
    hook.emit('INSERT', row);
    hook.emit('INSERT', row);
    assert.equal(hook.timers.size, 1, 'dois sinais próximos devem compartilhar o refetch');
    assert.equal([...hook.timers.values()][0].delay, fixture.delay);
    assert.equal(hook.refetches.length, 0);
    hook.flush();
    assert.deepEqual(hook.invalidations[0].queryKey, fixture.firstKey);
    if (fixture.name === 'resumo') {
      assert.deepEqual(hook.invalidations.map(({ queryKey }) => queryKey), [
        ['gestao', 'resumos'], ['gestao', 'resumo-active-classes'], ['gestao', 'turmas'],
      ]);
    } else {
      assert.equal(hook.invalidations.length, fixture.count * 2);
      assert.equal(hook.refetches.length, fixture.count);
      assert.ok(hook.invalidations.every(({ refetchType }) => refetchType === 'none'));
      assert.ok(hook.refetches.every(({ type, stale }) => type === 'active' && stale === true));
    }
    hook.emit('INSERT', row);
    const refetchCount = hook.refetches.length;
    const invalidationCount = hook.invalidations.length;
    hook.unmount();
    assert.equal(hook.removed, true);
    assert.equal(hook.timers.size, 0);
    hook.flush();
    assert.equal(hook.refetches.length, refetchCount);
    assert.equal(hook.invalidations.length, invalidationCount);
  });

  test(`${fixture.name}: expiração DELETE da outbox não invalida nem consulta`, () => {
    const hook = mount(fixture);
    hook.emit('DELETE', { [fixture.scope]: fixture.scopeId, source_table: 'turmas' });
    hook.emit('DELETE', { id: 123 });
    hook.flush();
    assert.equal(hook.invalidations.length, 0);
    assert.equal(hook.refetches.length, 0);
    assert.equal(hook.timers.size, 0);
    hook.unmount();
  });
}

test('resumo global continua recebendo INSERT de qualquer polo', () => {
  const hook = mount(fixtures[0], []);
  hook.emit('INSERT', { polo_id: 'qualquer-polo', source_table: 'turmas' });
  hook.flush();
  assert.equal(hook.channelName, 'gestao-resumo-global');
  assert.equal(hook.invalidations.length, 3);
  hook.unmount();
});

test('DELETE de tabelas de negócio mantém a atualização presencial, EAD e técnica', () => {
  for (const [fixture, table, row] of [
    [fixtures[1], 'matricula_movimentacoes', { turma_origem_id: turmaId }],
    [fixtures[2], 'inscricoes_online', { turma_id: turmaId }],
    [fixtures[3], 'contas_receber', { turma_id: turmaId }],
  ]) {
    const hook = mount(fixture);
    hook.emit('DELETE', row, table);
    hook.flush();
    assert.ok(hook.invalidations.length >= fixture.count, fixture.name);
    assert.ok(hook.refetches.length >= fixture.count, fixture.name);
    hook.unmount();
  }
});

test('técnico continua ignorando somente o espelho de turmas_disciplinas na outbox', () => {
  const hook = mount(fixtures[3]);
  hook.emit('INSERT', { turma_id: turmaId, source_table: 'turmas_disciplinas' });
  assert.equal(hook.invalidations.length, 0);
  assert.equal(hook.timers.size, 0);
  hook.unmount();
});
