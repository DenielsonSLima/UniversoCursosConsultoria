import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./cursosPage.utils.ts', import.meta.url), 'utf8');
const fn = source.match(/export const hasEadAccess = \(course: any, now = Date.now\(\)\) => \{([\s\S]*?)\n\};/)[1];
const hasAccess = new Function('course', 'now', 'EAD_ACCESS_STATUSES', 'EAD_PENDING_STATUSES', 'normalizeStatus', fn);
const check = (status, expires, now = 1000) => hasAccess({ alunoMatricula: { status, acessoTemporarioAte: expires } }, now,
  new Set(['ATIVO', 'CONCLUIDO']), new Set(['PENDENTE', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO']), value => String(value || '').toUpperCase());
test('trust expiration is strict, status remains pending and invalid dates deny access', () => {
  assert.equal(check('PENDENTE', new Date(1001).toISOString()), true);
  assert.equal(check('PENDENTE', new Date(1000).toISOString()), false);
  assert.equal(check('PENDENTE', 'bad'), false);
  assert.equal(check('PENDENTE', null), false);
  assert.equal(check('CANCELADO', new Date(1001).toISOString()), false);
  assert.equal(check('ATIVO', null), true);
  assert.equal(check('CONCLUIDO', null), true);
});
