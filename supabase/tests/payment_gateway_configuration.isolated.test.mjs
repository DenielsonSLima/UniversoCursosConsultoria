import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Dependência de QA instalada fora do projeto; nunca conecta ao Supabase/Banese.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const db = new PGlite();
const migrationsDir = new URL('../migrations/', import.meta.url);
const migrationSource = async (suffix) => {
  const matches = (await readdir(migrationsDir)).filter((name) => name.endsWith(suffix));
  assert.equal(matches.length, 1, `migration única: ${suffix}`);
  return readFile(new URL(matches[0], migrationsDir), 'utf8');
};
const RECEIVABLE = '10000000-0000-4000-8000-000000000001';
const TOKEN = '20000000-0000-4000-8000-000000000002';
const CREDENTIAL = '30000000-0000-4000-8000-000000000003';
const CONFIG_TABLES = ['payment_gateway_runtime_config', 'payment_gateway_routes', 'payment_gateway_credentials', 'payment_gateway_issuer_config'];

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA private;
  CREATE TABLE public.payment_gateway_runtime_config(id boolean PRIMARY KEY, enabled boolean, active_environment text);
  CREATE TABLE public.payment_gateway_credentials(id uuid PRIMARY KEY, provider_code text, environment text,
    client_id_configured boolean, client_secret_configured boolean);
  CREATE TABLE public.payment_gateway_routes(id integer PRIMARY KEY, modalidade text, payment_method text,
    environment text, provider_code text, credential_id uuid, enabled boolean,
    UNIQUE(modalidade,payment_method,environment));
  CREATE TABLE public.payment_gateway_issuer_config(id integer PRIMARY KEY, issuer_polo_id uuid, active boolean);
  CREATE TABLE public.payment_gateway_transactions(id integer PRIMARY KEY, receivable_id uuid);
  CREATE TABLE public.contas_receber(
    id uuid PRIMARY KEY, tipo_lancamento text, status text, valor numeric, data_vencimento date,
    gateway_provider text, gateway_environment text, gateway_payment_method text, gateway_status text,
    gateway_creation_token uuid, gateway_submission_channel text, gateway_submission_status text,
    gateway_payment_id text, gateway_payment_link_id text, gateway_cnab_file_id uuid,
    gateway_boleto_convenio text, gateway_boleto_agencia text, gateway_boleto_nosso_numero text,
    gateway_boleto_codigo_barras text, gateway_boleto_linha_digitavel text,
    gateway_pix_payload text, gateway_pix_encoded_image text, gateway_boleto_issued_at timestamptz,
    gateway_financial_terms_confirmed_at timestamptz, gateway_settlement_recorded_at timestamptz,
    data_pagamento date, valor_pago numeric, updated_at timestamptz);
  CREATE PUBLICATION supabase_realtime FOR TABLE public.payment_gateway_runtime_config;
`);

const reset = async () => db.exec(`
  TRUNCATE public.contas_receber, public.payment_gateway_transactions,
    public.payment_gateway_runtime_config, public.payment_gateway_routes,
    public.payment_gateway_credentials, public.payment_gateway_issuer_config;
  INSERT INTO public.payment_gateway_runtime_config VALUES (true,true,'production');
  INSERT INTO public.payment_gateway_credentials VALUES ('${CREDENTIAL}','banese_card','production',true,true);
  INSERT INTO public.payment_gateway_routes VALUES (1,'TECNICO','BOLETO','production','banese_card','${CREDENTIAL}',true);
  INSERT INTO public.payment_gateway_issuer_config VALUES (1,'40000000-0000-4000-8000-000000000004',true);
  INSERT INTO public.contas_receber(id,tipo_lancamento,status,valor,data_vencimento,gateway_provider,
    gateway_environment,gateway_payment_method)
  VALUES ('${RECEIVABLE}','DEPENDENCIA','PENDENTE',100,'2026-12-10','banese_card','production','BOLETO');
`);
const configurationSnapshot = async () => {
  const snapshot = {};
  for (const table of CONFIG_TABLES) snapshot[table] = (await db.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  return snapshot;
};
await reset();
const beforeMigrations = await configurationSnapshot();
const guardSql = await migrationSource('_guard_dependency_banese_creation_configuration.sql');
const realtimeSql = await migrationSource('_publish_payment_gateway_configuration_realtime.sql');
await db.exec(guardSql);
await db.exec(realtimeSql);
// Executa o claim real, e não uma implementação fictícia do protocolo do adapter.
await db.exec(await migrationSource('_claim_banese_api_submission_before_post.sql'));
const afterMigrations = await configurationSnapshot();
beforeEach(reset);
after(() => db.close());

const row = async () => (await db.query('SELECT * FROM public.contas_receber WHERE id=$1', [RECEIVABLE])).rows[0];
const start = async () => db.query("UPDATE public.contas_receber SET gateway_status='CREATING',gateway_creation_token=$1 WHERE id=$2", [TOKEN, RECEIVABLE]);
const reserve = async () => db.query("UPDATE public.contas_receber SET gateway_boleto_convenio='fixture',gateway_boleto_agencia='033',gateway_boleto_nosso_numero='123456789' WHERE id=$1", [RECEIVABLE]);
const claim = async () => db.query(`SELECT public.claim_banese_api_submission_attempt(
  $1,'production','12345','033','123456789',100,'2026-12-10',$2) AS allowed`, [RECEIVABLE, TOKEN]);
const prepare = async () => {
  await start(); await reserve();
  await db.query("UPDATE public.contas_receber SET gateway_boleto_convenio='12345' WHERE id=$1", [RECEIVABLE]);
};

test('migrations preservam configuração e publicação é idempotente sem ampliar grants', async () => {
  assert.deepEqual(afterMigrations, beforeMigrations);
  await db.exec(realtimeSql);
  const tables = (await db.query("SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY tablename")).rows.map((item) => item.tablename);
  assert.deepEqual(tables, [...CONFIG_TABLES].sort());
  const result = await db.query(`SELECT has_function_privilege('anon','private.guard_dependency_banese_creation_configuration()','EXECUTE') AS anon,
    has_function_privilege('authenticated','private.guard_dependency_banese_creation_configuration()','EXECUTE') AS authenticated`);
  assert.deepEqual(result.rows[0], { anon: false, authenticated: false });
});

test('integração desligada impede claim inicial sem reservar identidade ou chamar POST', async () => {
  await db.exec('UPDATE public.payment_gateway_runtime_config SET enabled=false');
  let bankPosts = 0;
  await assert.rejects(async () => { await start(); bankPosts += 1; }, /DEPENDENCY_BANK_RUNTIME_UNAVAILABLE/);
  assert.equal(bankPosts, 0);
  const current = await row();
  assert.equal(current.gateway_creation_token, null);
  assert.equal(current.gateway_boleto_nosso_numero, null);
});

for (const [name, mutation, expected] of [
  ['desligamento', 'UPDATE public.payment_gateway_runtime_config SET enabled=false', /RUNTIME_UNAVAILABLE/],
  ['troca de ambiente', "UPDATE public.payment_gateway_runtime_config SET active_environment='sandbox'", /RUNTIME_UNAVAILABLE/],
  ['rota desativada', 'UPDATE public.payment_gateway_routes SET enabled=false', /ROUTE_UNAVAILABLE/],
  ['credencial de outro ambiente', "UPDATE public.payment_gateway_credentials SET environment='sandbox'", /CREDENTIAL_UNAVAILABLE/],
  ['credencial incompleta', 'UPDATE public.payment_gateway_credentials SET client_secret_configured=false', /CREDENTIAL_UNAVAILABLE/],
]) {
  test(`mudança após reserva bloqueia primeiro POST: ${name}`, async () => {
    await prepare();
    await db.exec(mutation);
    let bankPosts = 0;
    await assert.rejects(async () => { await claim(); bankPosts += 1; }, expected);
    assert.equal(bankPosts, 0);
    const current = await row();
    assert.equal(current.gateway_environment, 'production');
    assert.equal(current.gateway_status, 'CREATING');
    assert.equal(current.gateway_creation_token, TOKEN);
    assert.equal(current.gateway_boleto_nosso_numero, '123456789');
    assert.equal(current.gateway_submission_status, null);
  });
}

test('claim válido autoriza um POST fictício e replay não autoriza segundo POST', async () => {
  await prepare();
  let bankPosts = 0;
  const emit = async () => {
    const result = await claim();
    assert.equal(result.rows[0].allowed, true);
    bankPosts += 1;
  };
  await emit();
  await assert.rejects(emit, /Recebivel Banese mudou/);
  assert.equal(bankPosts, 1);
  assert.equal((await row()).gateway_submission_status, 'API_AMBIGUOUS');
});

test('reuso e persistência GET de título antigo funcionam desligados sem trocar ambiente', async () => {
  await prepare();
  await db.exec("UPDATE public.payment_gateway_runtime_config SET enabled=false,active_environment='sandbox'");
  // GET recuperou a reserva anterior: não há nova intenção de POST.
  await db.query(`UPDATE public.contas_receber SET gateway_payment_id='existing-fixture',gateway_status='PENDING',
    gateway_submission_channel='API',gateway_submission_status='API_REGISTERED',gateway_creation_token=NULL WHERE id=$1`, [RECEIVABLE]);
  const current = await row();
  assert.equal(current.gateway_payment_id, 'existing-fixture');
  assert.equal(current.gateway_environment, 'production');
  assert.equal(current.gateway_submission_status, 'API_REGISTERED');
  assert.equal(current.gateway_creation_token, null);
});

test('retorno de emissão em curso continua persistível após desligamento', async () => {
  await prepare(); await claim();
  await db.exec('UPDATE public.payment_gateway_runtime_config SET enabled=false');
  await db.query(`UPDATE public.contas_receber SET gateway_payment_id='accepted-fixture',gateway_status='PENDING',
    gateway_submission_status='API_REGISTERED',gateway_creation_token=NULL WHERE id=$1`, [RECEIVABLE]);
  assert.equal((await row()).gateway_payment_id, 'accepted-fixture');
});

test('marcador ambíguo conservador não cria outra intenção e demais modalidades ficam fora do escopo', async () => {
  await prepare(); await claim();
  await db.exec('UPDATE public.payment_gateway_runtime_config SET enabled=false');
  await db.query("UPDATE public.contas_receber SET gateway_submission_status='API_AMBIGUOUS' WHERE id=$1", [RECEIVABLE]);
  assert.equal((await row()).gateway_submission_status, 'API_AMBIGUOUS');
  await reset();
  await db.exec("UPDATE public.contas_receber SET tipo_lancamento='MATRICULA'; UPDATE public.payment_gateway_runtime_config SET enabled=false");
  await prepare();
  assert.equal((await claim()).rows[0].allowed, true);
});
