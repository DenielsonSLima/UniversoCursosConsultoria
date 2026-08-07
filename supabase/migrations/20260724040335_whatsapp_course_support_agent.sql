create or replace function public.whatsapp_course_agent_normalize(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select trim(
    regexp_replace(
      translate(
        lower(p_value),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.whatsapp_course_agent_settings (
  conexao_id uuid primary key
    references public.whatsapp_conexoes(id) on delete cascade,
  enabled boolean not null default false,
  confidence_threshold numeric(4,3) not null default 0.300
    check (confidence_threshold between 0 and 1),
  max_clarifications smallint not null default 1
    check (max_clarifications between 0 and 5),
  show_prices boolean not null default true,
  show_open_classes boolean not null default true,
  greeting_message text not null default
    'Posso consultar nossos cursos, modalidades e turmas públicas e responder dúvidas frequentes.',
  fallback_message text not null default
    'Ainda não encontrei uma resposta segura. Informe o nome do curso ou detalhe um pouco mais a sua dúvida.',
  handoff_message text not null default
    'Vou encaminhar sua dúvida para o Comercial, que continuará o atendimento por aqui.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(greeting_message) between 1 and 2000),
  check (length(fallback_message) between 1 and 2000),
  check (length(handoff_message) between 1 and 2000)
);

create table if not exists public.whatsapp_course_agent_faq (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid null
    references public.whatsapp_conexoes(id) on delete cascade,
  curso_id uuid null
    references public.cursos(id) on delete cascade,
  category text not null default 'geral',
  question text not null,
  answer text not null,
  keywords text[] not null default '{}'::text[],
  active boolean not null default true,
  priority smallint not null default 0
    check (priority between -100 and 100),
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(question)) between 3 and 500),
  check (length(trim(answer)) between 3 and 4000),
  check (cardinality(keywords) <= 30)
);

create table if not exists public.whatsapp_course_agent_events (
  id bigint generated always as identity primary key,
  conexao_id uuid not null
    references public.whatsapp_conexoes(id) on delete cascade,
  conversa_id uuid null
    references public.whatsapp_conversas(id) on delete set null,
  faq_id uuid null
    references public.whatsapp_course_agent_faq(id) on delete set null,
  curso_id uuid null
    references public.cursos(id) on delete set null,
  event_type text not null
    check (event_type in (
      'started',
      'listed_courses',
      'matched_faq',
      'matched_course',
      'unmatched',
      'handoff'
    )),
  query_text text null,
  confidence numeric(4,3) null
    check (confidence is null or confidence between 0 and 1),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  check (query_text is null or length(query_text) <= 1000)
);

create or replace function public.whatsapp_course_agent_prepare_faq()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.question := trim(new.question);
  new.answer := trim(new.answer);
  new.category := coalesce(nullif(trim(new.category), ''), 'geral');
  new.keywords := coalesce(new.keywords, '{}'::text[]);
  new.search_text := public.whatsapp_course_agent_normalize(
    concat_ws(
      ' ',
      new.question,
      new.category,
      array_to_string(new.keywords, ' ')
    )
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whatsapp_course_agent_prepare_faq
  on public.whatsapp_course_agent_faq;
create trigger whatsapp_course_agent_prepare_faq
before insert or update
on public.whatsapp_course_agent_faq
for each row
execute function public.whatsapp_course_agent_prepare_faq();

create or replace function public.whatsapp_course_agent_touch_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whatsapp_course_agent_touch_settings
  on public.whatsapp_course_agent_settings;
create trigger whatsapp_course_agent_touch_settings
before update
on public.whatsapp_course_agent_settings
for each row
execute function public.whatsapp_course_agent_touch_settings();

create unique index if not exists
  whatsapp_course_agent_faq_scope_question_uidx
on public.whatsapp_course_agent_faq (
  coalesce(conexao_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(curso_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(question)
);

create index if not exists whatsapp_course_agent_faq_connection_idx
  on public.whatsapp_course_agent_faq (conexao_id, active, priority desc);

create index if not exists whatsapp_course_agent_faq_course_idx
  on public.whatsapp_course_agent_faq (curso_id)
  where curso_id is not null;

create index if not exists whatsapp_course_agent_faq_search_idx
  on public.whatsapp_course_agent_faq
  using gin (search_text extensions.gin_trgm_ops)
  where active = true;

create index if not exists whatsapp_course_agent_events_connection_date_idx
  on public.whatsapp_course_agent_events (conexao_id, created_at desc);

create index if not exists whatsapp_course_agent_events_unmatched_idx
  on public.whatsapp_course_agent_events (conexao_id, created_at desc)
  where event_type = 'unmatched';

create index if not exists whatsapp_course_agent_events_conversation_idx
  on public.whatsapp_course_agent_events (conversa_id)
  where conversa_id is not null;

create or replace function public.whatsapp_course_agent_match_faq(
  p_connection_id uuid,
  p_query text,
  p_limit integer default 3
)
returns table (
  faq_id uuid,
  curso_id uuid,
  question text,
  answer text,
  category text,
  confidence numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select public.whatsapp_course_agent_normalize(left(coalesce(p_query, ''), 1000)) as query
  ),
  ranked as (
    select
      f.id,
      f.curso_id,
      f.question,
      f.answer,
      f.category,
      greatest(
        extensions.similarity(f.search_text, input.query),
        extensions.word_similarity(input.query, f.search_text)
      )::numeric as score,
      (f.conexao_id is not null) as is_specific,
      f.priority
    from public.whatsapp_course_agent_faq f
    cross join input
    where f.active = true
      and (f.conexao_id is null or f.conexao_id = p_connection_id)
      and input.query <> ''
  )
  select
    ranked.id,
    ranked.curso_id,
    ranked.question,
    ranked.answer,
    ranked.category,
    least(1, greatest(0, ranked.score))::numeric(4,3)
  from ranked
  where ranked.score >= 0.08
  order by ranked.is_specific desc, ranked.priority desc, ranked.score desc
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

create or replace function public.whatsapp_course_agent_search_catalog(
  p_query text,
  p_limit integer default 5
)
returns table (
  course_id uuid,
  course_name text,
  modality text,
  area text,
  description text,
  workload integer,
  duration_months integer,
  course_price numeric,
  confidence numeric,
  public_classes jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select public.whatsapp_course_agent_normalize(left(coalesce(p_query, ''), 1000)) as query
  ),
  ranked as (
    select
      c.*,
      greatest(
        extensions.similarity(
          public.whatsapp_course_agent_normalize(
            concat_ws(' ', c.nome, c.modalidade, c.area, c.descricao)
          ),
          input.query
        ),
        extensions.word_similarity(
          input.query,
          public.whatsapp_course_agent_normalize(
            concat_ws(' ', c.nome, c.modalidade, c.area, c.descricao)
          )
        )
      )::numeric as score
    from public.cursos c
    cross join input
    where lower(coalesce(c.status, '')) = 'ativo'
      and coalesce(c.publicar_site, false) = true
      and input.query <> ''
  )
  select
    ranked.id,
    ranked.nome,
    ranked.modalidade,
    ranked.area,
    ranked.descricao,
    ranked.carga_horaria,
    ranked.duracao_meses,
    ranked.valor,
    least(1, greatest(0, ranked.score))::numeric(4,3),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.nome,
          'city', p.cidade,
          'polo', p.nome,
          'shift', t.turno,
          'startDate', t.data_inicio,
          'enrollmentStart', t.data_inicio_inscricao,
          'enrollmentEnd', t.data_fim_inscricao,
          'tuitionPrice', t.valor_parcela,
          'enrollmentPrice', t.valor_matricula
        )
        order by t.data_inicio nulls last, p.cidade
      )
      from public.turmas t
      join public.polos p on p.id = t.polo_id
      where t.curso_id = ranked.id
        and coalesce(t.publicar_no_site, false) = true
        and lower(coalesce(p.status, '')) = 'ativo'
    ), '[]'::jsonb)
  from ranked
  where ranked.score >= 0.08
  order by ranked.score desc, ranked.nome
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

alter table public.whatsapp_course_agent_settings enable row level security;
alter table public.whatsapp_course_agent_faq enable row level security;
alter table public.whatsapp_course_agent_events enable row level security;

drop policy if exists whatsapp_course_agent_settings_read
  on public.whatsapp_course_agent_settings;
create policy whatsapp_course_agent_settings_read
on public.whatsapp_course_agent_settings
for select
to authenticated
using ((select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')));

drop policy if exists whatsapp_course_agent_settings_write
  on public.whatsapp_course_agent_settings;
create policy whatsapp_course_agent_settings_write
on public.whatsapp_course_agent_settings
for all
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
)
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

drop policy if exists whatsapp_course_agent_faq_read
  on public.whatsapp_course_agent_faq;
create policy whatsapp_course_agent_faq_read
on public.whatsapp_course_agent_faq
for select
to authenticated
using ((select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')));

drop policy if exists whatsapp_course_agent_faq_write
  on public.whatsapp_course_agent_faq;
create policy whatsapp_course_agent_faq_write
on public.whatsapp_course_agent_faq
for all
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
)
with check (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

drop policy if exists whatsapp_course_agent_events_read
  on public.whatsapp_course_agent_events;
create policy whatsapp_course_agent_events_read
on public.whatsapp_course_agent_events
for select
to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_module('configuracoes'))
);

revoke all on public.whatsapp_course_agent_settings from anon;
revoke all on public.whatsapp_course_agent_faq from anon;
revoke all on public.whatsapp_course_agent_events from anon;

grant select, insert, update on public.whatsapp_course_agent_settings
  to authenticated;
grant select, insert, update, delete on public.whatsapp_course_agent_faq
  to authenticated;
grant select on public.whatsapp_course_agent_events
  to authenticated;

grant all on public.whatsapp_course_agent_settings to service_role;
grant all on public.whatsapp_course_agent_faq to service_role;
grant all on public.whatsapp_course_agent_events to service_role;
grant usage, select on sequence
  public.whatsapp_course_agent_events_id_seq to service_role;

revoke all on function public.whatsapp_course_agent_match_faq(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.whatsapp_course_agent_search_catalog(text, integer)
  from public, anon, authenticated;
grant execute on function public.whatsapp_course_agent_match_faq(uuid, text, integer)
  to service_role;
grant execute on function public.whatsapp_course_agent_search_catalog(text, integer)
  to service_role;

insert into public.whatsapp_course_agent_settings (conexao_id, enabled)
select id, true
from public.whatsapp_conexoes
where is_matriz_financeira = true
on conflict (conexao_id) do nothing;

insert into public.whatsapp_course_agent_faq
  (category, question, answer, keywords, priority)
values
  (
    'matricula',
    'Como faço para me matricular?',
    'Diga o nome do curso e a cidade onde deseja estudar. Eu consulto as opções públicas e, quando necessário, encaminho você ao Comercial para concluir a matrícula.',
    array['matrícula', 'inscrição', 'quero estudar', 'como entrar'],
    20
  ),
  (
    'documentos',
    'Quais documentos preciso para a matrícula?',
    'Os documentos podem variar conforme a modalidade e o curso. Informe o nome do curso para eu localizar os dados disponíveis; a equipe Comercial confirma a relação final antes da matrícula.',
    array['documento', 'cpf', 'rg', 'comprovante', 'requisitos'],
    10
  ),
  (
    'certificado',
    'O curso oferece certificado?',
    'Os cursos publicados possuem certificação conforme as regras acadêmicas da modalidade. A emissão depende da conclusão e do cumprimento dos requisitos do curso. Para uma confirmação específica, informe o nome do curso.',
    array['certificado', 'diploma', 'conclusão', 'validade'],
    15
  ),
  (
    'duracao',
    'Qual a duração e a carga horária do curso?',
    'A duração e a carga horária mudam de um curso para outro. Informe o nome do curso e eu consulto os dados publicados.',
    array['duração', 'carga horária', 'meses', 'horas', 'quanto tempo'],
    15
  ),
  (
    'valor',
    'Qual o valor do curso?',
    'O valor depende do curso e, quando houver turma, das condições publicadas para ela. Informe o nome do curso para eu consultar o valor disponível. Condições especiais devem ser confirmadas pelo Comercial.',
    array['valor', 'preço', 'mensalidade', 'parcela', 'quanto custa'],
    20
  ),
  (
    'modalidade',
    'O curso é presencial ou online?',
    'A modalidade está vinculada a cada curso publicado. Informe o nome do curso e eu confirmo se ele aparece como Técnico, Superior ou EAD.',
    array['presencial', 'online', 'ead', 'modalidade', 'semipresencial'],
    10
  ),
  (
    'turma',
    'Quando começa a próxima turma?',
    'Eu consigo informar apenas turmas marcadas como públicas. Diga o nome do curso e a cidade; se não houver turma publicada, encaminho a dúvida ao Comercial.',
    array['turma', 'início', 'começa', 'data', 'próxima turma'],
    20
  ),
  (
    'local',
    'Em qual cidade o curso está disponível?',
    'As cidades são informadas pelas turmas públicas de cada polo. Diga o nome do curso para eu consultar as unidades disponíveis.',
    array['cidade', 'polo', 'unidade', 'onde', 'local'],
    15
  ),
  (
    'reconhecimento',
    'O curso é reconhecido?',
    'Questões de reconhecimento, autorização e validade regulatória precisam ser confirmadas conforme o curso e a instituição responsável. Informe o nome do curso e encaminharei ao setor responsável quando necessário.',
    array['reconhecido', 'mec', 'autorizado', 'validade', 'regulamentado'],
    20
  ),
  (
    'estagio',
    'O curso tem estágio?',
    'A exigência de estágio depende da matriz e das regras específicas do curso. Informe o nome do curso; se essa informação não estiver publicada, encaminharei ao setor responsável.',
    array['estágio', 'prática', 'campo', 'obrigatório'],
    10
  )
on conflict do nothing;

with rebuilt as (
  select
    s.id,
    jsonb_set(
      s.routing_config,
      '{flow_builder,nodes}',
      (
        select jsonb_agg(
          case
            when node ->> 'id' = 'main_menu' then
              jsonb_set(
                node,
                '{options}',
                (
                  select jsonb_agg(
                    case
                      when flow_option ->> 'id' = 'main_courses' then
                        (
                          flow_option
                          - 'responseMessage'
                          - 'sector'
                          - 'poloMode'
                          - 'poloLabel'
                          - 'subject'
                        ) || jsonb_build_object('action', 'course_agent')
                      else flow_option
                    end
                    order by option_ordinality
                  )
                  from jsonb_array_elements(node -> 'options')
                    with ordinality as options(flow_option, option_ordinality)
                )
              )
            else node
          end
          order by node_ordinality
        )
        from jsonb_array_elements(
          s.routing_config #> '{flow_builder,nodes}'
        ) with ordinality as nodes(node, node_ordinality)
      )
    ) as routing_config
  from public.whatsapp_flow_settings s
  where s.flow_type = 'universo_main'
    and jsonb_typeof(s.routing_config #> '{flow_builder,nodes}') = 'array'
)
update public.whatsapp_flow_settings s
set routing_config = rebuilt.routing_config,
    updated_at = now()
from rebuilt
where s.id = rebuilt.id;

do $$
begin
  alter publication supabase_realtime
    add table public.whatsapp_course_agent_settings;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime
    add table public.whatsapp_course_agent_faq;
exception
  when duplicate_object then null;
end
$$;
