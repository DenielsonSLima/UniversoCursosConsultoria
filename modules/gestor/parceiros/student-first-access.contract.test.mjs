import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

const [
  mutationsSource,
  activationSource,
  emailStatusSource,
  partnerAccessSource,
  firstAccessPageSource,
  publicAuthSource,
] = await Promise.all([
  readSource('./hooks/useParceirosMutations.ts'),
  readSource('./portal-activation.service.ts'),
  readSource('./components/cards/EmailConfirmationStatus.tsx'),
  readSource('./components/viewparceiros/shared/ParceiroAcesso.tsx'),
  readSource('../../public/login/AlunoFirstAccessPage.tsx'),
  readSource('../../public/login/aluno-public-auth.service.ts'),
]);

test('cadastro pelo gestor deixa termos e acesso sob autoridade do convite e primeiro acesso', () => {
  for (const field of [
    'trocaSenhaObrigatoria',
    'acessoStatus',
    'conviteEnviadoEm',
    'aceitouTermosUso',
    'aceitouTermosUsoEm',
    'termosUsoVersao',
  ]) {
    assert.match(mutationsSource, new RegExp(`'${field}'`));
  }
  assert.match(mutationsSource, /delete alunoData\[field\]/);
  assert.match(mutationsSource, /return parceirosService\.create\(\{ \.\.\.alunoData, tipo: 'Aluno' \}\)/);
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
  assert.match(publicAuthSource, /supabase\.auth\.updateUser\(\{\s*password: newPassword,/);
  assert.match(publicAuthSource, /p_aceitar_termos:\s*true/);
  assert.match(publicAuthSource, /!profile\.acceptedTermsAt/);
  assert.doesNotMatch(publicAuthSource, /loginService\.updatePassword\(newPassword\)/);
  assert.doesNotMatch(publicAuthSource, /updates\.troca_senha_obrigatoria/);
});

test('a finalização passa pelo Auth e RPC sem concluir estado no cliente', () => {
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_status/);
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_erro/);
  assert.doesNotMatch(publicAuthSource, /updates\.acesso_ativado_em/);
  assert.match(publicAuthSource, /const FIRST_ACCESS_RPC = 'portal_finalizar_primeiro_acesso'/);
  assert.match(publicAuthSource, /await \(supabase\.rpc as any\)\(FIRST_ACCESS_RPC/);
  assert.match(publicAuthSource, /const profile = await getPortalProfile\(\{/);
});

test('reenvio pendente volta ao primeiro acesso e recuperação fica restrita a conta ativa', () => {
  assert.match(partnerAccessSource, /const needsFirstAccess = tipo === 'Aluno' && acessoStatus !== 'ativo'/);
  assert.match(partnerAccessSource, /needsFirstAccess \? '\/login' : '\/recuperar-senha'/);
  assert.match(partnerAccessSource, /Reenviar primeiro acesso/);
  assert.match(partnerAccessSource, /Enviar recuperação de senha/);
  assert.match(partnerAccessSource, /criar a primeira senha e aceitar os termos/);
});
