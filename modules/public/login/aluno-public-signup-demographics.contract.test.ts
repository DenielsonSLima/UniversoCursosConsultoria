import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cadastro público exige sexo e raça/cor nos dois canais e registra o contrato no banco', async () => {
  const [serviceEntry, webPageEntry, webCard, appPage, privacyPage, config, migration] = await Promise.all([
    readFile(new URL('./aluno-public-auth.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('./AlunoLoginPublicPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./AlunoLoginAuthCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../aluno/login-app/AlunoAppSignupPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../privacy/PrivacyPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../supabase/config.toml', import.meta.url), 'utf8'),
    readFile(
      new URL('../../../supabase/migrations/20260819120000_require_public_signup_demographics.sql', import.meta.url),
      'utf8',
    ),
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
    await readFile(new URL('./useAlunoSignupForm.ts', import.meta.url), 'utf8'),
  ].join('\n');

  assert.match(service, /PUBLIC_ALUNO_SEXO_OPTIONS/);
  assert.match(service, /NÃO-BINÁRIO/);
  assert.match(service, /PREFIRO NÃO INFORMAR/);
  assert.match(service, /PUBLIC_ALUNO_RACA_COR_OPTIONS/);
  assert.match(service, /INDÍGENA/);
  assert.match(service, /sexo,/);
  assert.match(service, /racaCor,/);
  assert.match(service, /hasConfirmedEmail/);
  assert.match(service, /clearUnconfirmedLocalSession/);
  assert.match(service, /authData\.user && !hasConfirmedEmail\(authData\.user\)/);

  assert.match(webPage, /const \[sexo, setSexo\] = useState\(''\)/);
  assert.match(webPage, /const \[racaCor, setRacaCor\] = useState\(''\)/);
  assert.match(webCard, /name="sexo"/);
  assert.match(webCard, /name="raca-cor"/);
  assert.match(webCard, /Raça\/cor \(autodeclaração\)/);
  assert.match(webCard, /confirme o link enviado para ativá-la/i);

  assert.match(appPage, /sexo: ''/);
  assert.match(appPage, /racaCor: ''/);
  assert.match(appPage, /Selecione uma opção de raça\/cor para continuar/);
  assert.match(appPage, /aluno-app-raca-cor-help/);
  assert.match(appPage, /Você só poderá entrar no aplicativo após essa confirmação/);

  assert.match(privacyPage, /A informação de raça\/cor é dado pessoal sensível/);
  assert.match(privacyPage, /Não são usados para publicidade/);

  assert.match(config, /enable_confirmations = true/);
  assert.match(config, /https:\/\/universocc\.com\.br\/aluno\/confirmacao-email/);
  assert.match(config, /https:\/\/www\.universocc\.com\.br\/aluno\/confirmacao-email/);

  assert.match(migration, /v_sexo text/);
  assert.match(migration, /v_raca_cor text/);
  assert.match(migration, /sync_public_aluno_signup_demographics/);
  assert.match(migration, /trg_sync_public_aluno_auth_profile_zy_demographics/);
  assert.match(migration, /or v_tipo <> 'Aluno'/);
});
