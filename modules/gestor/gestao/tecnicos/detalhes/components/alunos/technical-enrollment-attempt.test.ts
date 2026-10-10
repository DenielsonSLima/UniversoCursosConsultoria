import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTechnicalEnrollmentAttempt } from './technical-enrollment-attempt.ts';

test('replay do mesmo payload conserva ID após o prazo e não cria novo negócio', async () => {
  const ids = new Map([['aluno:data:revisao:fingerprint', 'request-original']]);
  const requestId = await resolveTechnicalEnrollmentAttempt({ requestIds: ids,
    key: 'aluno:data:revisao:fingerprint', canEnroll: false,
    verifyAdmission: async () => { throw new Error('prazo expirado'); },
    createRequestId: () => { throw new Error('não pode criar ID no replay'); },
  });
  assert.equal(requestId, 'request-original');
  await assert.rejects(resolveTechnicalEnrollmentAttempt({ requestIds: ids,
    key: 'aluno:OUTRA_DATA:revisao:fingerprint', canEnroll: false,
    admissionMessage: 'Use transferência.', createRequestId: () => 'novo',
  }), /Use transferência/);
  assert.equal(ids.size, 1);
});

test('nova tentativa exige revalidação e não reserva ID quando o servidor nega ingresso', async () => {
  const ids = new Map<string, string>();
  await assert.rejects(resolveTechnicalEnrollmentAttempt({ requestIds: ids, key: 'novo',
    canEnroll: true, verifyAdmission: async () => { throw new Error('prazo expirado'); },
    createRequestId: () => { throw new Error('não pode reservar ID sem autorização'); },
  }), /prazo expirado/);
  assert.equal(ids.size, 0);
  let checks = 0;
  const requestId = await resolveTechnicalEnrollmentAttempt({ requestIds: ids, key: 'novo',
    canEnroll: true, verifyAdmission: async () => { checks += 1; },
    createRequestId: () => 'request-validado',
  });
  assert.equal(requestId, 'request-validado');
  assert.equal(checks, 1);
  assert.equal(ids.get('novo'), requestId);
});
