import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getPortalAccessErrorLog,
  getPortalAccessErrorMessage,
  PORTAL_ACCESS_ERROR_MESSAGE,
} from './institutional-login-error.ts';

const [institutionalLoginSource, publicAlunoAuthSource] = await Promise.all([
  readFile(new URL('./LoginPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../public/login/aluno-public-auth.service.ts', import.meta.url), 'utf8'),
]);

test('oculta detalhes SQL de falha desconhecida do serviço de contexto', () => {
  const error = new Error('column reference "polo_id" is ambiguous') as Error & { code: string };
  error.name = 'PortalContextServiceError';
  error.code = '42702';

  assert.equal(
    getPortalAccessErrorMessage(error, 'Não foi possível autenticar.'),
    PORTAL_ACCESS_ERROR_MESSAGE,
  );
  assert.deepEqual(getPortalAccessErrorLog(error), {
    name: 'PortalContextServiceError',
    code: '42702',
  });
  assert.doesNotMatch(
    JSON.stringify(getPortalAccessErrorLog(error)),
    /polo_id|ambiguous/iu,
  );
});

test('preserva mensagens públicas específicas de outros fluxos', () => {
  const publicMessage = 'Nenhum polo vinculado está disponível para acesso.';
  assert.equal(
    getPortalAccessErrorMessage(new Error(publicMessage), 'Não foi possível autenticar.'),
    publicMessage,
  );
});

test('usa o fallback quando a falha não possui mensagem pública', () => {
  assert.equal(
    getPortalAccessErrorMessage(null, 'Não foi possível autenticar.'),
    'Não foi possível autenticar.',
  );
});

test('aplica a apresentação segura nos logins institucional e público do aluno', () => {
  assert.match(institutionalLoginSource, /getPortalAccessErrorMessage\(/);
  assert.match(institutionalLoginSource, /getPortalAccessErrorLog\(/);
  assert.match(institutionalLoginSource, /new PortalContextServiceError\(polosError\.message, polosError\.code\)/);
  assert.match(publicAlunoAuthSource, /getPublicLoginProfiles[\s\S]*getPortalAccessErrorMessage\(/);
  assert.match(publicAlunoAuthSource, /getPublicLoginProfiles[\s\S]*getPortalAccessErrorLog\(/);
});
