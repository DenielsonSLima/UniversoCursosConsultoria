-- Isolated transport/configuration boundaries; calculations, guards and RPCs are canonical.
alter table public.contas_receber alter column id set default gen_random_uuid();
alter table public.contas_receber add column if not exists categoria text;
alter table public.matriculas add column if not exists fluxo_operacional text;
alter table public.matriculas_tecnicas_financeiro_config add column override_ativo boolean default false;
alter table internal_academic.technical_transfer_entry_plans add column rule_snapshot jsonb;
alter table internal_proesc.obligation_links add column confirmed_at timestamptz;
create table internal_proesc.financial_snapshots(link_id uuid,source_fingerprint text);
create table internal_academic.technical_financial_requests(
  request_id uuid primary key,operation text,actor_id uuid,payload_hash text,response jsonb,created_at timestamptz default now());
create table public.manager_fixture_rules(matricula_id uuid primary key,rule jsonb);
create or replace function internal_academic.technical_financial_effective_rule(p_id uuid)
returns jsonb language sql stable as $$select rule from public.manager_fixture_rules where matricula_id=p_id$$;
create function public.can_operate_turma_academics(p_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.turmas t where t.id=p_id and public.is_gestor_for_polo(t.polo_id))
$$;
create function public.gestor_has_tab(p_module text,p_tab text) returns boolean language sql stable as $$
  select p_module='gestao' and p_tab='financeiro' and public.gestor_has_financeiro_tab('receber')
$$;
create function public.obter_financeiro_matricula_tecnica_workspace_secure(uuid,uuid)
returns jsonb language sql as $$select jsonb_build_object('syntheticWorkspace',true)$$;
create function internal_academic.is_authorized_external_history_insert(public.contas_receber)
returns boolean language sql as $$select false$$;
create function internal_proesc.is_exact_administrative_restore(public.contas_receber)
returns boolean language sql as $$select false$$;
create function internal_proesc.assert_fresh_cycle_generation_before_individual_admission(uuid)
returns void language plpgsql as $$begin raise exception 'Synthetic Proesc timeout: no online confirmation' using errcode='42501'; end$$;
create trigger guard_technical_manual_cycle_insert before insert on public.contas_receber
for each row execute function internal_academic.guard_technical_manual_cycle_insert();
create trigger guard_fresh_cycle_generation_insert before insert on public.contas_receber
for each row execute function internal_proesc.guard_fresh_cycle_generation_insert();
create trigger guard_protected_technical_bank_post before update of gateway_creation_token,gateway_cnab_file_id,
  gateway_submission_channel,gateway_submission_status on public.contas_receber
for each row execute function internal_academic.guard_protected_technical_bank_post();
create trigger implantation_fixture_guard before insert or delete or update of matricula_id on public.contas_receber
for each row execute function public.guard_implantation_receivable();
alter table internal_academic.technical_manual_receivable_issuance_authorizations
  alter column claim_count set default 0;

create table public.historico_turma_financeira(id uuid default gen_random_uuid(),turma_id uuid,
  matricula_id uuid,evento text,regra jsonb,observacao text,created_at timestamptz default now());
create or replace function public.registrar_turma_financeiro_auditoria(matricula uuid,event text,details jsonb,reason text)
returns void language sql as $$
  insert into public.historico_turma_financeira(turma_id,matricula_id,evento,regra,observacao)
  select m.turma_id,matricula,event,details,reason from public.matriculas m where m.id=matricula
$$;
