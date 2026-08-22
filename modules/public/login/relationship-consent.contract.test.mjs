import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [
  originalMigration,
  termsDefaultMigration,
  termsDefaultHardeningMigration,
  authServiceEntry,
  firstAccessPage,
  appSignupPage,
  publicSignupPageEntry,
  publicSignupCard,
  notificationPage,
  termsPage,
  preferenceService,
  pushDispatcher,
] = await Promise.all([
  readSource('../../../supabase/migrations/20260804203000_separate_relationship_birthday_consent.sql'),
  readSource('../../../supabase/migrations/20260805180441_enable_relationship_birthday_by_terms.sql'),
  readSource('../../../supabase/migrations/20260805181400_require_current_terms_for_relationship_default.sql'),
  readSource('./aluno-public-auth.service.ts'),
  readSource('./AlunoFirstAccessPage.tsx'),
  readSource('../../aluno/login-app/AlunoAppSignupPage.tsx'),
  readSource('./AlunoLoginPublicPage.tsx'),
  readSource('./AlunoLoginAuthCard.tsx'),
  readSource('../../aluno/notificacoes/NotificacoesPage.tsx'),
  readSource('../terms/TermsPage.tsx'),
  readSource('./relationship-consent.service.ts'),
  readSource('../../../supabase/functions/push-notification-dispatcher/index.ts'),
]);

const authService = [
  authServiceEntry,
  await readSource('./aluno-public-auth.contract.ts'),
  await readSource('./aluno-public-signup.service.ts'),
].join('\n');
const publicSignupPage = [
  publicSignupPageEntry,
  await readSource('./useAlunoLoginPublicPage.ts'),
  await readSource('./useAlunoSignupForm.ts'),
  await readSource('./AlunoLoginPublicView.tsx'),
].join('\n');

test('cadastro remove a escolha opcional e informa o padrão nos Termos', () => {
  for (const source of [appSignupPage, publicSignupPage, publicSignupCard, firstAccessPage]) {
    assert.doesNotMatch(source, /Sim, quero/);
    assert.doesNotMatch(source, /Não quero/);
    assert.doesNotMatch(source, /OPCIONAL:\s*RELACIONAMENTO/i);
    assert.doesNotMatch(source, /relationshipBirthdayChoice:\s*null/);
  }
  assert.match(publicSignupCard, /ficam ativas por padrão/);
  assert.match(appSignupPage, /ficam ativas por padrão/);
  assert.match(firstAccessPage, /ficam ativas por padrão/);
  assert.match(termsPage, /legítimo interesse/);
  assert.match(termsPage, /não autoriza publicidade comercial/i);
});

test('metadados do cadastro registram apenas relacionamento não comercial', () => {
  assert.match(authService, /relationshipBirthdayDefaultEnabled:\s*true/);
  assert.match(authService, /relationshipBirthdayLegalBasis:\s*RELATIONSHIP_BIRTHDAY_LEGAL_BASIS/);
  assert.match(authService, /relationshipBirthdayActivationReason:\s*'terms_acceptance'/);
  assert.match(authService, /relationshipBirthdayIncludesCommercialAdvertising:\s*false/);
  assert.doesNotMatch(authService, /relationshipBirthdayChoiceMade:\s*true/);
  assert.doesNotMatch(authService, /relationshipBirthdayConsent,/);
});

test('backend cria o padrão somente após Termos e preserva opt-out anterior', () => {
  assert.match(termsDefaultMigration, /relationshipBirthdayDefaultEnabled/);
  assert.match(termsDefaultMigration, /acceptedTerms/);
  assert.match(termsDefaultMigration, /student\.aceitou_termos_uso_em is not null/);
  assert.match(termsDefaultMigration, /'legitimo_interesse'/);
  assert.match(termsDefaultMigration, /push-relationship-birthday-legitimate-interest-v2/);
  assert.match(termsDefaultMigration, /on conflict \(aluno_id, canal, finalidade\) do nothing/i);
  assert.match(termsDefaultMigration, /excludedScopes.*commercial_campaign.*profiling/s);
  assert.match(termsDefaultMigration, /aluno_push_relacionamento_preferencia_ativar_por_termos/);
  assert.match(termsDefaultHardeningMigration, /student\.termos_uso_versao = '2026-08-05'/);
  assert.match(termsDefaultHardeningMigration, /CURRENT_TERMS_ACCEPTANCE_REQUIRED/);
  assert.match(termsDefaultHardeningMigration, /parceiros_capture_current_terms_relationship_default/);
  assert.match(preferenceService, /preferencia_ativar_por_termos/);
});

test('aluno pode desativar e reativar sem perder o acesso', () => {
  assert.match(notificationPage, /'Desativar'\s*:\s*'Ativar'/);
  assert.match(notificationPage, /Isso não altera seu acesso/);
  assert.match(notificationPage, /Não incluem publicidade comercial ou perfilamento/);
  assert.match(termsDefaultMigration, /student_notification_preferences/);
  assert.match(termsDefaultMigration, /case when p_allowed then null else v_now end/);
});

test('clientes antigos continuam compatíveis sem reativar decisão existente', () => {
  assert.match(termsDefaultMigration, /relationshipBirthdayChoiceMade/);
  assert.match(termsDefaultMigration, /capture_initial_relationship_preference/);
  assert.match(termsDefaultMigration, /push-relationship-birthday-v1/);
  assert.match(termsDefaultMigration, /politica_versao in/);
  assert.match(originalMigration, /on conflict \(aluno_id, canal, finalidade\) do nothing/i);
});

test('entrega revalida a preferência canônica no backend', () => {
  assert.match(termsDefaultMigration, /push_relationship_birthday_consent_allowed/);
  assert.match(termsDefaultMigration, /preference\.finalidade = 'relacionamento'/);
  assert.match(termsDefaultMigration, /not \(\(preference\.metadata -> 'consentScopes'\) \? 'commercial_campaign'\)/);
  assert.match(pushDispatcher, /requiredPushConsentPurpose/);
  assert.match(pushDispatcher, /push_notification_consent_allowed_deliveries/);
  assert.match(pushDispatcher, /PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED/);
});

test('RPCs e funções privadas mantêm privilégios mínimos', () => {
  assert.match(termsDefaultMigration, /revoke all on function comunicacao_private\.ensure_relationship_birthday_terms_default[\s\S]*from public, anon, authenticated/);
  assert.match(termsDefaultMigration, /grant execute on function public\.aluno_push_relacionamento_preferencia_ativar_por_termos\(text\)[\s\S]*to authenticated/);
  assert.match(termsDefaultMigration, /grant execute on function public\.push_relationship_birthday_consent_allowed\(uuid\)[\s\S]*to service_role/);
});
