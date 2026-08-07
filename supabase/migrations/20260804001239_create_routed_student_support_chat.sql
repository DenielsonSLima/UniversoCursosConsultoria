begin;

create or replace function public.create_my_routed_comunicacao_chat(
  p_setor text,
  p_assunto text,
  p_mensagem text,
  p_polo_label text default null,
  p_notificar_resposta boolean default false,
  p_origem text default 'portal'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_aluno_nome text;
  v_aluno_polo_id uuid;
  v_destino_polo_id uuid;
  v_categoria_id uuid;
  v_categoria_nome text;
  v_permite_chat_app boolean := true;
  v_permite_novo_chamado boolean := true;
  v_chat public.comunicacao_chats%rowtype;
  v_setor text := lower(btrim(coalesce(p_setor, '')));
  v_assunto text := left(btrim(coalesce(p_assunto, '')), 180);
  v_mensagem text := btrim(coalesce(p_mensagem, ''));
  v_polo_label text := nullif(left(btrim(coalesce(p_polo_label, '')), 120), '');
  v_origem text := lower(btrim(coalesce(p_origem, 'portal')));
  v_protocolo text;
begin
  if v_aluno_id is null then
    raise exception 'Aluno autenticado não encontrado.' using errcode = '42501';
  end if;

  if v_setor not in (
    'pedagogico_coordenacao',
    'financeiro',
    'comercial_matriculas',
    'secretaria',
    'atendimento_geral'
  ) then
    raise exception 'Setor de atendimento inválido.' using errcode = '22023';
  end if;

  if length(v_assunto) < 1 then
    raise exception 'Assunto do atendimento inválido.' using errcode = '22023';
  end if;

  if length(v_mensagem) < 3 or length(v_mensagem) > 4000 then
    raise exception 'Descreva o atendimento usando entre 3 e 4000 caracteres.' using errcode = '22023';
  end if;

  if v_origem not in ('app', 'portal') then
    raise exception 'Origem do atendimento inválida.' using errcode = '22023';
  end if;

  select p.nome, p.polo_id
  into v_aluno_nome, v_aluno_polo_id
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
  where cfg.polo_id = v_aluno_polo_id;

  if coalesce(v_permite_chat_app, true) is false then
    raise exception 'O atendimento pelo aplicativo está indisponível neste polo.' using errcode = 'P0001';
  end if;

  if coalesce(v_permite_novo_chamado, true) is false then
    raise exception 'A abertura de novos chamados está temporariamente indisponível.' using errcode = 'P0001';
  end if;

  v_categoria_nome := case v_setor
    when 'financeiro' then 'Financeira'
    when 'pedagogico_coordenacao' then 'Pedagógica'
    when 'secretaria' then 'Secretaria'
    when 'comercial_matriculas' then 'Secretaria'
    else 'Suporte'
  end;

  select c.id
  into v_categoria_id
  from public.comunicacao_categorias c
  where c.ativo is true
    and lower(btrim(c.nome)) = lower(v_categoria_nome)
  order by c.created_at nulls last
  limit 1;

  if v_categoria_id is null then
    select c.id
    into v_categoria_id
    from public.comunicacao_categorias c
    where c.ativo is true
    order by case when lower(btrim(c.nome)) = 'suporte' then 0 else 1 end, c.created_at nulls last
    limit 1;
  end if;

  if v_categoria_id is null then
    raise exception 'Nenhuma categoria de atendimento ativa foi encontrada.' using errcode = 'P0001';
  end if;

  v_destino_polo_id := v_aluno_polo_id;
  if v_polo_label is not null then
    select po.id
    into v_destino_polo_id
    from public.polos po
    where lower(btrim(coalesce(po.cidade, ''))) = lower(v_polo_label)
       or lower(btrim(coalesce(po.nome, ''))) = lower(v_polo_label)
    order by case when po.id = v_aluno_polo_id then 0 else 1 end
    limit 1;

    v_destino_polo_id := coalesce(v_destino_polo_id, v_aluno_polo_id);
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
    v_categoria_id,
    'pendente',
    v_mensagem,
    now(),
    v_origem,
    v_destino_polo_id,
    v_setor,
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
    v_mensagem
  );

  return to_jsonb(v_chat);
end;
$$;

revoke all on function public.create_my_routed_comunicacao_chat(text, text, text, text, boolean, text)
from public, anon;
grant execute on function public.create_my_routed_comunicacao_chat(text, text, text, text, boolean, text)
to authenticated;

comment on function public.create_my_routed_comunicacao_chat(text, text, text, text, boolean, text) is
  'Abre atomicamente um chamado autenticado usando o mesmo setor e polo definidos pelo fluxo automático do WhatsApp.';

commit;
