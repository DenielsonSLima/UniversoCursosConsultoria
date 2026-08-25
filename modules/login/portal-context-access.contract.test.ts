import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./usePortalContextAccess.ts', import.meta.url), 'utf8');
const accessCore = await readFile(new URL('./portal-context-access.ts', import.meta.url), 'utf8');
const professorPage = await readFile(new URL('../professor/professor.page.tsx', import.meta.url), 'utf8');

test('guarda limita espera nas duas chamadas remotas de autenticação', () => {
  assert.match(accessCore, /PORTAL_ACCESS_TIMEOUT_MS = 8_000/);
  assert.match(accessCore, /withPortalAccessTimeout\(getUser, timeoutMs, signal\)/);
  assert.match(accessCore, /withPortalAccessTimeout\([\s\S]*getProfile\(authResult\.data\.user/);
  assert.match(source, /resolvePortalContextAccess\(\{/);
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

test('falha transitória preserva sessão e cache e oferece retry ao Professor', () => {
  const start = source.indexOf("resolution.status === 'transient-error'");
  const end = source.indexOf('\n\n        const resolved', start);
  const transientSection = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(transientSection, /setConnectionError\(true\)/);
  assert.doesNotMatch(transientSection, /clearPortalSession|queryClient\.clear|loginService\.logout|navigate\(/);
  assert.match(professorPage, /usePortalContextAccess\('Professor'\)/);
  assert.match(professorPage, /connectionError[\s\S]*ProfessorConnectionError onRetry=\{retryAccess\}/);
  assert.doesNotMatch(professorPage, /getPortalSessionFromStorage|getPortalProfile/);
});

test('desmontagem cancela a hidratação antes de qualquer atualização posterior', () => {
  assert.match(source, /controller\.signal\.aborted \|\| resolution\.status === 'cancelled'/);
  assert.match(source, /return \(\) => \{\s*controller\.abort\(\)/);
});

test('falha ao consultar polos do Professor fica fechada com retry e nunca redireciona', () => {
  const absenceGuardStart = professorPage.indexOf('if (isAuthLoading || !profile) return;');
  const absenceGuardEnd = professorPage.indexOf('\n  }, [', absenceGuardStart);
  const absenceGuard = professorPage.slice(absenceGuardStart, absenceGuardEnd);

  assert.match(professorPage, /isError: activePolosError/);
  assert.match(professorPage, /isSuccess: activePolosLoaded/);
  assert.match(professorPage, /isFetchedAfterMount: activePolosFetchedAfterMount/);
  assert.match(professorPage, /\.\.\.professorActivePolosFreshnessOptions/);
  assert.match(professorPage, /activePolosError[\s\S]*ProfessorConnectionError onRetry=\{\(\) => \{ void refetchActivePolos\(\); \}\}/);
  assert.match(absenceGuard, /if \(!activePolosValidated\) return;/);
  assert.ok(
    absenceGuard.indexOf('if (!activePolosValidated) return;')
      < absenceGuard.indexOf("navigate('/sistema/login')"),
    'a ausência de polos só pode redirecionar após sucesso da consulta canônica',
  );
});

test('deep links preservam query e hash nos dois redirecionamentos da guarda', () => {
  const fullDeepLink = /window\.location\.pathname \+ window\.location\.search \+ window\.location\.hash/g;
  assert.equal(source.match(fullDeepLink)?.length, 2);
});

test('shell protegido exige validação da montagem e polo canônico presente', () => {
  assert.match(professorPage, /const activePolosValidated = activePolosLoaded && activePolosFetchedAfterMount/);
  assert.match(professorPage, /resolveProfessorAccessGate\(\{[\s\S]*hasCurrentPolo: Boolean\(currentPolo\)/);
  assert.match(professorPage, /activePolosGate !== 'authorized'[\s\S]*AccessCheckingScreen/);
});
