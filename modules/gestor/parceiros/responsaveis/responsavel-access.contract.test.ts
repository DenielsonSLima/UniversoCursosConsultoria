import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [serviceSource, hookSource, cardSource, recoveryEntry, appSource] = await Promise.all([
  readFile(new URL('./responsavel-access.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./hooks/useResponsavelAccess.ts', import.meta.url), 'utf8'),
  readFile(new URL('./components/ResponsavelAccessCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../../login/PasswordRecoveryPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../../../App.tsx', import.meta.url), 'utf8'),
]);
const recoverySource = [
  recoveryEntry,
  await readFile(
    new URL('../../../login/password-recovery/usePasswordRecovery.ts', import.meta.url),
    'utf8',
  ),
].join('\n');

test('cliente usa somente as ações canônicas do acesso do Responsável', () => {
  for (const action of [
    'list-responsavel-access-statuses',
    'ensure-responsavel-access',
    'resend-responsavel-access',
    'confirm-responsavel-email',
    'issue-responsavel-temporary-password',
  ]) {
    assert.match(serviceSource, new RegExp(`action: '${action}'`));
  }
  assert.match(serviceSource, /responsavelLegalIds: \[\.\.\.new Set\(responsavelLegalIds\)\]/);
  assert.match(serviceSource, /emailValidatedByManager: true/);
  assert.match(serviceSource, /requireResponsavelRequestId\(requestId\)/);
});

test('status parcial preserva booleanos desconhecidos e bloqueia ações sensíveis', () => {
  assert.match(serviceSource, /const optionalBoolean/);
  assert.match(serviceSource, /firstAccessPending: optionalBoolean\(source\.firstAccessPending\)/);
  assert.match(serviceSource, /temporaryPasswordAllowed: optionalBoolean\(source\.temporaryPasswordAllowed\)/);
  assert.doesNotMatch(serviceSource, /requiresPasswordChange \|\| !termsAccepted/);
  assert.match(cardSource, /firstAccessPending === true/);
  assert.match(cardSource, /status\?\.temporaryPasswordAllowed === true/);
  assert.match(cardSource, /identidade também possui outro perfil/);
  assert.match(cardSource, /disponibilidade da senha temporária não foi confirmada/);
});

test('senha temporária permanece efêmera e nunca entra no cache do TanStack Query', () => {
  assert.match(hookSource, /useState\(''\)/);
  assert.match(hookSource, /emitirSenhaTemporaria\(responsavelLegalId\)/);
  assert.doesNotMatch(hookSource, /useMutation\([\s\S]{0,300}emitirSenhaTemporaria/);
  assert.doesNotMatch(hookSource, /setQueryData[\s\S]{0,300}temporaryPassword/);
  assert.match(cardSource, /Fechar e apagar da tela/);
  assert.match(cardSource, /Exiba e entregue uma única vez/);
});

test('mutations invalidam somente a árvore de queries dos responsáveis', () => {
  assert.match(hookSource, /responsaveisLegaisQueryKeys\.polo\(scope\.poloId\)/);
  assert.doesNotMatch(hookSource, /queryKey: \['parceiros'\]/);
  assert.doesNotMatch(hookSource, /queryClient\.clear/);
});

test('reenvio reutiliza o mesmo requestId até a finalização canônica', () => {
  assert.match(serviceSource, /requestFinalized: source\.requestFinalized === true/);
  assert.match(
    hookSource,
    /getStableRequestId\(requestIdsRef\.current, fingerprint\)/,
  );
  assert.match(
    hookSource,
    /if \(result\.requestFinalized === true\) \{\s*requestIdsRef\.current\.delete\(fingerprint\);\s*\}/,
  );
  assert.doesNotMatch(
    hookSource,
    /if \(result\.recoveryEmailSent === true\)[\s\S]{0,100}delete\(fingerprint\)/,
  );
});

test('ações de identidade ficam restritas ao Gestor global/Matriz', () => {
  assert.match(cardSource, /const canManageAccess = responsavel\.canManageGlobal/);
  assert.match(cardSource, /canManageAccess && responsavel\.eligible/);
  assert.match(cardSource, /Somente um Gestor global\/Matriz/);
  assert.match(cardSource, /if \(!canManageAccess\) return/);
  assert.match(cardSource, /useResponsavelAccess\(responsavel\.id, scope, canManageAccess\)/);
  assert.match(hookSource, /enabled: Boolean\(responsavelLegalId && enabled\)/);
});

test('Responsável recupera a senha no login público e possui rota própria de primeiro acesso', () => {
  assert.match(recoverySource, /const isResponsavelRecovery = recoverySource === 'responsavel'/);
  assert.match(recoverySource, /postResetPath = isResponsavelRecovery \? '\/login' : loginPath/);
  assert.match(recoverySource, /if \(!isResponsavelRecovery\) \{[\s\S]{0,200}getPortalProfile/);
  assert.match(recoverySource, /'\/recuperar-senha\?source=responsavel'/);
  assert.match(appSource, /path="\/responsavel\/primeiro-acesso"/);
});
