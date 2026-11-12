import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { openEadBoletoTab } from './ead-boleto-tab.ts';

const originalWindow = globalThis.window;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
afterEach(() => { globalThis.window = originalWindow; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; });
function fixture(blocked = false) {
  const navigations: string[] = [], revoked: string[] = [], timers: (() => void)[] = [];
  const tab = { closed: false, opener: {}, document: { title: '', body: { textContent: '' } },
    close() { this.closed = true; }, location: { replace(url: string) { navigations.push(url); } } };
  globalThis.window = { open: () => blocked ? null : tab, setTimeout: (fn: () => void) => { timers.push(fn); } } as unknown as Window & typeof globalThis;
  URL.createObjectURL = () => 'blob:private-pdf';
  URL.revokeObjectURL = value => { revoked.push(value); };
  return { tab, navigations, revoked, timers };
}
test('abre aba no clique, remove opener e só navega para Blob autenticado', async () => {
  const f = fixture(); let resolve!: (blob: Blob) => void;
  const task = openEadBoletoTab(() => new Promise(r => { resolve = r; }));
  assert.equal(f.tab.opener, null); assert.equal(f.navigations.length, 0);
  resolve(new Blob(['pdf'], { type: 'application/pdf' })); await task.result;
  assert.match(f.navigations[0], /^blob:private-pdf#/);
  task.cancel(); assert.equal(f.tab.closed, false, 'PDF aberto permanece após sair da tela');
  f.timers[0](); assert.deepEqual(f.revoked, ['blob:private-pdf']);
});
test('popup bloqueado não faz requisição', () => {
  fixture(true); let called = false;
  assert.throws(() => openEadBoletoTab(async () => { called = true; return new Blob(); }), /Permita/);
  assert.equal(called, false);
});
test('navegação/troca de aluno cancela pendência e impede resposta tardia', async () => {
  const f = fixture(); let resolve!: (blob: Blob) => void; let signal!: AbortSignal;
  const task = openEadBoletoTab(s => { signal = s; return new Promise(r => { resolve = r; }); });
  task.cancel(); assert.equal(signal.aborted, true); assert.equal(f.tab.closed, true);
  resolve(new Blob()); await task.result; assert.equal(f.navigations.length, 0);
});
test('erro fecha aba pendente e permite tratamento no portal', async () => {
  const f = fixture(); const task = openEadBoletoTab(async () => { throw new Error('negado'); });
  await assert.rejects(task.result, /negado/); assert.equal(f.tab.closed, true);
});
test('usuário fecha aba antes do resultado: nenhum Blob ou navegação', async () => {
  const f = fixture(); let resolve!: (blob: Blob) => void;
  const task = openEadBoletoTab(() => new Promise(r => { resolve = r; }));
  f.tab.close(); resolve(new Blob()); await task.result;
  assert.equal(f.navigations.length, 0); assert.equal(f.timers.length, 0);
});
