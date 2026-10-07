-- Synthetic relation shapes for canonical eligibility functions. No remote data.
alter table public.matriculas add column if not exists origem_matricula_id uuid;
alter table public.turmas add column if not exists curso_id uuid;
create function extensions.digest(value text, algorithm text) returns bytea language sql as $$select extensions.digest(convert_to(value,'UTF8'),algorithm);$$;
create table internal_academic.technical_manual_cycle_policies(turma_id uuid,generation_mode text,initial_state text,baseline_cycle integer,max_cycle integer,eligibility_rule text,active boolean,revision integer);
create table public.matriculas_tecnicas_financeiro_config(matricula_id uuid);
create table internal_academic.technical_transfer_entry_plans(matricula_id uuid,initial_cycle integer,installment_count integer,first_due_date date,cycle_two_reason text,request_id uuid,financial_plan jsonb);
create table internal_academic.technical_external_cycle_coverage(matricula_id uuid,state text,scope text,item_count integer,total_amount numeric);
create table internal_proesc.class_scopes(id uuid,turma_id uuid,polo_id uuid,phase text,batch_id uuid,financial_mode text,source_unit_id text,source_class_id text);
create table internal_proesc.enrollment_sources(matricula_id uuid,source_verified boolean,source_status text,financial_review_state text);
create table internal_proesc.enrollment_cycle_evidence(matricula_id uuid,scope_id uuid,classification text,verification text,has_external_cycle2 boolean,evidence_kind text,evidence_hash text,revision integer,obligation_manifest_hash text);
alter table internal_proesc.obligation_links add column if not exists id uuid,add column if not exists matricula_id uuid,add column if not exists turma_id uuid,add column if not exists source_unit_id text,add column if not exists source_class_id text,add column if not exists source_key text,add column if not exists kind text,add column if not exists parent_link_id uuid;
create table internal_proesc.obligation_imports(link_id uuid,scope_id uuid,source_person_hash text,source_fingerprint text,source_cycle text,obligation_kind text,source_ordinal integer);
create table internal_academic.technical_imported_cycle_facts(matricula_id uuid,cycle_number integer,administration_origin text,proof_kind text,identity_hash text,source_system text,confirmed_at timestamptz,proof_hash text);
create table internal_academic.technical_imported_cycle_fact_conflicts(matricula_id uuid,cycle_number integer);
