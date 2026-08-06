import assert from 'node:assert/strict';
import {
  getAlunoLogoutPath,
  getAlunoRejectedSessionPath,
} from './aluno-logout-route.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('logout do aluno volta ao início público no navegador', () => {
  assert.equal(getAlunoLogoutPath(false), '/');
});

Deno.test('logout do aluno mantém o login dedicado no aplicativo nativo', () => {
  assert.equal(getAlunoLogoutPath(true), '/aluno/login-app');
});

Deno.test('sessão rejeitada no navegador também volta ao início público', () => {
  assert.equal(getAlunoRejectedSessionPath(false, '/aluno/?module=perfil'), '/');
});

Deno.test('sessão rejeitada no app preserva o retorno para o portal do aluno', () => {
  assert.equal(
    getAlunoRejectedSessionPath(true, '/aluno/?module=perfil'),
    '/aluno/login-app?reason=session_expired&redirect=%2Faluno%2F%3Fmodule%3Dperfil',
  );
});
