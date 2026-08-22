import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [contractSource, serviceSource, sessionSource, publicAuthSource] = await Promise.all([
  readSource('./portal-context.contract.ts'),
  readSource('./portal-context.service.ts'),
  readSource('./portal-session.ts'),
  readSource('../public/login/aluno-public-auth.service.ts'),
]);

test('preserva o primeiro acesso pendente dos perfis públicos no perfil escolhido', () => {
  assert.match(contractSource, /interface PortalFirstAccess[\s\S]*acceptedTermsAt: string \| null[\s\S]*acceptedTermsVersion: string \| null[\s\S]*requiresPasswordReset: boolean/);
  assert.match(contractSource, /firstAccess: PortalFirstAccess \| null/);
  assert.match(serviceSource, /role !== 'Aluno' && role !== 'Responsavel'/);
  assert.match(serviceSource, /acceptedTermsAt: nullableString\(source\.acceptedTermsAt, 'firstAccess\.acceptedTermsAt'\)/);
  assert.match(serviceSource, /acceptedTermsVersion: nullableString\(source\.acceptedTermsVersion, 'firstAccess\.acceptedTermsVersion'\)/);
  assert.match(serviceSource, /requiresPasswordReset: requiredBoolean\(source\.requiresPasswordReset, 'firstAccess\.requiresPasswordReset'\)/);
  assert.match(sessionSource, /acceptedTermsAt: context\.firstAccess\.acceptedTermsAt/);
  assert.match(sessionSource, /acceptedTermsVersion: context\.firstAccess\.acceptedTermsVersion/);
  assert.match(sessionSource, /requiresPasswordReset: context\.firstAccess\.requiresPasswordReset/);
  assert.match(publicAuthSource, /requiresPortalFirstAccess\(profile\)/);
});

test('atribui primeiro acesso ao Responsável e mantém perfis institucionais sem esse estado', () => {
  assert.match(serviceSource, /if \(role !== 'Aluno' && role !== 'Responsavel'\) \{[\s\S]*if \(value !== null\)[\s\S]*return null/);
  assert.match(sessionSource, /\.\.\.\(context\.firstAccess \? \{/);
  assert.match(publicAuthSource, /requiresPortalFirstAccess\(profile\)/);
});

test('portal_listar_perfis é a única autoridade de perfis e o contextId é apenas uma dica validada', () => {
  const profileResolver = sessionSource.slice(
    sessionSource.indexOf('export const getPortalProfile'),
    sessionSource.indexOf('export const getInstitutionalProfiles'),
  );

  assert.match(profileResolver, /getContextProfiles\(authenticatedUser, options\.allowedRoles\)/);
  assert.match(profileResolver, /profile\.contextId === requestedContextId/);
  assert.match(profileResolver, /if \(options\.contextId\) return null/);
  assert.doesNotMatch(profileResolver, /\.from\(/);
  assert.doesNotMatch(profileResolver, /new Date\(/);
  assert.doesNotMatch(sessionSource, /isPortalContextRpcUnavailable/);
});

test('permissões do Gestor vêm do scope canônico e falham sem acesso implícito', () => {
  assert.match(sessionSource, /kind === 'GESTOR_PERMISSIONS'/);
  assert.match(sessionSource, /normalizeGestorPermissions\(permissionScope\?\.permissions, \{[\s\S]*fallbackFullAccess: false/);
  assert.match(sessionSource, /allPolos: context\.allPolos && normalized\.allPolos/);
});
