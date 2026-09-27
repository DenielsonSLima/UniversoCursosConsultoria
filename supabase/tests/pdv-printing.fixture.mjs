import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const polo = uid(900), otherPolo = uid(901), actor = uid(800), otherActor = uid(801);
export const migrations = [
  '20260927011700_pdv_printer_registry.sql',
  '20260927011701_pdv_printer_settings_rpcs.sql',
  '20260927011702_pdv_canonical_receipts.sql',
  '20260927011703_pdv_print_job_rpcs.sql',
];

export async function createPdvFixture() {
  const modulePath = process.env.PGLITE_MODULE_PATH;
  const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA internal_proesc;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE FUNCTION public.is_gestor() RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.gestor',true)='true' $$;
    CREATE FUNCTION public.gestor_has_any_module_for_polo(text[],uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.manage',true)='true' AND $2::text=current_setting('test.polo',true) $$;
    CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.use',true)='true' AND $1='outros-creditos' $$;
    CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT $1::text=current_setting('test.polo',true) $$;
    CREATE TABLE public.polos (
      id uuid PRIMARY KEY,nome text,cnpj text,status text,endereco text,numero text,complemento text,
      bairro text,cidade text,estado text,cep text,telefone text,email text,is_matriz boolean,
      logo_url text,watermark_url text,watermark_opacity numeric,watermark_scale integer,watermark_rotate boolean
    );
    CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,cpf_cnpj text);
    CREATE TABLE public.contas_receber(
      id uuid PRIMARY KEY,polo_id uuid REFERENCES public.polos(id),cliente_id uuid,categoria text,
      matricula_id uuid,turma_id uuid,origem_cronograma_id text,tipo_lancamento text,origem_pagamento text,
      status text,valor numeric,valor_pago numeric,data_pagamento date,manual_settlement_id uuid,
      manual_settlement_reversed_at timestamptz,gateway_provider text,gateway_payment_id text,
      asaas_payment_id text,forma_pagamento text,gateway_payment_method text,descricao text
    );
    CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid);
    CREATE TABLE public.inscricoes_online(receivable_id uuid);
    CREATE TABLE public.matricula_dependencia_cobrancas(conta_receber_id uuid);
    CREATE TABLE internal_proesc.obligation_links(receivable_id uuid);
    CREATE TABLE public.documentos_modelos_configuracoes(template_key text);
  `);
  for (const file of migrations) await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const settings = async ({ who = actor, scope = polo, use = true, manage = true, gestor = true } = {}) => {
    for (const [key, value] of Object.entries({ actor: who, polo: scope, use, manage, gestor })) {
      await db.query('SELECT set_config($1,$2,false)', [`test.${key}`, String(value)]);
    }
  };
  await settings();
  for (const id of [polo, otherPolo]) await db.query(`INSERT INTO public.polos
    (id,nome,cnpj,status,endereco,numero,cidade,estado,is_matriz,logo_url,watermark_url,
      watermark_opacity,watermark_scale,watermark_rotate)
    VALUES($1,'Polo sintético','00000000000000','ATIVO','Rua de teste','10','Cidade','SE',true,
      'https://example.invalid/logo.png','https://example.invalid/watermark.png',0.12,65,true)`, [id]);
  await db.query('INSERT INTO public.parceiros VALUES($1,$2,$3)', [uid(700), 'Pagador sintético', '00000000000']);
  const base = { polo_id: polo, cliente_id: uid(700), categoria: 'OUTROS_CREDITOS', status: 'PAGO',
    valor: 10, valor_pago: 0.50, data_pagamento: '2026-09-26', gateway_provider: 'banese_card',
    gateway_payment_method: 'BOLETO', descricao: 'Crédito avulso sintético', origem_pagamento: 'BANESE' };
  const cases = [
    [1, {}], [2, { status: 'PENDENTE' }], [3, { valor_pago: null }], [4, { matricula_id: uid(600) }],
    [5, { polo_id: otherPolo }], [6, { status: 'ESTORNADO' }],
    [7, { manual_settlement_reversed_at: '2026-09-26T12:00:00Z' }],
    [8, {}], [9, {}], [10, {}], [11, {}],
    [12, { valor: 100, valor_pago: 95 }], [13, { valor: 100, valor_pago: 110 }],
    [14, {}], [15, {}], [16, {}],
  ];
  for (const [id, extra] of cases) await db.query(`INSERT INTO public.contas_receber
    SELECT * FROM jsonb_populate_record(NULL::public.contas_receber,$1::jsonb)`,
  [JSON.stringify({ ...base, id: uid(id), gateway_payment_id: `synthetic-${id}`, ...extra })]);
  await db.query('INSERT INTO public.inscricoes_online VALUES($1)', [uid(8)]);
  await db.query('INSERT INTO internal_proesc.obligation_links VALUES($1)', [uid(9)]);
  await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1)', [uid(10)]);
  await db.query('INSERT INTO public.matricula_dependencia_cobrancas VALUES($1)', [uid(11)]);
  let sequence = 1000;
  const request = () => uid(sequence++);
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.result;
  const receipt = (id = uid(1), printer = null, station = null) =>
    scalar('SELECT public.prepare_pdv_receipt($1,$2,$3) result', [id, printer, station]);
  const register = (name = 'Estação sintética', req = request()) =>
    scalar('SELECT public.register_pdv_workstation($1,$2,$3) result', [polo, name, req]);
  const save = (input, req = request()) =>
    scalar('SELECT public.save_pdv_printer($1,$2) result', [input, req]);
  const prepare = (receiptId, { station = null, printer = null, purpose = 'MANUAL', reason = null, req = request() } = {}) =>
    scalar('SELECT public.prepare_pdv_print_job($1,$2,$3,$4,$5,$6) result', [receiptId, station, printer, req, purpose, reason]);
  const claim = (id, req = request()) => scalar('SELECT public.claim_pdv_print_job($1,$2) result', [id, req]);
  const complete = (id, token, result) => scalar('SELECT public.complete_pdv_print_job($1,$2,$3) result', [id, token, result]);
  const fingerprint = () => scalar(`SELECT md5((SELECT jsonb_agg(c ORDER BY id)::text FROM public.contas_receber c)) result`);
  return { db, settings, request, scalar, receipt, register, save, prepare, claim, complete, fingerprint };
}
