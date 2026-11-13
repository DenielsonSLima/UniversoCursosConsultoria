import { readFile } from 'node:fs/promises';
import { prepareServiceReceivables, id } from './nfse_service_receivables.fixture.mjs';
export const workerMigrations = ['20261112221500_nfse_service_bolepix_queue.sql',
  '20261112221600_nfse_service_bolepix_material.sql','20261112221700_nfse_service_bolepix_persistence.sql'];
export async function prepareServiceBolepix(db) {
  await prepareServiceReceivables(db);
  await db.exec(`CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('role',auth.role())$$;
    ALTER TABLE public.usuarios_sistema ADD COLUMN perfil_acesso_id uuid;
    CREATE TABLE public.perfis_acesso(id uuid PRIMARY KEY);
    ALTER TABLE public.polos ADD COLUMN is_matriz boolean DEFAULT false;
    UPDATE public.polos SET is_matriz=true WHERE id='${id(1)}';
    ALTER TABLE public.contas_receber ADD COLUMN gateway_environment text,ADD COLUMN gateway_issuer_polo_id uuid,
      ADD COLUMN gateway_installments integer,ADD COLUMN gateway_creation_token uuid,
      ADD COLUMN gateway_submission_channel text,ADD COLUMN gateway_cnab_file_id uuid,
      ADD COLUMN gateway_boleto_nosso_numero text,ADD COLUMN gateway_boleto_convenio text,
      ADD COLUMN gateway_boleto_agencia text,ADD COLUMN gateway_boleto_linha_digitavel text,
      ADD COLUMN gateway_boleto_codigo_barras text,ADD COLUMN gateway_pix_payload text,
      ADD COLUMN gateway_pix_encoded_image text,ADD COLUMN gateway_synced_at timestamptz,
      ADD COLUMN gateway_last_error text,ADD COLUMN gateway_settlement_recorded_at timestamptz,
      ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE public.payment_gateway_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),receivable_id uuid,
      provider_code text,environment text,payment_method text,origin_polo_id uuid,issuer_polo_id uuid,installments integer,
      remote_payment_id text,remote_status text,amount numeric,bank_slip_digitable_line text,bank_slip_barcode text,
      bank_slip_our_number text,pix_payload text,pix_encoded_image text,raw_payload jsonb,synced_at timestamptz,updated_at timestamptz);
    CREATE TABLE public.payment_gateway_runtime_config(id boolean PRIMARY KEY,enabled boolean,active_environment text);
    INSERT INTO public.payment_gateway_runtime_config VALUES(true,true,'production');
    CREATE TABLE public.payment_gateway_routes(id uuid PRIMARY KEY,modalidade text,payment_method text,environment text,
      enabled boolean,provider_code text,credential_id uuid);
    INSERT INTO public.payment_gateway_routes VALUES('${id(800)}','OUTROS_CREDITOS','BOLETO','production',true,'banese_card','${id(801)}');
    CREATE TABLE public.payment_gateway_credentials(id uuid PRIMARY KEY,provider_code text,environment text,configured boolean,
      client_id_configured boolean,client_secret_configured boolean,metadata jsonb);
    INSERT INTO public.payment_gateway_credentials VALUES('${id(801)}','banese_card','production',true,true,true,'{"bolepixBankManaged":true}');
    CREATE TABLE public.payment_gateway_issuer_config(id integer PRIMARY KEY,issuer_polo_id uuid,active boolean,applies_to_all_polos boolean);
    INSERT INTO public.payment_gateway_issuer_config VALUES(1,'${id(1)}',true,true);`);
  for (const name of workerMigrations) await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20260831174500_claim_banese_api_submission_before_post.sql',import.meta.url),'utf8'));
}
export async function installServiceBolepixScheduler(db) {
  const claims=Buffer.from(JSON.stringify({role:'anon',ref:'kfekgwyqozhicpfuunpo',exp:4_000_000_000})).toString('base64url');
  await db.exec(`CREATE SCHEMA vault;CREATE SCHEMA net;CREATE SCHEMA cron;
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    INSERT INTO vault.decrypted_secrets VALUES('payment_gateway_banese_card_reconciliation_worker_secret',repeat('x',32)),
      ('nfse_reconciliation_gateway_jwt','synthetic.${claims}.synthetic');
    CREATE TABLE net.synthetic_requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint
      LANGUAGE sql AS $$INSERT INTO net.synthetic_requests(url,headers) VALUES($1,$2) RETURNING id$$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS integer LANGUAGE sql AS $$SELECT 1$$;`);
  await db.exec(await readFile(new URL('../migrations/20261112221800_nfse_service_bolepix_scheduler.sql',import.meta.url),'utf8'));
}
