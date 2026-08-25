import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath: string) => readFile(
  new URL(relativePath, import.meta.url),
  'utf8',
);

const [
  portalSessionSource,
  institutionalLoginSource,
  publicLoginHookSource,
  publicLoginViewSource,
  publicLoginHeroSource,
  publicSessionSource,
  appLoginSource,
  recoverySource,
] = await Promise.all([
  readSource('./portal-session.ts'),
  readSource('./LoginPage.tsx'),
  readSource('../public/login/useAlunoLoginPublicPage.ts'),
  readSource('../public/login/AlunoLoginPublicView.tsx'),
  readSource('../public/login/AlunoLoginHero.tsx'),
  readSource('../public/login/aluno-public-session.service.ts'),
  readSource('../aluno/login-app/AlunoAppLoginPage.tsx'),
  readSource('./password-recovery/usePasswordRecovery.ts'),
]);

const sourceBlock = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `Bloco ${start} ausente.`);
  assert.ok(endIndex > startIndex, `Fim ${end} ausente para ${start}.`);
  return source.slice(startIndex, endIndex);
};

test('separa os perfis públicos dos institucionais sem seletor único', () => {
  const publicProfiles = sourceBlock(
    portalSessionSource,
    'export const getPublicPortalProfiles',
    'export const getPortalSessionFromStorage',
  );
  const institutionalProfiles = sourceBlock(
    portalSessionSource,
    'export const getInstitutionalProfiles',
    'const getLinkedAlunoFailureMessage',
  );

  assert.match(publicProfiles, /\['Aluno', 'Responsavel'\]/);
  assert.doesNotMatch(publicProfiles, /'Gestor'|'Professor'|'Coordenador'/);
  assert.match(institutionalProfiles, /\['Gestor', 'Professor'\]/);
  assert.doesNotMatch(institutionalProfiles, /'Aluno'|'Responsavel'|'Coordenador'/);
});

test('senha e OAuth reutilizam o resolvedor da audiência correspondente', () => {
  assert.match(publicSessionSource, /loginPublicAlunoAndListProfiles[\s\S]*getPublicLoginProfiles\(\)/);
  assert.match(publicSessionSource, /finishPublicAlunoExternalLoginAndListProfiles[\s\S]*getPublicLoginProfiles\(\)/);
  assert.match(publicLoginHookSource, /loginAndListProfiles\(/);
  assert.match(publicLoginHookSource, /finishExternalLoginAndListProfiles\(\)/);
  assert.match(institutionalLoginSource, /resolveInstitutionalAccess\(user\)/);
  assert.match(institutionalLoginSource, /resolveInstitutionalAccess\(session\.user\)/);
  assert.match(appLoginSource, /loginAndListProfiles\(/);
  assert.match(appLoginSource, /finishExternalLoginAndListProfiles\(\)/);
});

test('só abre o seletor com mais de um perfil e mantém erro público visível', () => {
  assert.match(publicLoginHookSource, /if \(profiles\.length === 1\)[\s\S]*finishAuth\(profiles\[0\]\)/);
  assert.match(publicLoginHookSource, /setPublicProfiles\(\[\.\.\.profiles\]\)/);
  assert.match(institutionalLoginSource, /if \(profiles\.length === 1\) return profiles\[0\]/);
  assert.match(institutionalLoginSource, /setLoginStep\('role_select'\)/);
  assert.match(publicLoginViewSource, /hasMultipleProfiles[\s\S]*model\.cardProps\.message/);
  assert.match(publicLoginViewSource, /role=\{model\.cardProps\.message\.tone === 'error' \? 'alert' : 'status'\}/);
});

test('os textos apresentam as duas audiências públicas e apenas os acessos institucionais oferecidos', () => {
  assert.match(publicLoginHeroSource, /Portal do aluno e responsável/);
  assert.match(appLoginSource, /Portal do aluno e responsável/);
  assert.match(appLoginSource, /aria-label="Acesso do aluno e responsável"/);
  assert.match(institutionalLoginSource, /Entre como gestor ou professor para acessar o portal/);
  assert.doesNotMatch(institutionalLoginSource, /Entre como gestor, professor ou coordenador/);
});

test('recuperação retorna à porta de entrada sem inferir pelo primeiro perfil multipapel', () => {
  assert.match(recoverySource, /const postResetPath = loginPath/);
  assert.match(recoverySource, /navigate\(postResetPath\)/);
  assert.doesNotMatch(recoverySource, /getPortalProfile/);
  assert.doesNotMatch(recoverySource, /user_metadata\?\.origem/);
});

test('checkout pode derivar Aluno de um Responsável autenticado', () => {
  const ensureAluno = portalSessionSource.slice(
    portalSessionSource.indexOf('export const ensureLinkedAlunoProfile'),
  );
  assert.match(
    ensureAluno,
    /preferredRole:\s*'Responsavel',[\s\S]*?allowedRoles:\s*\['Responsavel'\]/,
  );
  assert.match(ensureAluno, /responsavel\?\.requiresPasswordReset === false/);
  assert.match(ensureAluno, /rpc\('portal_garantir_perfil_aluno_checkout'/);
});
