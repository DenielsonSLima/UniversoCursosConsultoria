import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cadastro existente exibe caminhos seguros de entrada e recuperação', async () => {
  const [serviceEntry, webPageEntry, webCard, appPage] = await Promise.all([
    readFile(new URL('./aluno-public-auth.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('./AlunoLoginPublicPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./AlunoLoginAuthCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../aluno/login-app/AlunoAppSignupPage.tsx', import.meta.url), 'utf8'),
  ]);
  const service = [
    serviceEntry,
    await readFile(new URL('./aluno-public-auth.contract.ts', import.meta.url), 'utf8'),
    await readFile(new URL('./aluno-public-auth-session.helpers.ts', import.meta.url), 'utf8'),
    await readFile(new URL('./aluno-public-signup.service.ts', import.meta.url), 'utf8'),
  ].join('\n');
  const webPage = [
    webPageEntry,
    await readFile(new URL('./useAlunoLoginPublicPage.ts', import.meta.url), 'utf8'),
  ].join('\n');

  assert.match(service, /Usuário já cadastrado/);
  assert.match(service, /recoverExistingSignup/);
  assert.match(service, /signInWithPassword\(\{[\s\S]*email,[\s\S]*password: data\.password/);
  assert.match(service, /supabase\.auth\.resend\(\{/);
  assert.match(service, /type: 'signup'/);
  assert.match(service, /new PublicAlunoAlreadyRegisteredError\(!resendError\)/);
  assert.match(service, /catch \(finalizeError\)[\s\S]*signOut\(\{ scope: 'local' \}\)[\s\S]*throw finalizeError/);
  assert.doesNotMatch(service, /cpf_already_registered[\s\S]{0,240}signUp/);

  assert.match(webPage, /isPublicAlunoAlreadyRegisteredError\(error\)/);
  assert.match(webPage, /action: existingAccount \? 'existing-account' : undefined/);
  assert.match(webCard, />\s*Entrar\s*<\/button>/);
  assert.match(webCard, />\s*Recuperar senha\s*<\/a>/);

  assert.match(appPage, /isPublicAlunoAlreadyRegisteredError\(error\)/);
  assert.match(appPage, /to="\/aluno\/login-app"/);
  assert.match(appPage, /to="\/aluno\/recuperar-senha-app"/);
});
