import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAuthReturnFailure,
  getAuthReturnFailureMessage,
  getPasswordSetupTypeInUrl,
  resolvePasswordSetupPresentation,
} from './password-recovery-auth.ts';

test('classifica falha de trigger do Auth como interna, sem alegar expiração', () => {
  const failureKind = classifyAuthReturnFailure({
    error: 'server_error',
    errorCode: 'unexpected_failure',
    errorDescription: 'Database error saving new user',
  });

  assert.equal(failureKind, 'internal');
  const message = getAuthReturnFailureMessage(failureKind, {
    audience: 'institutional',
    intent: 'invite',
  });
  assert.match(message, /falha interna/i);
  assert.match(message, /não significa que o link expirou/i);
  assert.doesNotMatch(message, /convite expirou ou já foi utilizado/i);
});

test('reserva a mensagem de convite expirado para otp_expired', () => {
  const failureKind = classifyAuthReturnFailure({
    error: 'access_denied',
    errorCode: 'otp_expired',
    errorDescription: 'Email link is invalid or has expired',
  });

  assert.equal(failureKind, 'expired');
  assert.match(
    getAuthReturnFailureMessage(failureKind, {
      audience: 'institutional',
      intent: 'invite',
    }),
    /convite de primeiro acesso expirou ou já foi utilizado/i,
  );
});

test('erro genérico de callback não é convertido silenciosamente em expiração', () => {
  const failureKind = classifyAuthReturnFailure({
    error: 'access_denied',
    errorCode: 'bad_jwt',
    errorDescription: 'Invalid verification response',
  });

  assert.equal(failureKind, 'invalid');
  assert.match(
    getAuthReturnFailureMessage(failureKind, {
      audience: 'institutional',
      intent: 'invite',
    }),
    /não foi possível validar o convite/i,
  );
});

test('mantém a mensagem atual de expiração para recuperação do aluno', () => {
  const message = getAuthReturnFailureMessage('expired', {
    audience: 'student',
    intent: 'recovery',
  });

  assert.equal(
    message,
    'O link de recuperação é inválido ou expirou. Solicite um novo link abaixo.',
  );
});

test('reconhece o retorno assinado de convite sem depender de query própria', () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        hash: '#access_token=seguro&type=invite',
        search: '',
      },
    },
  });

  try {
    assert.equal(getPasswordSetupTypeInUrl(), 'invite');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

test('mantém o visual institucional quando a URL foi limpa e o marker confirma o convite', () => {
  assert.deepEqual(
    resolvePasswordSetupPresentation({
      appFlow: false,
      audience: 'student',
      intent: 'recovery',
      recoverySource: null,
      recoveryFlow: null,
      initialKind: null,
      authorizedKind: 'invite',
    }),
    {
      isInstitutional: true,
      isInviteFlow: true,
    },
  );
});
