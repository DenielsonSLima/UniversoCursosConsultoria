import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./usePortalContextAccess.ts', import.meta.url), 'utf8');

test('guarda limita espera nas duas chamadas remotas de autenticação', () => {
  assert.match(source, /const AUTH_CHECK_TIMEOUT_MS = 8_000/);
  assert.match(source, /withAuthTimeout\(supabase\.auth\.getUser\(\)\)/);
  assert.match(source, /withAuthTimeout\(getPortalProfile\(\{[\s\S]*authenticatedUser: authData\.user/);
});

test('sessão rejeitada navega antes do sign-out remoto', () => {
  const start = source.indexOf('const redirectToLogin');
  const end = source.indexOf('\n      };', start);
  const redirectSection = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(redirectSection, /clearPortalSession\(\)/);
  assert.match(redirectSection, /navigate\(/);
  assert.match(redirectSection, /void loginService\.logout\(\)/);
  assert.ok(
    redirectSection.indexOf('navigate(') < redirectSection.indexOf('loginService.logout()'),
    'a navegação não pode depender da rede do sign-out',
  );
});
