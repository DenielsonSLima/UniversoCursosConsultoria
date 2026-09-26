begin;

-- Endpoint exclusivo do modo "Em lote". Os fluxos individual e personalizado
-- continuam usando o contrato anterior, inclusive a ordem escolhida pelo usuário.
create or replace function public.reemitir_fichas_ativas_lote_portal(
  p_documento text,
  p_matricula_ids uuid[],
  p_idempotency_key text,
  p_periodo_referencia text default null,
  p_emitido_por uuid default null
)
returns table (
  matricula_id uuid,
  ordem_solicitacao integer,
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_requested_count integer := coalesce(cardinality(p_matricula_ids), 0);
  v_locked_count integer := 0;
  v_enrollment record;
  v_ordered_ids uuid[];
  v_effective_issuer uuid;
  v_issued jsonb;
begin
  if p_documento is null
    or p_documento not in ('pasta_identificacao', 'ficha_matricula')
  then
    raise exception 'O lote de matrículas ativas é exclusivo de Pasta e Ficha de Matrícula.'
      using errcode = '22023';
  end if;

  if char_length(v_key) not between 16 and 90
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception 'A chave do lote deve ter 16 a 90 caracteres seguros.'
      using errcode = '22023';
  end if;

  if v_requested_count = 0 or v_requested_count > 500 then
    raise exception 'Informe de 1 a 500 matrículas para emissão em lote.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct requested.requested_id)
    from unnest(p_matricula_ids) as requested(requested_id)
  ) then
    raise exception 'O lote contém matrículas nulas ou duplicadas.'
      using errcode = '22023';
  end if;

  -- Autorize inclusive os itens inelegíveis. Filtrar antes da guarda permitiria
  -- consultar silenciosamente matrículas de outro polo ou sem permissão.
  -- SHARE preserva situação, nome e polo durante seleção e emissão, impedindo
  -- que um trancamento concorrente aconteça entre a verificação e o snapshot.
  for v_enrollment in
    select enrollment.id, class.polo_id
    from public.matriculas as enrollment
    join public.parceiros as student on student.id = enrollment.aluno_id
    join public.turmas as class on class.id = enrollment.turma_id
    where enrollment.id = any(p_matricula_ids)
    order by enrollment.id
    for share of enrollment, student, class
  loop
    if not coalesce(
      public.can_manage_secretaria_document(p_documento, v_enrollment.polo_id),
      false
    ) then
      raise exception 'Acesso à emissão deste lote não autorizado.'
        using errcode = '42501';
    end if;
    v_locked_count := v_locked_count + 1;
  end loop;

  if v_locked_count <> v_requested_count then
    raise exception 'Uma ou mais matrículas do lote não foram localizadas.'
      using errcode = '22023';
  end if;

  v_effective_issuer := internal_academic.resolve_responsavel(p_emitido_por);

  select array_agg(
    enrollment.id
    order by
      lower(btrim(coalesce(student.nome, ''))) collate pg_catalog."pt-BR-x-icu",
      enrollment.id
  )
  into v_ordered_ids
  from public.matriculas as enrollment
  join public.parceiros as student on student.id = enrollment.aluno_id
  where enrollment.id = any(p_matricula_ids)
    and upper(btrim(coalesce(enrollment.status, '')))
      in ('ATIVO', 'PENDENTE', 'EM_ANDAMENTO');

  -- Um lote sem elegíveis não cria emissão nem entrada de idempotência.
  if coalesce(cardinality(v_ordered_ids), 0) = 0 then
    return;
  end if;

  -- O emissor canônico mantém modelos, marca institucional, atomicidade e
  -- idempotência por matrícula. A posição retornada passa a ser alfabética.
  select jsonb_agg(to_jsonb(batch)) into v_issued
  from public.reemitir_fichas_validacao_lote_portal(
    p_documento, v_ordered_ids, v_key, p_periodo_referencia, v_effective_issuer
  ) as batch;

  -- Uma instrução separada enxerga os snapshots recém-gravados pelo emissor.
  -- O nome congelado é o texto efetivamente exibido no PDF, inclusive no replay.
  return query
  with issued as (
    select batch.* from jsonb_to_recordset(v_issued) as batch(
      matricula_id uuid, ordem_solicitacao integer, codigo text, documento text,
      emitido_em timestamptz, ultima_emissao_em timestamptz, validade_ate timestamptz,
      status text, quantidade_emissoes integer, reutilizado boolean
    )
  ), ordered as (
    select issued.*,
      row_number() over (
        order by lower(btrim(coalesce(snapshot.dados_emissao ->> 'studentName', '')))
          collate pg_catalog."pt-BR-x-icu", issued.matricula_id
      )::integer as alphabetical_order
    from issued
    join public.documentos_validacao as snapshot on snapshot.codigo = issued.codigo
  )
  select ordered.matricula_id, ordered.alphabetical_order, ordered.codigo,
    ordered.documento, ordered.emitido_em, ordered.ultima_emissao_em,
    ordered.validade_ate, ordered.status, ordered.quantidade_emissoes,
    ordered.reutilizado
  from ordered
  order by ordered.alphabetical_order;
end;
$function$;

revoke all on function public.reemitir_fichas_ativas_lote_portal(
  text, uuid[], text, text, uuid
) from public, anon;
grant execute on function public.reemitir_fichas_ativas_lote_portal(
  text, uuid[], text, text, uuid
) to authenticated, service_role;

comment on function public.reemitir_fichas_ativas_lote_portal(
  text, uuid[], text, text, uuid
) is 'Emissão administrativa em lote de Pasta/Ficha: matrículas ativas, ordenação pt-BR e exclusão de trancados antes do snapshot canônico.';

commit;
