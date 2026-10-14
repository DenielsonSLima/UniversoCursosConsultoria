CREATE SCHEMA internal_contas;
CREATE SCHEMA internal_academic;
CREATE SCHEMA internal_other_credit_cancellation;
CREATE TABLE public.cursos(id uuid PRIMARY KEY,modalidade text,nome text);
CREATE TABLE public.turmas(id uuid PRIMARY KEY,curso_id uuid,nome text);
ALTER TABLE public.polos ADD COLUMN nome text, ADD COLUMN cnpj text,ADD COLUMN cidade text,ADD COLUMN estado text;
ALTER TABLE public.parceiros ADD COLUMN nome text;
ALTER TABLE public.usuarios_sistema ADD COLUMN id uuid,ADD COLUMN nome text;
ALTER TABLE public.receivable_manual_settlements ADD COLUMN id uuid,ADD COLUMN polo_id uuid,ADD COLUMN actor_id uuid,
 ADD COLUMN state text,ADD COLUMN completed_at timestamptz,ADD COLUMN reversed_at timestamptz;
ALTER TABLE internal_proesc.obligation_links ADD COLUMN turma_id uuid,ADD COLUMN matricula_id uuid,
 ADD COLUMN source_unit_id text,ADD COLUMN source_class_id text;
CREATE TABLE internal_proesc.class_scopes(turma_id uuid,source_unit_id text,source_class_id text,phase text,polo_id uuid);
CREATE FUNCTION public.assert_receivables_filter_scope(uuid) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN IF current_setting('test.scope',true)='false' THEN RAISE EXCEPTION 'TEST_SCOPE_DENIED'; END IF; RETURN true; END $$;
CREATE FUNCTION internal_contas.ead_checkout_is_optional(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false; $$;
CREATE FUNCTION public.financeiro_normalize_search_text(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower($1); $$;
CREATE FUNCTION internal_other_credit_cancellation.eligible(public.contas_receber) RETURNS boolean LANGUAGE sql AS $$ SELECT false; $$;
CREATE FUNCTION internal_academic.receivable_cycle_presentation(public.contas_receber) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb; $$;
CREATE FUNCTION public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)
RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('id',r.id)),'[]'))
 FROM public.contas_receber r WHERE r.polo_id=$2 AND r.categoria='MENSALIDADE'; $$;
