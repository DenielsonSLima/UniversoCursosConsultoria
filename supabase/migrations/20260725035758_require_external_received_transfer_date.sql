-- A transferência externa recebida segue a mesma regra de auditoria das
-- demais movimentações: a data acadêmica deve ser informada explicitamente.

create or replace function public.receber_transferencia_externa(
  p_aluno_id uuid,
  p_turma_destino_id uuid,
  p_instituicao_origem text,
  p_curso_origem text,
  p_motivo text,
  p_observacao text default null,
  p_data_transferencia date default null,
  p_responsavel_id uuid default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hoje date := (pg_catalog.timezone('America/Maceio', now()))::date;
begin
  if not public.can_operate_turma_academics(p_turma_destino_id) then
    raise exception 'Sem permissão de Gestão para receber esta transferência.'
      using errcode = '42501';
  end if;

  if p_data_transferencia is null then
    raise exception 'Informe a data efetiva da transferência.';
  end if;
  if p_data_transferencia > v_hoje then
    raise exception 'A data da transferência não pode estar no futuro.';
  end if;

  return internal_academic.p1_receber_transferencia_externa_20260719(
    p_aluno_id,
    p_turma_destino_id,
    p_instituicao_origem,
    p_curso_origem,
    p_motivo,
    p_observacao,
    p_data_transferencia,
    p_responsavel_id
  );
end;
$function$;

create or replace function public.receber_transferencia_externa_com_aproveitamentos(
  p_aluno_id uuid,
  p_turma_destino_id uuid,
  p_instituicao_origem text,
  p_curso_origem text,
  p_motivo text,
  p_observacao text default null,
  p_data_transferencia date default null,
  p_responsavel_id uuid default null,
  p_aproveitamentos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hoje date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_matricula public.matriculas%rowtype;
  v_creditos jsonb;
begin
  if p_data_transferencia is null then
    raise exception 'Informe a data efetiva da transferência.';
  end if;
  if p_data_transferencia > v_hoje then
    raise exception 'A data da transferência não pode estar no futuro.';
  end if;

  v_matricula := public.receber_transferencia_externa(
    p_aluno_id,
    p_turma_destino_id,
    p_instituicao_origem,
    p_curso_origem,
    p_motivo,
    p_observacao,
    p_data_transferencia,
    p_responsavel_id
  );

  v_creditos := public.salvar_aproveitamentos_transferencia_externa(
    v_matricula.id,
    coalesce(p_aproveitamentos, '[]'::jsonb),
    p_observacao
  );

  return jsonb_build_object(
    'matriculaId', v_matricula.id,
    'aproveitamentosSalvos', coalesce(
      (v_creditos ->> 'aproveitamentosSalvos')::integer,
      0
    )
  );
end;
$function$;
