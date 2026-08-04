import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [
  migration,
  authService,
  firstAccessPage,
  appSignupPage,
  publicSignupPage,
  publicSignupCard,
  pushDispatcher,
] = await Promise.all([
  readSource('../../../supabase/migrations/20260804203000_separate_relationship_birthday_consent.sql'),
  readSource('./aluno-public-auth.service.ts'),
  readSource('./AlunoFirstAccessPage.tsx'),
  readSource('../../aluno/login-app/AlunoAppSignupPage.tsx'),
  readSource('./AlunoLoginPublicPage.tsx'),
  readSource('./AlunoLoginAuthCard.tsx'),
  readSource('../../../supabase/functions/push-notification-dispatcher/index.ts'),
]);

test('consentimento de relacionamento é separado dos termos e nunca vem pré-marcado', () => {
  assert.match(appSignupPage, /relationshipBirthdayChoice:\s*null/);
  assert.match(publicSignupPage, /useState<boolean \| null>\(null\)/);
  assert.match(appSignupPage, /Sim, quero/);
  assert.match(appSignupPage, /Não quero/);
  assert.match(publicSignupCard, /Não inclui publicidade comercial/);
  assert.match(firstAccessPage, /Escolha opcional e separada/);
  assert.match(firstAccessPage, /não inclui publicidade comercial/i);
  assert.doesNotMatch(firstAccessPage, /relationshipBirthdayChoice[^\n]*useState\(true\)/);
});

test('cadastro preserva a decisão positiva ou negativa durante confirmação de e-mail', () => {
  assert.match(authService, /relationshipBirthdayChoiceMade:\s*true/);
  assert.match(authService, /relationshipBirthdayConsent,/);
  assert.match(authService, /relationshipBirthdayConsentSurface,/);
  assert.match(migration, /after insert on auth\.users/i);
  assert.match(migration, /after insert on public\.parceiros/i);
  assert.match(migration, /on conflict \(aluno_id, canal, finalidade\) do nothing/i);
  assert.match(migration, /case when p_allowed then 'granted' else 'declined' end/i);
});

test('primeiro acesso consulta decided, registra uma vez e mantém termos obrigatórios', () => {
  assert.match(firstAccessPage, /relationshipConsentService\.getPreference\(\)/);
  assert.match(firstAccessPage, /!relationshipPreferenceDecided/);
  assert.match(authService, /relationshipPreferenceDecided = true/);
  assert.match(authService, /'student_first_access'/);
  assert.match(firstAccessPage, /Li e aceito os termos/);
  assert.match(authService, /updates\.aceitou_termos_uso = true/);
});

test('auditoria é append-only para clientes e contém superfície, decisão e ator', () => {
  assert.match(migration, /create table if not exists public\.comunicacao_preferencias_auditoria/i);
  assert.match(migration, /after insert or update on public\.comunicacao_preferencias/i);
  assert.match(migration, /revoke all on public\.comunicacao_preferencias_auditoria[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /'surface', p_surface/);
  assert.match(migration, /'decision', v_decision/);
  assert.match(migration, /'actorAuthUserId'/);
});

test('relacionamento/aniversário não habilita campanha comercial nem profiling', () => {
  assert.match(migration, /check \(finalidade in \('transacional', 'marketing', 'relacionamento'\)\)/);
  assert.match(migration, /finalidade not in \('marketing', 'relacionamento'\)[\s\S]*consentida_em is not null/);
  assert.match(migration, /push-relationship-birthday-v1/);
  assert.match(migration, /'push',\s*'relacionamento',\s*p_allowed/);
  assert.match(migration, /preference\.finalidade = 'relacionamento'/);
  assert.match(migration, /'excludedScopes', jsonb_build_array\('commercial_campaign', 'profiling'\)/);
  assert.match(migration, /push_commercial_marketing_consent_allowed/);
  assert.match(migration, /student\.data_nascimento <= current_date - interval '18 years'/);
  assert.match(migration, /preference\.finalidade = 'marketing'[\s\S]*push-commercial-marketing-v1/);
  assert.match(migration, /push-commercial-marketing-v1/);
  assert.match(migration, /PUSH_COMMERCIAL_MARKETING_CONSENT_REQUIRED/);
  assert.match(migration, /push_notification_resolve_campaign_audience[\s\S]*push_commercial_marketing_consent_allowed/);
});

test('escopos JSON não dependem da ordem e recusam mistura com campanha comercial', () => {
  assert.match(migration, /metadata -> 'consentScopes'\)\s*@> '\["relationship","birthday"\]'::jsonb/);
  assert.match(migration, /not \(\(preference\.metadata -> 'consentScopes'\) \? 'commercial_campaign'\)/);
  assert.match(migration, /metadata -> 'consentScopes'\)\s*@> '\["commercial_campaign"\]'::jsonb/);
});

test('revogação de relacionamento cancela jobs pendentes sem depender do worker', () => {
  assert.match(migration, /create or replace function public\.cancel_push_jobs_after_preference_change\(\)/i);
  assert.match(migration, /v_purpose in \('marketing', 'relacionamento'\)/);
  assert.match(migration, /cancel_invalid_push_notification_jobs\(v_aluno_id, false\)/);
  assert.match(migration, /push_notification_job_block_reason[\s\S]*PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED/);
});

test('dispatcher revalida aniversário e campanha comercial pela decisão canônica do backend', () => {
  assert.match(migration, /push_notification_consent_allowed_deliveries/);
  assert.match(migration, /event', ''\) = 'birthday'[\s\S]*push_relationship_birthday_consent_allowed/);
  assert.match(migration, /job\.category = 'marketing'[\s\S]*push_commercial_marketing_consent_allowed/);
  assert.match(pushDispatcher, /requiredPushConsentPurpose/);
  assert.match(pushDispatcher, /push_notification_consent_allowed_deliveries/);
  assert.match(pushDispatcher, /PUSH_RELATIONSHIP_BIRTHDAY_CONSENT_REQUIRED/);
  assert.match(pushDispatcher, /PUSH_COMMERCIAL_MARKETING_CONSENT_REQUIRED/);
  assert.doesNotMatch(pushDispatcher, /push-marketing-v1/);
});

test('RPC contextual tem assinatura única e superfícies fechadas', () => {
  const declarations = migration.match(/create or replace function public\.aluno_push_relacionamento_preferencia_registrar\s*\(/gi) || [];
  assert.equal(declarations.length, 1);
  assert.match(migration, /p_allowed boolean,\s*p_surface text/);
  assert.match(migration, /INVALID_RELATIONSHIP_PREFERENCE_SURFACE/);
});
