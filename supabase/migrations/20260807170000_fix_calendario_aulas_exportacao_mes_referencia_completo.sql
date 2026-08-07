-- O período da exportação é canônico: recebe o mês ativo da agenda e limita àquele
-- mês. O navegador não pode filtrar, ordenar nem reintroduzir linhas fora desse intervalo.

create or replace function public.preparar_calendario_aulas_exportacao_secure(
  p_polo_id uuid,
  p_modalidade text,
  p_turma_id uuid,
  p_mes_referencia date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_modalidade text := upper(btrim(coalesce(p_modalidade, '')));
  v_mes_referencia date;
  v_inicio_periodo date;
  v_fim_periodo date;
  v_turma record;
  v_model public.documentos_modelos_configuracoes%rowtype;
  v_linhas jsonb;
  v_modulos text;
  v_status text;
  v_mensagem text;
begin
  if p_mes_referencia is null
    or date_trunc('month', p_mes_referencia)::date <> p_mes_referencia then
    raise exception 'O mês de referência do calendário é inválido.' using errcode = '22023';
  end if;

  v_mes_referencia := p_mes_referencia;
  v_inicio_periodo := v_mes_referencia;
  v_fim_periodo := (v_mes_referencia + interval '1 month')::date;

  if not public.can_manage_calendario_aulas(p_polo_id) then
    raise exception 'Acesso ao calendário do polo não autorizado.' using errcode = '42501';
  end if;

  if v_modalidade not in ('TECNICO', 'LIVRE', 'SUPERIOR', 'EAD') then
    raise exception 'Modalidade de calendário inválida.' using errcode = '22023';
  end if;

  select
    class.id as turma_id,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    upper(course.modalidade) as modalidade,
    pole.nome as polo_nome,
    pole.cnpj as polo_cnpj,
    coalesce(nullif(btrim(pole.telefone), ''), nullif(btrim(company.telefone), '')) as polo_telefone,
    coalesce(nullif(btrim(pole.email), ''), nullif(btrim(company.email), '')) as polo_email,
    coalesce(nullif(btrim(pole.endereco), ''), nullif(btrim(company.endereco), '')) as polo_endereco,
    coalesce(nullif(btrim(pole.numero), ''), nullif(btrim(company.numero), '')) as polo_numero,
    coalesce(nullif(btrim(pole.bairro), ''), nullif(btrim(company.bairro), '')) as polo_bairro,
    pole.cidade as polo_cidade,
    pole.estado as polo_estado,
    coalesce(nullif(btrim(pole.cep), ''), nullif(btrim(company.cep), '')) as polo_cep,
    coalesce(pole.is_matriz, false) as polo_is_matriz,
    coalesce(nullif(btrim(pole.logo_url), ''), nullif(btrim(company.logo_url), '')) as logo_url,
    pole.watermark_url,
    pole.watermark_opacity,
    pole.watermark_scale,
    pole.watermark_rotate
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  join public.polos pole on pole.id = class.polo_id
  left join public.empresas company on company.id = pole.company_id
  where class.id = p_turma_id
    and class.polo_id = p_polo_id
    and upper(coalesce(course.modalidade, '')) = v_modalidade;

  if not found then
    raise exception 'Turma incompatível com o polo ou a modalidade selecionada.'
      using errcode = '42501';
  end if;

  select model.*
  into v_model
  from public.documentos_modelos_configuracoes model
  where model.template_key = 'calendario_aulas'
    and model.modalidade in (v_modalidade, 'GERAL')
  order by case when model.modalidade = v_modalidade then 0 else 1 end
  limit 1
  for share;

  if not found or v_model.status <> 'ATIVO' then
    raise exception 'O modelo de calendário desta modalidade não está ativo.'
      using errcode = '55000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'componente_curricular', calendar_line.componente_curricular,
        'data_exibicao', to_char(calendar_line.data_aula, 'DD/MM/YY'),
        'horario_exibicao', case
          when calendar_line.tem_horario
            then to_char(calendar_line.hora_inicio, 'HH24:MI') || ' – ' || to_char(calendar_line.hora_fim, 'HH24:MI')
          else coalesce(nullif(v_model.conteudo ->> 'observacaoSemHorario', ''), 'Horário não informado')
        end,
        -- A última coluna é exclusivamente a identificação do professor;
        -- títulos/observações de aula não são parte do calendário oficial.
        'professores_observacao', calendar_line.professor_nome
      ) order by
        calendar_line.data_aula,
        calendar_line.modulo_ordem,
        calendar_line.disciplina_ordem,
        calendar_line.hora_inicio nulls last,
        calendar_line.componente_curricular
    ),
    '[]'::jsonb
  )
  into v_linhas
  from (
    select
      subject.nome as componente_curricular,
      class_meeting.data_aula,
      min(class_meeting.hora_inicio) as hora_inicio,
      max(class_meeting.hora_fim) as hora_fim,
      bool_and(class_meeting.hora_inicio is not null and class_meeting.hora_fim is not null) as tem_horario,
      coalesce(module.ordem, 999999) as modulo_ordem,
      coalesce(subject.ordem, 999999) as disciplina_ordem,
      coalesce(
        nullif(btrim(teacher.nome), ''),
        nullif(btrim(class_subject.professor_nome), ''),
        'Professor não informado'
      ) as professor_nome
    from public.aulas_turma class_meeting
    join public.disciplinas subject on subject.id = class_meeting.disciplina_id
    left join public.modulos module on module.id = subject.modulo_id
    left join public.turmas_disciplinas class_subject
      on class_subject.turma_id = class_meeting.turma_id
      and class_subject.disciplina_id = class_meeting.disciplina_id
    left join public.parceiros teacher on teacher.id = class_subject.professor_id
    where class_meeting.turma_id = p_turma_id
      and class_meeting.data_aula >= v_inicio_periodo
      and class_meeting.data_aula < v_fim_periodo
    group by
      subject.nome,
      class_meeting.data_aula,
      module.ordem,
      subject.ordem,
      teacher.nome,
      class_subject.professor_nome
  ) calendar_line;

  select nullif(string_agg(distinct module.nome, ' • ' order by module.nome), '')
  into v_modulos
  from public.aulas_turma class_meeting
  join public.disciplinas subject on subject.id = class_meeting.disciplina_id
  left join public.modulos module on module.id = subject.modulo_id
  where class_meeting.turma_id = p_turma_id
    and class_meeting.data_aula >= v_inicio_periodo
    and class_meeting.data_aula < v_fim_periodo;

  if jsonb_array_length(v_linhas) > 0 then
    v_status := 'PRONTO';
    v_mensagem := null;
  elsif v_modalidade = 'EAD' then
    v_status := 'EAD_SEM_GRADE';
    v_mensagem := 'Esta turma EAD não possui aulas datadas no mês selecionado.';
  elsif v_inicio_periodo >= v_fim_periodo then
    v_status := 'SEM_GRADE';
    v_mensagem := 'O mês selecionado não possui aulas para exportar.';
  else
    v_status := 'SEM_GRADE';
    v_mensagem := 'Não há aulas no mês selecionado para esta turma.';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'mensagem', v_mensagem,
    'documento', jsonb_build_object(
      'titulo', coalesce(nullif(v_model.conteudo ->> 'title', ''), 'Calendário de Aulas'),
      'subtitulo', replace(
        replace(
          replace(coalesce(nullif(v_model.conteudo ->> 'subtitulo', ''), '{{CURSO}} · {{TURMA}}'),
            '{{CURSO}}', v_turma.curso_nome
          ),
          '{{TURMA}}', concat_ws(' — ', v_turma.turma_nome, nullif(v_turma.turma_codigo, ''))
        ),
        '{{MODULO}}', coalesce(v_modulos, '')
      ),
      'rodape', coalesce(nullif(v_model.conteudo ->> 'rodape', ''), 'Calendário gerado eletronicamente pela Universo Cursos e Consultoria.'),
      'cabecalhos_tabela', jsonb_build_object(
        'componente', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,componente}', ''),
          'Componente curricular'
        ),
        'data', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,data}', ''),
          'Data'
        ),
        'horario', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,horario}', ''),
          'Horário'
        ),
        'professor_observacao', coalesce(
          nullif(v_model.conteudo #>> '{cabecalhosTabela,professorObservacao}', ''),
          'Professor(a)'
        )
      ),
      'exibir_marca_dagua', lower(coalesce(v_model.conteudo ->> 'exibirMarcaDagua', 'true')) <> 'false',
      'exibir_modulo', lower(coalesce(v_model.conteudo ->> 'exibirModulo', 'true')) <> 'false',
      'instituicao', v_turma.polo_nome,
      'polo', v_turma.polo_nome,
      'curso', v_turma.curso_nome,
      'turma', concat_ws(' — ', v_turma.turma_nome, nullif(v_turma.turma_codigo, '')),
      'modulo', v_modulos,
      'cabecalho_institucional', jsonb_strip_nulls(jsonb_build_object(
        'nome', v_turma.polo_nome,
        'cnpj', v_turma.polo_cnpj,
        'contato', v_turma.polo_telefone,
        'email', v_turma.polo_email,
        'endereco', v_turma.polo_endereco,
        'numero', v_turma.polo_numero,
        'bairro', v_turma.polo_bairro,
        'cidade', v_turma.polo_cidade,
        'estado', v_turma.polo_estado,
        'cep', v_turma.polo_cep,
        'is_matriz', v_turma.polo_is_matriz,
        'logo_url', v_turma.logo_url
      )),
      'marca_dagua_texto', coalesce(
        nullif(v_model.conteudo ->> 'watermarkText', ''),
        v_turma.polo_nome
      ),
      'marca_dagua_url', nullif(btrim(v_turma.watermark_url), ''),
      'marca_dagua_data_uri', case
        when v_turma.watermark_url like 'data:image/%' then v_turma.watermark_url
        else null
      end,
      'marca_dagua_opacidade', v_turma.watermark_opacidade,
      'marca_dagua_escala', v_turma.watermark_scale,
      'marca_dagua_rotacionar', coalesce(v_turma.watermark_rotate, true),
      'logo_data_uri', case
        when v_turma.logo_url like 'data:image/%' then v_turma.logo_url
        else null
      end,
      'arquivo_nome', lower(regexp_replace(
        'calendario-' || coalesce(v_turma.turma_codigo, v_turma.turma_nome) || '-' || to_char(v_mes_referencia, 'YYYY-MM'),
        '[^a-zA-Z0-9]+', '-', 'g'
      )) || '.pdf',
      'emitido_em', to_char(clock_timestamp(), 'DD/MM/YYYY HH24:MI'),
      'template_revision', v_model.revisao,
      'template', v_model.conteudo
    ),
    'linhas', v_linhas
  );
end;
$function$;

-- Enquanto uma sessão antiga ainda estiver carregada, a assinatura anterior
-- continua funcional e delega para o mês corrente. A UI atual sempre envia
-- os quatro parâmetros e, portanto, não perde o mês escolhido pelo gestor.
create or replace function public.preparar_calendario_aulas_exportacao_secure(
  p_polo_id uuid,
  p_modalidade text,
  p_turma_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $function$
  select public.preparar_calendario_aulas_exportacao_secure(
    p_polo_id,
    p_modalidade,
    p_turma_id,
    date_trunc('month', current_date)::date
  );
$function$;

-- O modelo também passa a nomear corretamente a coluna. O registro de
-- histórico preserva a revisão gerada por esta atualização institucional.
with modelos_atualizados as (
  update public.documentos_modelos_configuracoes model
  set
    conteudo = jsonb_set(
      model.conteudo,
      '{cabecalhosTabela}',
      coalesce(model.conteudo -> 'cabecalhosTabela', '{}'::jsonb)
        || jsonb_build_object('professorObservacao', 'Professor(a)'),
      true
    ),
    revisao = model.revisao + 1,
    atualizado_por = null,
    updated_at = clock_timestamp()
  where model.template_key = 'calendario_aulas'
    and model.conteudo #>> '{cabecalhosTabela,professorObservacao}'
      is distinct from 'Professor(a)'
  returning model.*
)
insert into public.documentos_modelos_historico (
  template_key,
  modalidade,
  revisao,
  status,
  conteudo,
  atualizado_por,
  request_id,
  created_at
)
select
  template_key,
  modalidade,
  revisao,
  status,
  conteudo,
  atualizado_por,
  null,
  updated_at
from modelos_atualizados
on conflict (template_key, modalidade, revisao) do nothing;

revoke all on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid, date)
  from public, anon;
grant execute on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid, date)
  to authenticated, service_role;

revoke all on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid)
  from public, anon;
grant execute on function public.preparar_calendario_aulas_exportacao_secure(uuid, text, uuid)
  to authenticated, service_role;
