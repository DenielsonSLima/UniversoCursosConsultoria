import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

const [
  mutationsSource,
  activationSource,
  emailStatusSource,
  firstAccessPageSource,
  publicAuthSource,
] = await Promise.all([
  readSource('./hooks/useParceirosMutations.ts'),
  readSource('./portal-activation.service.ts'),
  readSource('./components/cards/EmailConfirmationStatus.tsx'),
  readSource('../../public/login/AlunoFirstAccessPage.tsx'),
  readSource('../../public/login/aluno-public-auth.service.ts'),
]);

test('cadastro pelo gestor deixa termos pendentes e exige senha no primeiro acesso', () => {
  assert.match(mutationsSource, /aceitouTermosUso:\s*false/);
  assert.match(mutationsSource, /aceitouTermosUsoEm:\s*null/);
  assert.match(mutationsSource, /termosUsoVersao:\s*null/);
  assert.match(mutationsSource, /trocaSenhaObrigatoria:\s*true/);
  assert.doesNotMatch(mutationsSource, /aceitouTermosUso:\s*true/);
});

test('gestor não possui ação de confirmação manual de e-mail', () => {
  assert.doesNotMatch(mutationsSource, /confirmEmailMutation/);
  assert.doesNotMatch(activationSource, /confirmPartnerEmail/);
  assert.doesNotMatch(emailStatusSource, /onConfirm/);
  assert.doesNotMatch(emailStatusSource, /<button/);
  assert.match(emailStatusSource, /o aluno deve confirmar pelo e-mail recebido/);
});

test('aluno aceita os termos e cria a própria senha antes de concluir o acesso', () => {
  assert.match(firstAccessPageSource, /Li e aceito os termos/);
  assert.match(firstAccessPageSource, /hasStrongPassword\(newPassword\)/);
  assert.match(firstAccessPageSource, /newPassword === confirmPassword/);
  assert.match(publicAuthSource, /updates\.aceitou_termos_uso = true/);
  assert.match(publicAuthSource, /loginService\.updatePassword\(newPassword\)/);
  assert.doesNotMatch(publicAuthSource, /updates\.troca_senha_obrigatoria = false/);
});

test('somente o backend Auth conclui senha obrigatória e estado ativo', () => {
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_status/);
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_erro/);
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_ativado_em/);
  assert.match(publicAuthSource, /trigger do Auth é a autoridade/);
});
