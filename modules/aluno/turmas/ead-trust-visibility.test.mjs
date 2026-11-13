import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: [fileURLToPath(new URL('./turmas.utils.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { isPortalEnrollmentVisible, hasEadAccess } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const enrollment = (status, deadline) => ({ id: 'enrollment', status, acesso_temporario_ate: deadline,
  turmas: { cursos: { modalidade: 'EAD' } } });
test('actual My Courses predicates recognize trust access without activation', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const pending = enrollment('PENDENTE', future);
  for (const predicate of [isPortalEnrollmentVisible, hasEadAccess]) {
    assert.equal(predicate(pending), true);
    assert.equal(predicate(enrollment('CANCELADO', future)), false);
    assert.equal(predicate(enrollment('PENDENTE', new Date(1).toISOString())), false);
    assert.equal(predicate(enrollment('PENDENTE', null)), false);
  }
  assert.equal(pending.status, 'PENDENTE');
});
test('home enrollment readers do not filter trust grants before the access predicate', () => {
  const home = readFileSync(new URL('../inicio/useAlunoHomeData.ts', import.meta.url), 'utf8');
  const enrollmentReaders = home.slice(home.indexOf('const { data: enrollmentSummary'), home.indexOf('const activeTurmaIds'));
  assert.doesNotMatch(enrollmentReaders, /\.in\('status'/);
  assert.match(enrollmentReaders, /filter\(isHomeEnrollmentVisible\)/);
  assert.match(enrollmentReaders, /acesso_temporario_ate/);
});
