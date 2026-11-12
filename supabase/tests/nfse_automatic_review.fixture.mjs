import { readFile } from 'node:fs/promises';
import { installNfseSharedVisibility } from './nfse_fiscal_review_shared.fixture.mjs';
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export const scope = [id(10),id(1),'PRODUCAO','2026-12'];
export const sql = name => readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');
const body = (source,name) => { const start=source.indexOf(`FUNCTION ${name}(`);
  if(start<0)throw Error(name);return `CREATE OR REPLACE ${source.slice(start,source.indexOf('$function$;',start)+12)}`; };
export async function installAutomaticReviewFixture(db) {
  await db.exec(await readFile(new URL('./nfse_academic_queue.fixture.sql',import.meta.url),'utf8'));
  await db.exec(`ALTER TABLE public.matriculas ADD COLUMN data_matricula timestamptz;
    ALTER TABLE public.contas_receber ADD COLUMN parcela_numero integer,ADD COLUMN tipo_lancamento text;
    ALTER TABLE public.parceiros ADD COLUMN status text DEFAULT 'ativo',ADD COLUMN polo_id uuid,ADD COLUMN polo_ids uuid[];
    CREATE TABLE public.documentos_templates(id text PRIMARY KEY,conteudo jsonb);
    CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version integer);
    CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,fingerprint text,not_before timestamptz,expires_at timestamptz);
    CREATE TABLE private.nfse_partner_services(id uuid,polo_id uuid,environment text,service_date date,status text,
      model_id uuid,model_snapshot jsonb,partner_id uuid,amount numeric,service_description text,receivable_id uuid);
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.role',true),'authenticated')$$;
    CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN
      PERFORM private.authorize_nfse_model_scope($1,$2,$3,$4);RETURN $2;END$$;
    INSERT INTO public.documentos_templates VALUES('academicos_config','{"matriculaPrefix":"SYN-","matriculaDigits":4,"yearFormat":"yy","usePoloCode":false}');
    INSERT INTO public.test_context VALUES('${id(10)}','${id(11)}',true,false,ARRAY['${id(1)}'::uuid]);
    INSERT INTO public.polos(id,status,nome,cnpj) VALUES('${id(1)}','ativo','UNIDADE SINTÉTICA','00000000000191');
    INSERT INTO public.cursos VALUES('${id(4)}','CURSO SINTÉTICO','TECNICO');
    INSERT INTO public.turmas VALUES('${id(20)}','${id(1)}','${id(4)}','T-SYN','TURMA SINTÉTICA');
    INSERT INTO public.parceiros(id,nome,tipo,polo_id,cpf_cnpj) VALUES
      ('${id(30)}','ALUNO SINTÉTICO','Aluno','${id(1)}','00000000191'),
      ('${id(31)}','OUTRO ALUNO SINTÉTICO','Aluno','${id(1)}','00000000272');
    INSERT INTO public.matriculas VALUES('${id(40)}','${id(30)}','${id(20)}','2026-02-01Z'),
      ('${id(41)}','${id(31)}','${id(20)}','2026-02-01Z');
    INSERT INTO public.contas_receber(id,polo_id,matricula_id,status,data_pagamento,data_vencimento,valor,valor_pago,descricao,parcela_numero,tipo_lancamento)
      VALUES('${id(200)}','${id(1)}','${id(40)}','PAGO','2026-11-09','2026-09-10',100,100,'FONTE SINTÉTICA',3,'PARCELA'),
      ('${id(201)}','${id(1)}','${id(41)}','PAGO','2026-11-08','2026-09-10',260,260,'FONTE SINTÉTICA',4,'PARCELA');
    SET test.actor='${id(11)}';SET test.role='authenticated';`);
  await installNfseSharedVisibility(db);
  const formatter=await sql('20260621173000_secure_validator_identity_fields.sql');
  await db.exec(formatter.slice(0,formatter.indexOf('CREATE OR REPLACE FUNCTION public.validar_documento_por_codigo')));
  for(const name of ['20261108225453_nfse_models_private_store.sql','20261108225236_nfse_receipt_amount_projection.sql',
    '20261108233250_nfse_model_reference_month.sql','20261109020017_nfse_academic_queue_store.sql',
    '20261109020019_nfse_academic_queue_prepare.sql','20261109020021_nfse_academic_queue_reads.sql',
    '20261110132800_nfse_queue_logical_removal.sql','20261110132801_nfse_queue_realtime.sql',
    '20261110190702_nfse_fiscal_review_store.sql','20261110190706_nfse_fiscal_review_rpc.sql',
    '20261111013732_nfse_academic_description_render.sql','20261111013738_nfse_academic_description_context.sql',
    '20261111013745_nfse_academic_description_prepare.sql','20261111013752_nfse_academic_description_reads.sql',
    '20261111123000_nfse_fiscal_review_payment_dates.sql','20261111001718_nfse_individual_store.sql']) await db.exec(await sql(name));
  await db.exec(body(await sql('20261111121001_nfse_shared_model_consumers.sql'),'private.nfse_fiscal_review_basis'));
  await db.exec(`CREATE TABLE private.nfse_queue_operation_links(source_kind text,source_id uuid,operation_id uuid,
    basis jsonb,basis_fingerprint text,created_at timestamptz DEFAULT now(),PRIMARY KEY(source_kind,source_id));
    CREATE FUNCTION private.resolve_nfse_production_certificate(uuid,text,text DEFAULT NULL) RETURNS private.nfse_certificates
      LANGUAGE sql STABLE AS $$SELECT * FROM private.nfse_certificates WHERE polo_id=$1 AND environment=$2$$;
    CREATE FUNCTION private.resolve_nfse_service_competence(jsonb,timestamptz,text DEFAULT NULL) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$SELECT $3$$;
    INSERT INTO private.nfse_configurations VALUES('${id(1)}','PRODUCAO','${id(1)}',
      '{"municipalityCode":"2803401","municipalRegistration":"","portalAccess":"CERTIFICATE","opSimpNac":"3","regApTribSN":"1","regEspTrib":"0"}',1);
    INSERT INTO private.nfse_certificates VALUES('${id(1)}','PRODUCAO',repeat('a',64),now()-interval '1 day',now()+interval '1 year');`);
  await db.query(`INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
    VALUES($1,$2,'PRODUCAO',$3,$4,$4)`,[id(60),id(1),{name:'MODELO SINTÉTICO',active:true,nationalServiceCode:'080201',
    nbsCode:'122020000',serviceDescription:'SERVIÇOS EDUCACIONAIS',peopleOptions:{version:2,competenceMode:'ISSUE_DATE'}},id(11)]);
  await db.exec(await sql('20261112032026_nfse_automatic_fiscal_review.sql'));
  await db.exec(await sql('20261112032034_nfse_automatic_review_queue_preview.sql'));
}
