import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSecondCycleWarning, readOpenCycleCharges, type SecondCycleWarningState } from './second-cycle-warning.ts';

const charge = (id = 'one', status = 'PENDENTE') => ({
  id, descricao: 'Mensalidade de teste', valor: '120.00', valor_pago: '0.00',
  data_vencimento: '2026-10-15', status,
});
const statement = (...recebiveis: unknown[]) => ({ matriculaId: 'enrollment-test', recebiveis });
const parse = (value: unknown) => readOpenCycleCharges(value, 'enrollment-test');
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test('lists pending, overdue and partial; excludes paid and cancelled without inferring balance', () => {
  const rows = parse(statement(charge(), charge('overdue', 'VENCIDO'),
    { ...charge('partial', 'PARCIAL'), valor_pago: '50.00' }, charge('paid', 'PAGO'), charge('cancelled', 'CANCELADO')));
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.id === 'partial')?.valor, '120.00');
  assert.equal(rows.find((row) => row.id === 'partial')?.valorPago, '50.00');
});

test('empty and fully settled statements are valid; missing, denied and malformed reads fail closed', () => {
  assert.deepEqual(parse(statement()), []);
  assert.deepEqual(parse(statement(charge('paid', 'PAGO'), charge('cancelled', 'CANCELADO'))), []);
  for (const value of [null, {}, { matriculaId: 'other', recebiveis: [] },
    { matriculaId: 'enrollment-test' }, statement(charge(), charge()),
    statement(charge('unknown', 'UNKNOWN')), statement({ ...charge(), valor: 'NaN' }),
    statement({ ...charge(), valor_pago: -1 }), statement({ ...charge(), data_vencimento: '2026-02-30' })]) {
    assert.throws(() => parse(value));
  }
});

test('loading never emits, double continue clicks recheck only once and emit once', async () => {
  const pending = deferred<ReturnType<typeof parse>>();
  let count = 0;
  let reads = 0;
  const states: SecondCycleWarningState[] = [];
  const rows = parse(statement(charge()));
  const controller = createSecondCycleWarning({
    read: async () => ++reads === 1 ? rows : pending.promise,
    onConfirm: () => { count++; }, onChange: (state) => states.push(state),
  });
  await controller.confirm();
  assert.equal(reads, 0);
  await controller.load();
  assert.equal(count, 0);
  const first = controller.confirm();
  await controller.confirm();
  assert.equal(reads, 2);
  assert.equal(count, 0);
  pending.resolve(rows);
  await first;
  assert.equal(count, 1);
  await controller.confirm();
  assert.equal(count, 1);
  assert.equal(states.at(-1)?.charges, null);
});

test('changed charges replace list and require another explicit confirmation', async () => {
  let count = 0;
  let rows = parse(statement(charge()));
  let state!: SecondCycleWarningState;
  const controller = createSecondCycleWarning({ read: async () => rows,
    onConfirm: () => { count++; }, onChange: (next) => { state = next; } });
  await controller.load();
  rows = parse(statement(charge(), charge('new')));
  await controller.confirm();
  assert.equal(count, 0);
  assert.equal(state.changed, true);
  assert.equal(state.charges?.length, 2);
  await controller.confirm();
  assert.equal(count, 1);
});

test('read failure after displayed cache blocks issuance until reload and new confirmation', async () => {
  let fail = false;
  let count = 0;
  let state!: SecondCycleWarningState;
  const controller = createSecondCycleWarning({ read: async () => {
    if (fail) throw new Error('Permission denied');
    return parse(statement());
  }, onConfirm: () => { count++; }, onChange: (next) => { state = next; } });
  await controller.load(); fail = true;
  await controller.confirm();
  assert.equal(count, 0);
  assert.equal(state.charges, null);
  assert.equal(state.error, 'Permission denied');
  fail = false;
  await controller.confirm();
  assert.equal(count, 0);
  await controller.load();
  await controller.confirm();
  assert.equal(count, 1);
});

test('cancel, back/unmount or changed selection invalidate an in-flight confirmation', async () => {
  for (const interruption of ['cancel', 'back', 'selection', 'preview']) {
    let count = 0;
    let reads = 0;
    const pending = deferred<ReturnType<typeof parse>>();
    const rows = parse(statement(charge()));
    const controller = createSecondCycleWarning({ read: async () => ++reads === 1 ? rows : pending.promise,
      onConfirm: () => { count++; }, onChange: () => {} });
    await controller.load();
    const confirmation = controller.confirm();
    controller.dispose();
    pending.resolve(rows);
    await confirmation;
    assert.equal(count, 0, interruption);
    await controller.confirm();
    assert.equal(reads, 2);
  }
});
