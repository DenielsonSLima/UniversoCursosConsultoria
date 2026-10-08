import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identityHandlerFixture, ALUNO_ID, OTHER_UID } from './banese_student_identity_handlers.fixture.mjs';

const endpoints = ['banese-student-payment', 'banese-boleto-document', 'banese-carnet-document'];

for (const endpoint of endpoints) {
  test(`${endpoint}: aluno por matrícula acessa a própria cobrança com contato diferente`, async () => {
    const fixture = await identityHandlerFixture(endpoint);
    const response = await fixture.request();
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(fixture.trace.gestor, 0);
    if (endpoint === 'banese-student-payment') {
      assert.equal(fixture.trace.clients[0].config.global.headers.Authorization, 'Bearer valid-fixture-token');
      assert.ok(fixture.trace.queries.some(query => query.table === 'contas_receber'
        && query.filters.some(([, field, value]) => field === 'cliente_id' && value === ALUNO_ID)));
    } else {
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(fixture.trace.pdf, 1);
    }
  });

  test(`${endpoint}: outra cobrança não produz dados, PDF ou recuperação`, async () => {
    const fixture = await identityHandlerFixture(endpoint, { otherOwner: true });
    const response = await fixture.request();
    assert.equal(response.status, endpoint === 'banese-student-payment' ? 404 : 403);
    assert.equal(fixture.trace.pdf, 0);
    assert.equal(fixture.trace.recovery, 0);
  });

  for (const [label, options] of [
    ['sem vínculo', { unlinked: true }],
    ['UID diferente', { authUserId: OTHER_UID }],
    ['inativo', { status: 'INATIVO' }],
    ['identidade ambígua', { duplicate: true }],
  ]) {
    test(`${endpoint}: ${label} não recebe documento`, async () => {
      const fixture = await identityHandlerFixture(endpoint, options);
      const response = await fixture.request();
      assert.equal(response.status, 403);
      assert.equal(fixture.trace.pdf, 0);
      assert.equal(fixture.trace.recovery, 0);
    });
  }

  for (const options of [{ invalidSession: true }, { missingToken: true }]) {
    test(`${endpoint}: sessão inválida/ausente para antes das consultas`, async () => {
      const fixture = await identityHandlerFixture(endpoint, options);
      assert.equal((await fixture.request()).status, 401);
      assert.equal(fixture.trace.queries.length, 0);
    });
  }
}

for (const endpoint of endpoints.slice(1)) {
  test(`${endpoint}: gestor preserva acesso autorizado e conferência de polo`, async () => {
    const fixture = await identityHandlerFixture(endpoint, { authUserId: OTHER_UID, gestor: true });
    const response = await fixture.request();
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(fixture.trace.gestor, 1);
    assert.equal(fixture.trace.scope, 1);
    assert.equal(fixture.trace.pdf, 1);
  });

  test(`${endpoint}: gestor fora do polo não gera PDF`, async () => {
    const fixture = await identityHandlerFixture(endpoint, { authUserId: OTHER_UID, gestor: true, deniedPolo: true });
    assert.equal((await fixture.request()).status, 403);
    assert.equal(fixture.trace.pdf, 0);
  });
}

for (const endpoint of endpoints) {
  test(`${endpoint}: UID fornecido no corpo não substitui a identidade da sessão`, async () => {
    const fixture = await identityHandlerFixture(endpoint, { authUserId: OTHER_UID });
    const response = await fixture.request({ auth_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alunoId: ALUNO_ID });
    assert.equal(response.status, endpoint === 'banese-carnet-document' ? 400 : 403);
    assert.equal(fixture.trace.pdf, 0);
    assert.equal(fixture.trace.recovery, 0);
  });
}
