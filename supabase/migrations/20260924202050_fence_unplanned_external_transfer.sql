-- Old public admission signatures cannot bypass the reviewed idempotent plan.
-- Private historical implementations remain for audit; they are not RPCs.
begin;
create or replace function public.receber_transferencia_externa(
  p_aluno_id uuid,p_turma_destino_id uuid,p_instituicao_origem text,p_curso_origem text,
  p_motivo text,p_observacao text default null,p_data_transferencia date default null,
  p_responsavel_id uuid default null
)
returns public.matriculas language plpgsql security definer set search_path='' as $function$
begin
  raise exception 'Atualize a tela e use o recebimento de transferência com plano financeiro revisado.' using errcode='22023';
end;
$function$;
create or replace function public.receber_transferencia_externa_com_aproveitamentos(
  p_aluno_id uuid,p_turma_destino_id uuid,p_instituicao_origem text,p_curso_origem text,
  p_motivo text,p_observacao text default null,p_data_transferencia date default null,
  p_responsavel_id uuid default null,p_aproveitamentos jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  raise exception 'Atualize a tela e use o recebimento de transferência com plano financeiro revisado.' using errcode='22023';
end;
$function$;
revoke all on function
  internal_academic.legacy_receber_transferencia_externa(uuid,uuid,text,text,text,text,date,uuid),
  internal_academic.p1_receber_transferencia_externa_20260719(uuid,uuid,text,text,text,text,date,uuid)
  from public,anon,authenticated,service_role;
commit;
