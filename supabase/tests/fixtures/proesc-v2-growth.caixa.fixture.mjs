import { readFileSync } from 'node:fs';

// Only the two functions captured from the read-only catalog are production code.
// Position rows and auth helper decisions below are synthetic dependency boundaries.
export async function installCaixaFixture(fixture) {
  const {db,id,actor,revision,enrollment,classId,person}=fixture;
  await db.exec(`
    CREATE SCHEMA internal_contas; CREATE SCHEMA auth;
    CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,matricula_acesso text);
    ALTER TABLE public.turmas ADD COLUMN nome text;
    CREATE TABLE internal_contas.synthetic_position_rows(
      polo_id uuid,id uuid,due_date date,principal numeric,source_system text,source_key text,
      observed_at timestamptz,reason_code text,snapshot_id uuid,in_month boolean,
      monthly_position text,portfolio_position text);
    CREATE FUNCTION internal_contas.caixa_receivables_position_rows(uuid,date,date)
      RETURNS SETOF internal_contas.synthetic_position_rows LANGUAGE sql STABLE AS $$
      SELECT * FROM internal_contas.synthetic_position_rows WHERE $1 IS NULL OR polo_id=$1 $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE FUNCTION internal_contas.synthetic_permissions() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('fixture.caixa_permissions',true),''),'{}')::jsonb $$;
    CREATE FUNCTION public.is_gestor() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT (internal_contas.synthetic_permissions()->>'gestor')::boolean $$;
    CREATE FUNCTION public.gestor_has_any_global_module(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT (internal_contas.synthetic_permissions()->'globalModules') ?| $1 $$;
    CREATE FUNCTION public.gestor_has_any_module_for_polo(text[],uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT (internal_contas.synthetic_permissions()->'modules') ?| $1
        AND (internal_contas.synthetic_permissions()->'polos') ? $2::text $$;
    CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT (internal_contas.synthetic_permissions()->'tabs') ? $1 $$;
    INSERT INTO public.parceiros VALUES('${person}','Pessoa sintética','MAT-SINTETICA');
    UPDATE public.turmas SET nome='Turma sintética',codigo='SINTETICA';
  `);
  for(let n=1;n<=5;n++) {
    await db.query(`INSERT INTO public.contas_receber(id,matricula_id,turma_id,cliente_id)
      VALUES($1,$2,$3,$4)`,[id(700+n),enrollment,classId,person]);
    await db.query(`INSERT INTO internal_proesc.obligation_links(id,matricula_id,turma_id,receivable_id,
      source_unit_id,source_class_id,source_key,auto_enabled) VALUES($1,$2,$3,$4,'3145','123',$5,true)`,
      [id(400+n),enrollment,classId,id(700+n),String(900+n)]);
    await db.query(`INSERT INTO internal_proesc.financial_snapshots(id,link_id,observed_at,principal_cents,
      source_status,verification,evidence_kind) VALUES($1,$2,'2026-09-08',1000,'UNKNOWN','REVIEW','API_V2_INVOICE_REVIEW')`,
      [id(500+n),id(400+n)]);
    await db.query(`INSERT INTO internal_contas.synthetic_position_rows VALUES($1,$2,$3,$4,'PROESC',$5,
      '2026-09-08',$6,$7,$8,$9,$9)`,[id(90),id(700+n),`2026-09-0${n}`,n*10,String(900+n),
      n===4?'SOURCE_NO_PAYMENT_CONFIRMATION':'V2_PAYMENT_STATUS_REVIEW',id(500+n),n!==4,n===5?'OPEN':'REVIEW']);
  }
  const samples=[
    [1,'901',501,'PAGAMENTO SUPERIOR','2026-09-08','2026-09-08'],
    [2,'901',501,'PAGAMENTO PARCIAL','2026-09-08','2026-09-08'],
    [3,'901',501,'PAGAMENTO SUPERIOR','2026-09-07','2026-09-09'],
    [4,'902',502,'PAGAMENTO SUPERIOR','2026-09-08','2026-09-08'],
    [5,'999',501,'PAGAMENTO SUPERIOR','2026-09-09','2026-09-09'],
    [6,'901',504,'PAGAMENTO SUPERIOR','2026-09-09','2026-09-09'],
  ];
  for(const [n,invoice,snapshot,status,observed,recorded] of samples) {
    await db.query(`INSERT INTO internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,finished_at)
      VALUES($1,$2,$3,'RECENT','COMPLETE','2026-09-09')`,[id(800+n),actor,revision]);
    await db.query(`INSERT INTO internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month)
      VALUES($1,$2,'invoices','3145',2026,9)`,[id(900+n),id(800+n)]);
    await db.query(`INSERT INTO internal_proesc.v2_invoice_observations(id,run_id,task_id,unit_id,invoice_id,
      snapshot_id,source_status,normalized,result,observed_at,recorded_at)
      VALUES($1,$2,$3,'3145',$4,$5,$6,$7::jsonb,'REVIEW',$8,$9)`,
      [id(600+n),id(800+n),id(900+n),invoice,id(snapshot),status,
        JSON.stringify({unitId:'3145',invoiceId:invoice,sourceStatus:status}),observed,recorded]);
  }
  const source=(name)=>readFileSync(new URL(`./proesc-v2-growth/${name}`,import.meta.url),'utf8');
  await db.exec(source('fixture_caixa_review_authorizer.sql'));
  await db.exec(source('fixture_caixa_review_reader.sql'));
  await db.exec(`REVOKE ALL ON FUNCTION public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)
    FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)
    TO authenticated,service_role;
    REVOKE ALL ON FUNCTION internal_contas.caixa_assert_receivables_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;`);
  return {polo:id(90),otherPolo:id(91)};
}
