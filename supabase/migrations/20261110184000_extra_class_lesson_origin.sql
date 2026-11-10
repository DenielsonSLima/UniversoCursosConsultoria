begin;

-- No inferred historical association: existing activities remain unlinked until
-- the responsible user explicitly selects their originating class session.
alter table public.atividades_extra_classe add column aula_origem_id uuid;
comment on column public.atividades_extra_classe.aula_origem_id is
  'Aula presencial de origem; atividade complementar, sem criar chamada.';
alter table public.aulas_turma add constraint aulas_turma_origin_context_key
  unique (id, turma_id, disciplina_id);
alter table public.atividades_extra_classe add constraint atividades_extra_aula_origem_context_fk
  foreign key (aula_origem_id, turma_id, disciplina_id)
  references public.aulas_turma(id, turma_id, disciplina_id)
  on update restrict on delete restrict;
create index atividades_extra_aula_origem_idx
  on public.atividades_extra_classe(aula_origem_id) where aula_origem_id is not null;

create function internal_academic.require_extra_class_origin()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if new.aula_origem_id is null and (
    tg_op = 'INSERT' or (
      to_jsonb(new) - array['status','status_antes_arquivo','updated_at','atualizado_por_auth_id']
      is distinct from
      to_jsonb(old) - array['status','status_antes_arquivo','updated_at','atualizado_por_auth_id']
    )
  ) then
    raise exception 'Selecione a aula de origem da atividade extra-classe.' using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.require_extra_class_origin()
  from public, anon, authenticated, service_role;
create trigger require_extra_class_origin before insert or update
  on public.atividades_extra_classe for each row
  execute function internal_academic.require_extra_class_origin();

-- Session reconstruction (for example 8h -> 4h) and deletion must not leave
-- complements without their origin. Same-session content/date edits stay valid.
create function internal_academic.protect_extra_class_origin_lesson()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if exists(select 1 from public.atividades_extra_classe activity
    where activity.aula_origem_id=old.id) then
    raise exception 'Esta aula possui atividades complementares. Vincule os complementos a outra aula antes de excluir ou alterar sua carga e turnos.'
      using errcode='23514';
  end if;
  return old;
end;
$function$;
revoke all on function internal_academic.protect_extra_class_origin_lesson()
  from public, anon, authenticated, service_role;
create trigger protect_extra_class_origin_lesson before delete on public.aulas_turma
  for each row execute function internal_academic.protect_extra_class_origin_lesson();

-- Replace the old API signature rather than leave ambiguous default overloads.
-- Existing authorization, optimistic concurrency and diary locks stay intact.
do $guard$
begin
  if md5(pg_get_functiondef(
    'public.gerenciar_atividade_extra_classe(uuid,text,text,date,numeric,timestamptz)'::regprocedure))
    <> 'a0ad052b3fe36db1b1c4632ddad321e9'
  then raise exception 'Drift no gerenciador de atividades extra-classe.'; end if;
end;
$guard$;
drop function public.gerenciar_atividade_extra_classe(uuid,text,text,date,numeric,timestamptz);

CREATE OR REPLACE FUNCTION public.gerenciar_atividade_extra_classe(
  p_atividade_id UUID,
  p_acao TEXT,
  p_titulo TEXT DEFAULT NULL,
  p_prazo_entrega DATE DEFAULT NULL,
  p_carga_horaria NUMERIC DEFAULT NULL,
  p_updated_at_esperado TIMESTAMPTZ DEFAULT NULL,
  p_aula_origem_id UUID DEFAULT NULL
)
RETURNS public.atividades_extra_classe
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_atividade public.atividades_extra_classe%ROWTYPE;
  v_acao TEXT := upper(btrim(coalesce(p_acao, '')));
  v_estado TEXT;
  v_pode_operar BOOLEAN;
  v_pode_preparar BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;
  IF v_acao NOT IN ('EDITAR', 'ARQUIVAR', 'RESTAURAR', 'VINCULAR_ORIGEM') THEN
    RAISE EXCEPTION 'Ação de atividade inválida.' USING ERRCODE = '22023';
  END IF;

  -- O trigger de respostas já obtém FOR SHARE na mesma atividade:
  -- edição e entrega ficam serializadas sem alterar as respostas.
  SELECT ae.* INTO v_atividade
  FROM public.atividades_extra_classe ae
  WHERE ae.id = p_atividade_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atividade indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  v_pode_operar := coalesce(
    public.can_operate_atividade_extra(v_atividade.turma_id, v_atividade.disciplina_id), false);
  v_pode_preparar := coalesce(
    public.can_prepare_atividade_extra(v_atividade.turma_id, v_atividade.disciplina_id), false);
  v_estado := CASE WHEN v_atividade.status = 'ARQUIVADA'
    THEN v_atividade.status_antes_arquivo
    ELSE v_atividade.status END;

  IF NOT coalesce(v_pode_operar OR (v_estado = 'RASCUNHO' AND v_pode_preparar), false) THEN
    RAISE EXCEPTION 'Atividade indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF p_updated_at_esperado IS NOT NULL
    AND v_atividade.updated_at IS DISTINCT FROM p_updated_at_esperado THEN
    RAISE EXCEPTION 'A atividade foi alterada. Atualize a grade antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  IF v_acao = 'VINCULAR_ORIGEM' THEN
    IF v_atividade.aula_origem_id IS NOT NULL OR p_aula_origem_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a origem de uma atividade ainda não vinculada.' USING ERRCODE = '23514';
    END IF;
    -- Only relationship metadata changes; answered content remains immutable.
    UPDATE public.atividades_extra_classe
    SET aula_origem_id = p_aula_origem_id
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  ELSIF v_acao = 'EDITAR' THEN
    IF v_atividade.status = 'ARQUIVADA' THEN
      RAISE EXCEPTION 'Restaure a atividade antes de editar.' USING ERRCODE = '23514';
    END IF;
    IF nullif(btrim(p_titulo), '') IS NULL OR length(btrim(p_titulo)) > 1000 THEN
      RAISE EXCEPTION 'Informe um título de até 1000 caracteres.' USING ERRCODE = '23514';
    END IF;
    IF p_carga_horaria IS NULL OR p_carga_horaria <= 0
      OR p_carga_horaria::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Informe uma carga horária maior que zero.' USING ERRCODE = '23514';
    END IF;

    IF p_aula_origem_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a aula de origem da atividade extra-classe.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.atividades_extra_classe
    SET aula_origem_id = p_aula_origem_id, titulo = btrim(p_titulo),
      -- Temas independentes não são sobrescritos pelo editor resumido da grade.
      tema = CASE WHEN tema = v_atividade.titulo THEN btrim(p_titulo) ELSE tema END,
      prazo_entrega = p_prazo_entrega,
      carga_horaria_compensacao = p_carga_horaria
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  ELSIF v_acao = 'ARQUIVAR' THEN
    IF v_atividade.status = 'ARQUIVADA' THEN
      RETURN v_atividade;
    END IF;
    UPDATE public.atividades_extra_classe
    SET status = 'ARQUIVADA'
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  ELSE
    IF v_atividade.status <> 'ARQUIVADA' THEN
      RAISE EXCEPTION 'A atividade não está arquivada.' USING ERRCODE = '23514';
    END IF;
    IF v_estado IS NULL THEN
      RAISE EXCEPTION 'O estado original desta atividade antiga não foi registrado. Restauração indisponível.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.atividades_extra_classe
    SET status = v_estado
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  END IF;
  RETURN v_atividade;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerenciar_atividade_extra_classe(UUID, TEXT, TEXT, DATE, NUMERIC, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_atividade_extra_classe(UUID, TEXT, TEXT, DATE, NUMERIC, TIMESTAMPTZ, UUID)
  TO authenticated;

commit;
