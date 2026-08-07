create or replace function public.get_my_comunicacao_atendimento_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_result jsonb;
begin
  if v_aluno_id is null then
    raise exception 'Aluno autenticado não encontrado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'polo_id', p.polo_id,
    'polo_nome', coalesce(po.nome, 'Universo Cursos'),
    'status_modo', coalesce(cfg.status_modo, 'automatico'),
    'permite_chat_app', coalesce(cfg.permite_chat_app, true),
    'permite_novo_chamado', coalesce(cfg.permite_novo_chamado, true),
    'solicitar_notificacao_resposta', coalesce(cfg.solicitar_notificacao_resposta, true),
    'tempo_medio_resposta_minutos', coalesce(cfg.tempo_medio_resposta_minutos, 120),
    'mensagem_online', coalesce(cfg.mensagem_online, 'Olá! Nossa equipe está online e responderá o mais rápido possível.'),
    'mensagem_offline', coalesce(cfg.mensagem_offline, 'Não temos atendentes online neste momento. Deixe sua mensagem e retornaremos o mais rápido possível.'),
    'texto_notificacao_optin', coalesce(cfg.texto_notificacao_optin, 'Ative as notificações para ser avisado quando sua solicitação for respondida.'),
    'horarios', coalesce(
      cfg.horarios,
      '{"1":{"ativo":true,"inicio":"08:00","fim":"18:00"},"2":{"ativo":true,"inicio":"08:00","fim":"18:00"},"3":{"ativo":true,"inicio":"08:00","fim":"18:00"},"4":{"ativo":true,"inicio":"08:00","fim":"18:00"},"5":{"ativo":true,"inicio":"08:00","fim":"18:00"},"6":{"ativo":false,"inicio":"08:00","fim":"12:00"},"0":{"ativo":false,"inicio":"08:00","fim":"12:00"}}'::jsonb
    )
  )
  into v_result
  from public.parceiros p
  left join public.polos po on po.id = p.polo_id
  left join public.comunicacao_atendimento_config cfg on cfg.polo_id = p.polo_id
  where p.id = v_aluno_id;

  if v_result is null then
    raise exception 'Cadastro do aluno não encontrado.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_my_comunicacao_atendimento_config() from public, anon;
grant execute on function public.get_my_comunicacao_atendimento_config() to authenticated;

comment on function public.get_my_comunicacao_atendimento_config() is
  'Retorna somente a configuração de atendimento do polo do aluno autenticado.';

create or replace function public.create_my_comunicacao_chat(
  p_categoria_id uuid,
  p_categoria_nome text,
  p_assunto text,
  p_notificar_resposta boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_aluno_nome text;
  v_polo_id uuid;
  v_permite_chat_app boolean := true;
  v_permite_novo_chamado boolean := true;
  v_chat public.comunicacao_chats%rowtype;
  v_assunto text := btrim(coalesce(p_assunto, ''));
  v_categoria_nome text := left(btrim(coalesce(p_categoria_nome, 'Suporte')), 120);
  v_protocolo text;
begin
  if v_aluno_id is null then
    raise exception 'Aluno autenticado não encontrado.' using errcode = '42501';
  end if;

  if length(v_assunto) < 3 or length(v_assunto) > 2000 then
    raise exception 'Descreva o atendimento usando entre 3 e 2000 caracteres.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.comunicacao_categorias c
    where c.id = p_categoria_id and c.ativo is true
  ) then
    raise exception 'Categoria de atendimento inválida.' using errcode = '22023';
  end if;

  select p.nome, p.polo_id
  into v_aluno_nome, v_polo_id
  from public.parceiros p
  where p.id = v_aluno_id
    and p.tipo = 'Aluno'
    and public.is_active_status(p.status);

  if v_aluno_nome is null then
    raise exception 'Cadastro ativo do aluno não encontrado.' using errcode = 'P0002';
  end if;

  select cfg.permite_chat_app, cfg.permite_novo_chamado
  into v_permite_chat_app, v_permite_novo_chamado
  from public.comunicacao_atendimento_config cfg
  where cfg.polo_id = v_polo_id;

  if coalesce(v_permite_chat_app, true) is false then
    raise exception 'O atendimento pelo aplicativo está indisponível neste polo.' using errcode = 'P0001';
  end if;

  if coalesce(v_permite_novo_chamado, true) is false then
    raise exception 'A abertura de novos chamados está temporariamente indisponível.' using errcode = 'P0001';
  end if;

  v_protocolo := 'APP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.comunicacao_chats (
    remetente_id,
    remetente_nome,
    remetente_tipo,
    categoria_id,
    status,
    ultimo_texto,
    ultima_data,
    origem,
    polo_id,
    setor,
    assunto,
    protocolo,
    notificar_resposta
  ) values (
    v_aluno_id,
    v_aluno_nome,
    'Aluno',
    p_categoria_id,
    'pendente',
    v_assunto,
    now(),
    'app',
    v_polo_id,
    lower(regexp_replace(v_categoria_nome, '[^a-zA-Z0-9]+', '_', 'g')),
    v_assunto,
    v_protocolo,
    coalesce(p_notificar_resposta, false)
  ) returning * into v_chat;

  insert into public.comunicacao_mensagens (
    chat_id,
    remetente_id,
    remetente_nome,
    remetente_tipo,
    conteudo
  ) values (
    v_chat.id,
    v_aluno_id,
    v_aluno_nome,
    'aluno',
    v_assunto
  );

  return to_jsonb(v_chat);
end;
$$;

revoke all on function public.create_my_comunicacao_chat(uuid, text, text, boolean) from public, anon;
grant execute on function public.create_my_comunicacao_chat(uuid, text, text, boolean) to authenticated;

comment on function public.create_my_comunicacao_chat(uuid, text, text, boolean) is
  'Abre atomicamente um chamado do aluno autenticado, respeitando a configuração do polo.';
