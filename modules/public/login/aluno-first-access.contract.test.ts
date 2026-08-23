import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [pageSource, webLoginEntry, appLoginSource, alunoPortalHookSource] = await Promise.all([
  readSource('./AlunoFirstAccessPage.tsx'),
  readSource('./AlunoLoginPublicPage.tsx'),
  readSource('../../aluno/login-app/AlunoAppLoginPage.tsx'),
  readSource('../../aluno/hooks/useAlunoPortalProfile.ts'),
]);
const firstAccessServiceSource = await readSource('./aluno-public-first-access.service.ts');
const webLoginSource = [
  webLoginEntry,
  await readSource('./useAlunoLoginPublicPage.ts'),
].join('\n');

test('primeiro acesso usa senha no Auth e aceite atômico no backend', () => {
  const finalizeSection = firstAccessServiceSource.slice(
    firstAccessServiceSource.indexOf('finalizePublicAlunoFirstAccess'),
    firstAccessServiceSource.indexOf('needsPublicAlunoInitialAccess'),
  );

  assert.match(finalizeSection, /supabase\.auth\.updateUser\(\{[\s\S]*password: newPassword/);
  assert.match(finalizeSection, /portal_finalizar_primeiro_acesso|FIRST_ACCESS_RPC/);
  assert.match(finalizeSection, /p_context_id: contextId/);
  assert.match(finalizeSection, /p_request_id: requestId/);
  assert.match(finalizeSection, /p_termos_versao: acceptTermsVersion/);
  assert.match(finalizeSection, /acceptedTermsVersion !== acceptTermsVersion/);
  assert.match(finalizeSection, /profile\.requiresPasswordReset/);
  assert.doesNotMatch(finalizeSection, /\.from\('parceiros'\)/);
  assert.doesNotMatch(finalizeSection, /new Date\(/);
  assert.doesNotMatch(finalizeSection, /loginService\.updatePassword/);
});

test('requestId permanece estável por papel no retry e só é removido após conclusão canônica', () => {
  assert.match(pageSource, /portal_first_access_request_id:\$\{role\}:\$\{contextId\}/);
  assert.match(pageSource, /requestIdRef\.current \|\| getStableFirstAccessRequestId\(role, contextId\)/);
  assert.match(pageSource, /getPortalProfile\(\{[\s\S]*contextId/);
  assert.match(pageSource, /savePortalSession\(updatedProfile\)[\s\S]*sessionStorage\.removeItem/);
});

test('next é limitado ao portal do papel atual e rejeita caminho protocol-relative', () => {
  assert.match(pageSource, /resolveProfilePostLoginRoute\(role, searchParams\.get\('next'\)\)/);
  assert.doesNotMatch(pageSource, /decoded\.startsWith\('\/'\)/);
});

test('seleção web e app transporta contextId opaco até o primeiro acesso', () => {
  assert.match(
    webLoginSource,
    /buildPortalFirstAccessPath\(\s*profile\.tipo,\s*profile\.contextId,\s*redirect,?\s*\)/,
  );
  assert.match(
    appLoginSource,
    /buildPortalFirstAccessPath\(\s*profile\.tipo,\s*profile\.contextId,\s*redirectPath,?\s*\)/,
  );
  assert.match(pageSource, /searchParams\.get\('context'\)/);
});

test('perfil de portal incompleto falha fechado no login e na entrada direta do portal', () => {
  const needsInitialAccessSection = firstAccessServiceSource.slice(
    firstAccessServiceSource.indexOf('needsPublicAlunoInitialAccess'),
  );
  assert.match(needsInitialAccessSection, /requiresPortalFirstAccess\(profile\)/);
  assert.doesNotMatch(needsInitialAccessSection, /hasFirstAccessState/);

  assert.match(alunoPortalHookSource, /portalProfile\.acceptedTermsAt\?\.trim\(\)/);
  assert.match(alunoPortalHookSource, /portalProfile\.requiresPasswordReset === false/);
  assert.match(alunoPortalHookSource, /buildFirstAccessRedirect\(portalProfile\.contextId\)/);
  assert.match(alunoPortalHookSource, /new URLSearchParams\(\{[\s\S]*context: contextId/);
  assert.ok(
    alunoPortalHookSource.indexOf('hasCompletedPasswordReset')
      < alunoPortalHookSource.indexOf('setProfile(portalProfile)'),
    'a pendência precisa ser bloqueada antes de autorizar o perfil no portal',
  );
});

test('Interromper encerra a sessão e volta ao login correto sem abrir o portal', () => {
  const interruptSection = pageSource.slice(
    pageSource.indexOf('const handleInterrupt'),
    pageSource.indexOf('const handleSubmit'),
  );

  assert.match(interruptSection, /queryClient\.clear\(\)/);
  assert.match(interruptSection, /clearPortalSession\(\)/);
  assert.match(interruptSection, /await loginService\.logout\('global'\)/);
  assert.match(interruptSection, /navigate\(loginPath, \{ replace: true \}\)/);
  assert.match(pageSource, /Capacitor\.isNativePlatform\(\)[\s\S]*'\/aluno\/login-app'/);
  assert.match(pageSource, /onClick=\{\(\) => void handleInterrupt\(\)\}/);
  assert.doesNotMatch(pageSource, /<Link to="\/aluno\/"[\s\S]*Interromper/);
});
