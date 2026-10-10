begin;
do $patch$
declare v_oid regprocedure; v_definition text; v_from text; v_to text;
begin
  -- Keep authorization and immutable replay ahead of the new-entry check.
  v_oid:='public.pre_vincular_aluno_tecnico_secure(uuid,uuid,uuid,date,integer,text)'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  v_from:=$old$  v_academic_status := case$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Pré-vínculo: admission boundary changed.'; end if;
  execute replace(v_definition,v_from,$new$  perform internal_academic.assert_technical_direct_admission(p_turma_id);
  v_academic_status := case$new$);

  foreach v_oid in array array[
    'public.receber_transferencia_tecnica_planejada_secure(uuid,uuid,uuid,text,text,text,text,date,jsonb,jsonb,text)'::regprocedure,
    'public.receber_transferencia_tecnica_v3_secure(uuid,uuid,uuid,text,text,text,text,date,jsonb,jsonb,text)'::regprocedure
  ] loop
    v_definition:=pg_get_functiondef(v_oid);
    v_from:=$old$  perform internal_academic.authorize_regular_technical_admission(v_enrollment,p_aluno_id,p_turma_destino_id,'ATIVO');$old$;
    if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
      raise exception 'Recebimento planejado: admission boundary changed.'; end if;
    execute replace(v_definition,v_from,v_from||$new$
  perform internal_academic.authorize_technical_transfer_admission(
    v_enrollment,p_aluno_id,p_turma_destino_id,'EXTERNA_RECEBIDA');$new$);
  end loop;

  v_oid:='internal_academic.legacy_transferir_matricula_academica(uuid,text,text,uuid,text,text,date,uuid)'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  v_from:=$old$      v_new_id:=gen_random_uuid();$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Transferência interna: admission boundary changed.'; end if;
  execute replace(v_definition,v_from,v_from||$new$
      perform internal_academic.authorize_technical_transfer_admission(
        v_new_id,v_source.aluno_id,p_turma_destino_id,v_type,v_source.id);$new$);

  v_oid:='internal_academic.legacy_receber_transferencia_externa(uuid,uuid,text,text,text,text,date,uuid)'::regprocedure;
  v_definition:=pg_get_functiondef(v_oid);
  v_from:=$old$DECLARE v public.matriculas%ROWTYPE; transf uuid;$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Recebimento legado: declaration changed.'; end if;
  v_definition:=replace(v_definition,v_from,v_from||' v_admission_id uuid:=gen_random_uuid();');
  v_from:=$old$ INSERT INTO public.matriculas(aluno_id,turma_id,status,data_matricula) VALUES(p_aluno_id,p_turma_destino_id,'ATIVO',$old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Recebimento legado: admission boundary changed.'; end if;
  execute replace(v_definition,v_from,$new$ PERFORM internal_academic.authorize_technical_transfer_admission(
   v_admission_id,p_aluno_id,p_turma_destino_id,'EXTERNA_RECEBIDA');
 INSERT INTO public.matriculas(id,aluno_id,turma_id,status,data_matricula) VALUES(v_admission_id,p_aluno_id,p_turma_destino_id,'ATIVO',$new$);

  foreach v_oid in array array[
    'public.payment_checkout_upsert_matricula(uuid,uuid,boolean)'::regprocedure,
    'public.asaas_checkout_upsert_matricula(uuid,uuid,boolean)'::regprocedure
  ] loop
    v_definition:=pg_get_functiondef(v_oid);
    v_from:=$old$  if v_modalidade in ('TECNICO', 'TÉCNICO') then$old$;
    if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
      raise exception 'Checkout: technical boundary changed.'; end if;
    execute replace(v_definition,v_from,v_from||$new$
    if not exists(select 1 from public.matriculas where aluno_id=p_aluno_id and turma_id=p_turma_id) then
      perform internal_academic.assert_technical_direct_admission(p_turma_id);
    end if;$new$);
  end loop;
end;
$patch$;
CREATE OR REPLACE FUNCTION public.list_public_technical_classes(p_limit integer DEFAULT 3, p_turma_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(turma_id uuid, curso_id uuid, curso_nome text, curso_descricao text, curso_area text, curso_carga_horaria integer, curso_duracao_meses integer, curso_imagem_url text, landing_template_key text, turma_nome text, turma_codigo text, turma_status text, turno text, data_inicio date, data_previsao_termino date, data_inicio_inscricao date, data_fim_inscricao date, vagas_totais integer, vagas_ocupadas bigint, vagas_disponiveis integer, inscricoes_online_disponiveis boolean, situacao_vagas text, valor_matricula numeric, valor_rematricula numeric, qtd_parcelas integer, valor_parcela numeric, desconto_pontualidade numeric, aplicar_desconto_mensalidade boolean, valor_parcela_com_desconto numeric, dia_vencimento_padrao integer, aceita_concomitante boolean, aceita_subsequente boolean, serie_minima_ensino_medio smallint, polo_id uuid, polo_nome text, polo_cidade text, polo_estado text, polo_endereco text, polo_numero text, polo_bairro text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with public_turmas as (
    select
      t.*,
      c.nome as c_nome,
      c.descricao as c_descricao,
      c.area as c_area,
      c.carga_horaria as c_carga_horaria,
      c.duracao_meses as c_duracao_meses,
      c.imagem_url as c_imagem_url,
      c.landing_template_key as c_template_key,
      p.nome as p_nome,
      p.cidade as p_cidade,
      p.estado as p_estado,
      p.endereco as p_endereco,
      p.numero as p_numero,
      p.bairro as p_bairro,
      count(distinct m.aluno_id) filter (
        where upper(coalesce(m.status, '')) in (
          'PENDENTE',
          'ATIVO',
          'CONCLUIDO',
          'AGUARDANDO_PAGAMENTO',
          'AGUARDANDO_CONFIRMACAO'
        )
      ) as ocupadas,
      coalesce(t.vagas_totais, 0) as capacidade_online,
      (pg_catalog.timezone('America/Maceio', now()))::date as hoje
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.polos p on p.id = t.polo_id
    left join public.matriculas m on m.turma_id = t.id
    where c.modalidade = 'TECNICO'
      and lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false)
      and coalesce(t.publicar_no_site, false)
      and t.status in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      and (p_turma_id is null or t.id = p_turma_id)
    group by t.id, c.id, p.id
  ), admission as materialized (
    select pt.*,internal_academic.technical_class_admission_policy(pt.id) as ingresso
    from public_turmas pt
  ), evaluated as (
    select
      pt.*,
      (
        coalesce(pt.permitir_inscricoes_online, false)
        and pt.status in ('INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
        and (pt.ingresso->>'matriculaDiretaPermitida')::boolean
        and (pt.data_inicio_inscricao is null or pt.data_inicio_inscricao <= pt.hoje)
        and (pt.data_fim_inscricao is null or pt.data_fim_inscricao >= pt.hoje)
        and (
          not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
          or pt.capacidade_online <= 0
          or pt.ocupadas < pt.capacidade_online
        )
      ) as online_disponivel
    from admission pt
  )
  select
    pt.id,
    pt.curso_id,
    pt.c_nome::text,
    coalesce(pt.c_descricao, '')::text,
    coalesce(pt.c_area, 'Formação técnica')::text,
    coalesce(pt.c_carga_horaria, 0)::integer,
    pt.c_duracao_meses::integer,
    pt.c_imagem_url::text,
    pt.c_template_key::text,
    pt.nome::text,
    coalesce(pt.codigo, '')::text,
    pt.status::text,
    coalesce(pt.turno, 'A DEFINIR')::text,
    pt.data_inicio,
    pt.data_previsao_termino,
    pt.data_inicio_inscricao,
    pt.data_fim_inscricao,
    coalesce(pt.vagas_totais, 0)::integer,
    pt.ocupadas,
    greatest(pt.capacidade_online - pt.ocupadas::integer, 0)::integer,
    pt.online_disponivel,
    case
      when pt.ingresso->>'motivo'='PRAZO_EXPIRADO'
        then 'ENTRADA SOMENTE POR TRANSFERÊNCIA'
      when pt.ingresso->>'motivo'='DATA_INICIO_AUSENTE'
        then 'DATA DE INÍCIO PENDENTE'
      when not coalesce(pt.permitir_inscricoes_online, false) then 'ATENDIMENTO PRESENCIAL'
      when pt.status = 'PLANEJADA'
        or (pt.data_inicio_inscricao is not null and pt.data_inicio_inscricao > pt.hoje)
        then 'INSCRIÇÕES EM BREVE'
      when pt.data_fim_inscricao is not null and pt.data_fim_inscricao < pt.hoje
        then 'INSCRIÇÕES ENCERRADAS'
      when coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        and pt.capacidade_online > 0 and pt.ocupadas >= pt.capacidade_online
        then 'VAGAS ESGOTADAS'
      when not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        then 'VAGAS DISPONÍVEIS'
      when pt.capacidade_online > 0 and pt.capacidade_online - pt.ocupadas <= 5
        then 'ÚLTIMAS VAGAS'
      else 'VAGAS DISPONÍVEIS'
    end::text,
    coalesce(pt.valor_matricula, 0)::numeric,
    coalesce(pt.valor_rematricula, 0)::numeric,
    coalesce(pt.qtd_parcelas, 0)::integer,
    coalesce(pt.valor_parcela, 0)::numeric,
    preview.desconto_aplicado,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    preview.valor_com_desconto,
    coalesce(pt.dia_vencimento_padrao, 10)::integer,
    coalesce(pt.aceita_concomitante, false),
    coalesce(pt.aceita_subsequente, true),
    coalesce(pt.serie_minima_ensino_medio, 2)::smallint,
    pt.polo_id,
    pt.p_nome::text,
    coalesce(pt.p_cidade, '')::text,
    coalesce(pt.p_estado, '')::text,
    pt.p_endereco::text,
    pt.p_numero::text,
    pt.p_bairro::text
  from evaluated pt
  cross join lateral public.calculate_gestao_technical_financial_preview(
    coalesce(pt.valor_parcela, 0),
    coalesce(pt.desconto_pontualidade, 0),
    0,
    0,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    false
  ) preview
  order by pt.data_inicio nulls last, pt.c_nome, pt.nome
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$function$
;

CREATE FUNCTION internal_academic.public_technical_class_ingress_rows(p_limit integer, p_turma_id uuid, p_curso_id uuid)
 RETURNS TABLE(turma_id uuid, curso_id uuid, curso_nome text, curso_descricao text, curso_area text, curso_carga_horaria integer, curso_duracao_meses integer, curso_imagem_url text, landing_template_key text, turma_nome text, turma_codigo text, turma_status text, turno text, data_inicio date, data_previsao_termino date, data_inicio_inscricao date, data_fim_inscricao date, vagas_totais integer, vagas_ocupadas bigint, vagas_disponiveis integer, inscricoes_online_disponiveis boolean, situacao_vagas text, valor_matricula numeric, valor_rematricula numeric, qtd_parcelas integer, valor_parcela numeric, desconto_pontualidade numeric, aplicar_desconto_mensalidade boolean, valor_parcela_com_desconto numeric, dia_vencimento_padrao integer, aceita_concomitante boolean, aceita_subsequente boolean, serie_minima_ensino_medio smallint, polo_id uuid, polo_nome text, polo_cidade text, polo_estado text, polo_endereco text, polo_numero text, polo_bairro text, ingresso jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with public_turmas as (
    select
      t.*,
      c.nome as c_nome,
      c.descricao as c_descricao,
      c.area as c_area,
      c.carga_horaria as c_carga_horaria,
      c.duracao_meses as c_duracao_meses,
      c.imagem_url as c_imagem_url,
      c.landing_template_key as c_template_key,
      p.nome as p_nome,
      p.cidade as p_cidade,
      p.estado as p_estado,
      p.endereco as p_endereco,
      p.numero as p_numero,
      p.bairro as p_bairro,
      count(distinct m.aluno_id) filter (
        where upper(coalesce(m.status, '')) in (
          'PENDENTE',
          'ATIVO',
          'CONCLUIDO',
          'AGUARDANDO_PAGAMENTO',
          'AGUARDANDO_CONFIRMACAO'
        )
      ) as ocupadas,
      coalesce(t.vagas_totais, 0) as capacidade_online,
      (pg_catalog.timezone('America/Maceio', now()))::date as hoje
    from public.turmas t
    join public.cursos c on c.id = t.curso_id
    join public.polos p on p.id = t.polo_id
    left join public.matriculas m on m.turma_id = t.id
    where c.modalidade = 'TECNICO'
      and lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false)
      and coalesce(t.publicar_no_site, false)
      and t.status in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      and (p_turma_id is null or t.id = p_turma_id)
      and (p_curso_id is null or t.curso_id = p_curso_id)
    group by t.id, c.id, p.id
  ), admission as materialized (
    select pt.*,internal_academic.technical_class_admission_policy(pt.id) as ingresso
    from public_turmas pt
  ), evaluated as (
    select
      pt.*,
      (
        coalesce(pt.permitir_inscricoes_online, false)
        and pt.status in ('INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
        and (pt.ingresso->>'matriculaDiretaPermitida')::boolean
        and (pt.data_inicio_inscricao is null or pt.data_inicio_inscricao <= pt.hoje)
        and (pt.data_fim_inscricao is null or pt.data_fim_inscricao >= pt.hoje)
        and (
          not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
          or pt.capacidade_online <= 0
          or pt.ocupadas < pt.capacidade_online
        )
      ) as online_disponivel
    from admission pt
  )
  select
    pt.id,
    pt.curso_id,
    pt.c_nome::text,
    coalesce(pt.c_descricao, '')::text,
    coalesce(pt.c_area, 'Formação técnica')::text,
    coalesce(pt.c_carga_horaria, 0)::integer,
    pt.c_duracao_meses::integer,
    pt.c_imagem_url::text,
    pt.c_template_key::text,
    pt.nome::text,
    coalesce(pt.codigo, '')::text,
    pt.status::text,
    coalesce(pt.turno, 'A DEFINIR')::text,
    pt.data_inicio,
    pt.data_previsao_termino,
    pt.data_inicio_inscricao,
    pt.data_fim_inscricao,
    coalesce(pt.vagas_totais, 0)::integer,
    pt.ocupadas,
    greatest(pt.capacidade_online - pt.ocupadas::integer, 0)::integer,
    pt.online_disponivel,
    case
      when pt.ingresso->>'motivo'='PRAZO_EXPIRADO'
        then 'ENTRADA SOMENTE POR TRANSFERÊNCIA'
      when pt.ingresso->>'motivo'='DATA_INICIO_AUSENTE'
        then 'DATA DE INÍCIO PENDENTE'
      when not coalesce(pt.permitir_inscricoes_online, false) then 'ATENDIMENTO PRESENCIAL'
      when pt.status = 'PLANEJADA'
        or (pt.data_inicio_inscricao is not null and pt.data_inicio_inscricao > pt.hoje)
        then 'INSCRIÇÕES EM BREVE'
      when pt.data_fim_inscricao is not null and pt.data_fim_inscricao < pt.hoje
        then 'INSCRIÇÕES ENCERRADAS'
      when coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        and pt.capacidade_online > 0 and pt.ocupadas >= pt.capacidade_online
        then 'VAGAS ESGOTADAS'
      when not coalesce(pt.bloquear_matriculas_apos_completar_vagas, true)
        then 'VAGAS DISPONÍVEIS'
      when pt.capacidade_online > 0 and pt.capacidade_online - pt.ocupadas <= 5
        then 'ÚLTIMAS VAGAS'
      else 'VAGAS DISPONÍVEIS'
    end::text,
    coalesce(pt.valor_matricula, 0)::numeric,
    coalesce(pt.valor_rematricula, 0)::numeric,
    coalesce(pt.qtd_parcelas, 0)::integer,
    coalesce(pt.valor_parcela, 0)::numeric,
    preview.desconto_aplicado,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    preview.valor_com_desconto,
    coalesce(pt.dia_vencimento_padrao, 10)::integer,
    coalesce(pt.aceita_concomitante, false),
    coalesce(pt.aceita_subsequente, true),
    coalesce(pt.serie_minima_ensino_medio, 2)::smallint,
    pt.polo_id,
    pt.p_nome::text,
    coalesce(pt.p_cidade, '')::text,
    coalesce(pt.p_estado, '')::text,
    pt.p_endereco::text,
    pt.p_numero::text,
    pt.p_bairro::text,
    pt.ingresso
  from evaluated pt
  cross join lateral public.calculate_gestao_technical_financial_preview(
    coalesce(pt.valor_parcela, 0),
    coalesce(pt.desconto_pontualidade, 0),
    0,
    0,
    coalesce(pt.aplicar_desconto_mensalidade, false),
    false
  ) preview
  order by pt.data_inicio nulls last, pt.c_nome, pt.nome
  limit case when p_limit is null then null else greatest(1,least(p_limit,1000)) end;
$function$
;

create function public.list_public_technical_classes_ingresso(
  p_limit integer default 20,p_turma_id uuid default null,p_curso_id uuid default null
)
returns jsonb language sql stable security definer set search_path='' as $function$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.data_inicio nulls last,r.curso_nome,r.turma_nome),'[]'::jsonb)
  from internal_academic.public_technical_class_ingress_rows(p_limit,p_turma_id,p_curso_id) r;
$function$;
revoke all on function internal_academic.public_technical_class_ingress_rows(integer,uuid,uuid),
  public.list_public_technical_classes_ingresso(integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_public_technical_classes_ingresso(integer,uuid,uuid) to anon,authenticated,service_role;

-- Activate both fences atomically with the official transfer entrypoint changes.
create trigger a00_guard_technical_admission_window before insert or update of aluno_id,turma_id
  on public.matriculas for each row execute function internal_academic.guard_technical_admission_window();
create constraint trigger complete_technical_transfer_admission after insert on public.matriculas
  deferrable initially deferred for each row execute function internal_academic.complete_technical_transfer_admission();
notify pgrst,'reload schema';
commit;
