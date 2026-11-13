-- Local fixture: only schemas/authorization and unrelated document branches are
-- controlled. Trust, quiz, issuance, payment predicates and callbacks use real SQL.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT nullif(current_setting('test.actor',true),'')::uuid
$$;
CREATE FUNCTION public.gestor_has_module(text) RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(current_setting('test.gestor',true),'false')='true'
$$;
CREATE FUNCTION public.gestor_has_any_tab(text,text[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(current_setting('test.gestor',true),'false')='true'
$$;
CREATE FUNCTION public.can_write_turma(uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT coalesce(current_setting('test.gestor',true),'false')='true'
$$;
CREATE TABLE public.contas_receber(
 id uuid PRIMARY KEY,matricula_id uuid,cliente_id uuid,turma_id uuid,polo_id uuid,tipo_lancamento text,
 status text DEFAULT 'PENDENTE',valor numeric,valor_pago numeric DEFAULT 0,data_pagamento date,data_vencimento date,
 ead_checkout_attempt_id uuid,manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
 gateway_provider text,gateway_environment text,gateway_payment_id text,asaas_payment_id text,
 gateway_status text,asaas_status text,gateway_boleto_nosso_numero text,origem_pagamento text,
 gateway_settlement_source text,gateway_settlement_evidence jsonb,forma_pagamento text,
 asaas_synced_at timestamptz,asaas_last_error text,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.inscricoes_online(
 id uuid PRIMARY KEY,matricula_id uuid,aluno_id uuid,turma_id uuid,curso_id uuid,receivable_id uuid,
 ead_checkout_attempt_id uuid,status text DEFAULT 'AGUARDANDO_PAGAMENTO',valor numeric,
 gateway_environment text,gateway_payment_id text,asaas_payment_id text,forma_pagamento text,
 pago_em timestamptz,confirmado_em timestamptz,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.ead_checkout_attempts(
 id uuid PRIMARY KEY,matricula_id uuid,aluno_id uuid,turma_id uuid,curso_id uuid,
 receivable_id uuid,inscription_id uuid,transaction_id uuid,state text DEFAULT 'OPEN',
 is_current boolean DEFAULT true,paid_at timestamptz,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.payment_gateway_transactions(
 id uuid PRIMARY KEY,receivable_id uuid,inscricao_online_id uuid,provider_code text,environment text,
 remote_payment_id text,bank_slip_our_number text,amount numeric,payment_method text,remote_status text
);
CREATE TABLE public.financial_payment_events(
 id uuid PRIMARY KEY,source_kind text,source_id uuid,reversed_at timestamptz,polo_id uuid,
 original_cents bigint,principal_cents bigint,discount_cents bigint,payment_cents bigint
);
CREATE TABLE public.receivable_manual_settlements(
 id uuid PRIMARY KEY,receivable_id uuid,polo_id uuid,state text,completed_at timestamptz,reversed_at timestamptz,
 principal_cents bigint,received_cents bigint,requires_remote_cancellation boolean,remote_canceled_at timestamptz
);
CREATE FUNCTION public.gerar_cobranca_matricula(uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Unexpected missing fixture receivable'; END;
$$;
ALTER TABLE public.documentos_validacao ADD COLUMN revogado_em timestamptz,
 ADD COLUMN dados_publicos_snapshot jsonb DEFAULT '{}',ADD COLUMN politica_versao_emissao integer DEFAULT 1,
 ADD COLUMN campos_publicos_emissao text[] DEFAULT ARRAY['issuedAt','code'];
ALTER TABLE public.documentos_validacao_politicas ADD COLUMN versao integer DEFAULT 1,
 ADD COLUMN campos_publicos text[] DEFAULT ARRAY['issuedAt','code'],
 ADD COLUMN consulta_publica_ativa boolean DEFAULT true,ADD COLUMN exige_vinculo_ativo boolean DEFAULT false;
ALTER TABLE public.turmas ADD COLUMN data_previsao_termino date;
CREATE TABLE public.documentos_templates(id text PRIMARY KEY,conteudo jsonb);
INSERT INTO public.documentos_templates VALUES('diplomas','[{"id":"certificado_ead","modalidade":"EAD","backgroundUrl":"synthetic-original-model"}]');
CREATE TABLE public.documentos_validacao_preceptores(
 codigo text,status text,validacao_publica boolean,politica_versao_emissao integer,campos_publicos_emissao text[],
 dados_publicos_snapshot jsonb,professor_id uuid,validade_ate timestamptz
);
ALTER TABLE public.parceiros ADD COLUMN status text DEFAULT 'ATIVO';
CREATE FUNCTION public.dados_publicos_carteirinha_atual(public.documentos_validacao)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.documento_validade_efetiva(text,timestamptz,date)
RETURNS timestamptz LANGUAGE sql AS $$ SELECT $2 $$;
CREATE FUNCTION public.filtrar_dados_publicos_validacao(jsonb,text[])
RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
 FROM jsonb_each($1) WHERE key=ANY($2) $$;
CREATE TABLE public.assinatura_eletronica_envelopes(
 id uuid,documento_snapshot jsonb,finalizado_em timestamptz,status text,documento_final_sha256 text,documento text,origem_tipo text
);
CREATE TABLE public.assinatura_eletronica_artefatos(envelope_id uuid,classe text,sha256 text,bucket_id text,storage_path text);
CREATE SCHEMA storage;
CREATE TABLE storage.objects(bucket_id text,name text);
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid INTO v_id; RETURN v_id; END;
$$;
