create or replace function public.salvar_configuracao_turma_tecnica(
  p_turma_id uuid,
  p_config jsonb
)
returns public.turmas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma public.turmas%rowtype;
  v_data_inicio date;
  v_data_previsao_termino date;
  v_frequencia_minima numeric;
  v_media_minima numeric;
  v_today date := (pg_catalog.timezone('America/Maceio', pg_catalog.now()))::date;
begin
  if p_config is null or pg_catalog.jsonb_typeof(p_config) <> 'object' then
    raise exception 'Configuração da turma inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('technical_turma:' || p_turma_id::text, 0)
  );

  if not public.can_write_turma(p_turma_id) then
    raise exception 'Sem permissão para configurar esta turma.' using errcode = '42501';
  end if;

  select t.*
    into v_turma
  from public.turmas t
  join public.cursos c on c.id = t.curso_id
  where t.id = p_turma_id
    and c.modalidade = 'TECNICO'
  for update of t;

  if not found then
    raise exception 'Turma técnica não encontrada.';
  end if;

  v_data_inicio := case
    when p_config ? 'data_inicio' then nullif(p_config ->> 'data_inicio', '')::date
    else v_turma.data_inicio
  end;
  v_data_previsao_termino := case
    when p_config ? 'data_previsao_termino' then nullif(p_config ->> 'data_previsao_termino', '')::date
    else v_turma.data_previsao_termino
  end;
  v_frequencia_minima := case
    when p_config ? 'frequencia_minima_percent' then (p_config ->> 'frequencia_minima_percent')::numeric
    else v_turma.frequencia_minima_percent
  end;
  v_media_minima := case
    when p_config ? 'media_minima' then (p_config ->> 'media_minima')::numeric
    else v_turma.media_minima
  end;

  if v_data_inicio is distinct from v_turma.data_inicio
    or v_data_previsao_termino is distinct from v_turma.data_previsao_termino then
    update public.turmas
    set data_inicio = v_data_inicio,
        data_previsao_termino = v_data_previsao_termino
    where id = p_turma_id
    returning * into v_turma;
  end if;

  if v_frequencia_minima is distinct from v_turma.frequencia_minima_percent
    or v_media_minima is distinct from v_turma.media_minima then
    update public.turmas
    set frequencia_minima_percent = v_frequencia_minima,
        media_minima = v_media_minima
    where id = p_turma_id
    returning * into v_turma;
  end if;

  update public.turmas
  set
    nome = case
      when p_config ? 'nome' then pg_catalog.btrim(p_config ->> 'nome')
      else nome
    end,
    data_inicio_inscricao = case
      when p_config ? 'data_inicio_inscricao' then nullif(p_config ->> 'data_inicio_inscricao', '')::date
      else data_inicio_inscricao
    end,
    data_fim_inscricao = case
      when p_config ? 'data_fim_inscricao' then nullif(p_config ->> 'data_fim_inscricao', '')::date
      else data_fim_inscricao
    end,
    publicar_no_site = case
      when p_config ? 'publicar_no_site' then (p_config ->> 'publicar_no_site')::boolean
      else publicar_no_site
    end,
    permitir_inscricoes_online = case
      when p_config ? 'permitir_inscricoes_online' then (p_config ->> 'permitir_inscricoes_online')::boolean
      else permitir_inscricoes_online
    end,
    exige_matricula = case
      when p_config ? 'exige_matricula' then (p_config ->> 'exige_matricula')::boolean
      else exige_matricula
    end,
    aceita_concomitante = case
      when p_config ? 'aceita_concomitante' then (p_config ->> 'aceita_concomitante')::boolean
      else aceita_concomitante
    end,
    aceita_subsequente = case
      when p_config ? 'aceita_subsequente' then (p_config ->> 'aceita_subsequente')::boolean
      else aceita_subsequente
    end,
    serie_minima_ensino_medio = case
      when p_config ? 'serie_minima_ensino_medio' then (p_config ->> 'serie_minima_ensino_medio')::smallint
      else serie_minima_ensino_medio
    end,
    qtd_vagas_minima = case
      when p_config ? 'qtd_vagas_minima' then (p_config ->> 'qtd_vagas_minima')::integer
      else qtd_vagas_minima
    end,
    bloquear_matriculas_apos_completar_vagas = case
      when p_config ? 'bloquear_matriculas_apos_completar_vagas'
        then (p_config ->> 'bloquear_matriculas_apos_completar_vagas')::boolean
      else bloquear_matriculas_apos_completar_vagas
    end,
    origem_financeira = case
      when p_config ? 'origem_financeira' then pg_catalog.upper(p_config ->> 'origem_financeira')
      else origem_financeira
    end,
    financeiro_herdado = case
      when p_config ? 'financeiro_herdado' then (p_config ->> 'financeiro_herdado')::boolean
      else financeiro_herdado
    end,
    gerar_cobrancas_futuras = case
      when p_config ? 'gerar_cobrancas_futuras' then (p_config ->> 'gerar_cobrancas_futuras')::boolean
      else gerar_cobrancas_futuras
    end,
    sincronizar_asaas_futuro = case
      when p_config ? 'sincronizar_asaas_futuro' then (p_config ->> 'sincronizar_asaas_futuro')::boolean
      else sincronizar_asaas_futuro
    end,
    obs_financeira_origem = case
      when p_config ? 'obs_financeira_origem' then nullif(p_config ->> 'obs_financeira_origem', '')
      else obs_financeira_origem
    end
  where id = p_turma_id
  returning * into v_turma;

  if pg_catalog.btrim(v_turma.nome) = '' then
    raise exception 'Informe o nome da turma.';
  end if;

  if v_turma.data_inicio is not null
    and v_turma.data_previsao_termino is not null
    and v_turma.data_previsao_termino < v_turma.data_inicio then
    raise exception 'A previsão de término deve ser posterior ao início da turma.';
  end if;

  if v_turma.data_inicio_inscricao is not null
    and v_turma.data_fim_inscricao is not null
    and v_turma.data_fim_inscricao < v_turma.data_inicio_inscricao then
    raise exception 'O fim das inscrições deve ser posterior ao início das inscrições.';
  end if;

  if not v_turma.aceita_concomitante and not v_turma.aceita_subsequente then
    raise exception 'A turma técnica deve aceitar ingresso concomitante, subsequente ou ambos.';
  end if;

  if v_turma.serie_minima_ensino_medio not between 1 and 3 then
    raise exception 'A série mínima do Ensino Médio deve estar entre a 1ª e a 3ª série.';
  end if;

  if v_turma.qtd_vagas_minima < 0 then
    raise exception 'O limite de alunos online não pode ser negativo.';
  end if;

  if v_turma.frequencia_minima_percent < 0 or v_turma.frequencia_minima_percent > 100 then
    raise exception 'A frequência mínima deve estar entre 0 e 100 por cento.';
  end if;

  if v_turma.media_minima < 0 or v_turma.media_minima > 10 then
    raise exception 'A média mínima deve estar entre 0 e 10.';
  end if;

  if v_turma.origem_financeira not in ('NORMAL', 'LEGADO') then
    raise exception 'Origem financeira inválida.';
  end if;

  if v_turma.status = 'PLANEJADA'
    and v_turma.permitir_inscricoes_online
    and (v_turma.data_inicio_inscricao is null or v_today >= v_turma.data_inicio_inscricao)
    and (v_turma.data_fim_inscricao is null or v_today <= v_turma.data_fim_inscricao) then
    select *
      into v_turma
    from public.alterar_status_turma_tecnica(
      p_turma_id,
      'INSCRICOES_ABERTAS',
      null::uuid
    );
  end if;

  return v_turma;
end;
$function$;

revoke all on function public.salvar_configuracao_turma_tecnica(uuid, jsonb) from public;
grant execute on function public.salvar_configuracao_turma_tecnica(uuid, jsonb) to authenticated;
grant execute on function public.salvar_configuracao_turma_tecnica(uuid, jsonb) to service_role;

comment on function public.salvar_configuracao_turma_tecnica(uuid, jsonb) is
  'Salva a configuração técnica e, atomicamente, abre inscrições quando a janela vigente e a permissão online assim determinarem.';
