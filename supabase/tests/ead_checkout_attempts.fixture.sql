-- LOCAL ONLY. Extend the financial and expiration fixtures with production
-- singleton constraints, required columns, defaults and authorization stubs.
create schema internal_academic;
update public.turmas set polo_id='00000000-0000-0000-0000-000000000001';
alter table public.cursos add column status text default 'ATIVO',add column publicar_site boolean default true;
alter table public.matriculas alter column id set default gen_random_uuid(),
  add column financeiro_herdado boolean default false,add column gerar_cobranca_inicial boolean default false,
  add column gerar_cobranca_futura boolean default false,add column sincronizar_asaas boolean default false;
alter table public.contas_receber alter column id set default gen_random_uuid(),
  add column gateway_installments integer;
alter table public.inscricoes_online alter column id set default gen_random_uuid();
alter table public.payment_gateway_transactions alter column id set default gen_random_uuid();
alter table public.parceiros add column tipo text default 'ALUNO',add column status text default 'ATIVO';
alter table public.despesas_lancamentos add column fornecedor_id uuid,add column descricao text,
  add column anexo_bucket text,add column anexo_path text;
alter table public.sistema_eventos alter column id set default gen_random_uuid(),
  alter column created_at set default now(),add column descricao text;
alter table public.matriculas add constraint matriculas_aluno_id_turma_id_key unique(aluno_id,turma_id);
create unique index contas_receber_matricula_matricula_uidx on public.contas_receber(matricula_id)
  where matricula_id is not null and tipo_lancamento='MATRICULA';
create unique index contas_receber_matricula_origem_uidx on public.contas_receber(matricula_id,origem_cronograma_id)
  where matricula_id is not null and origem_cronograma_id is not null;
alter table public.inscricoes_online add constraint inscricoes_online_matricula_id_key unique(matricula_id),
  add constraint inscricoes_online_receivable_id_key unique(receivable_id);
create unique index banese_transaction_receivable_uidx on public.payment_gateway_transactions(receivable_id)
  where provider_code='banese_card' and receivable_id is not null;
alter table test_caixa.access_state add column actor uuid,add column aluno uuid;
create function auth.uid() returns uuid language sql stable as $$ select actor from test_caixa.access_state $$;
create function public.current_aluno_id() returns uuid language sql stable as $$ select aluno from test_caixa.access_state $$;
create function public.is_financeiro_for_polo(uuid) returns boolean language sql stable as $$
  select global_allowed or scoped_allowed from test_caixa.access_state $$;
create function public.gestor_has_financeiro_tab(text) returns boolean language sql stable as $$ select true $$;
create function public.assert_aluno_sem_matricula_curso_duplicada(uuid,uuid,uuid)
returns void language sql as $$ select $$;
create function internal_academic.authorize_enrollment_upsert(uuid,uuid,text)
returns void language sql as $$ select $$;
