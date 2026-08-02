begin;

-- Corrige o alias legado sem alterar as selecoes atualmente habilitadas.
update public.mensageria_config
set
  wa_due_notice_modalities = array_replace(wa_due_notice_modalities, 'LIVRES', 'LIVRE'),
  wa_payment_receipt_modalities = array_replace(wa_payment_receipt_modalities, 'LIVRES', 'LIVRE'),
  wa_overdue_notice_modalities = array_replace(wa_overdue_notice_modalities, 'LIVRES', 'LIVRE'),
  wa_multiple_overdue_modalities = array_replace(wa_multiple_overdue_modalities, 'LIVRES', 'LIVRE')
where
  'LIVRES' = any(wa_due_notice_modalities)
  or 'LIVRES' = any(wa_payment_receipt_modalities)
  or 'LIVRES' = any(wa_overdue_notice_modalities)
  or 'LIVRES' = any(wa_multiple_overdue_modalities);

alter table public.mensageria_config
  alter column wa_due_notice_modalities set default array['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']::text[],
  alter column wa_payment_receipt_modalities set default array['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']::text[],
  alter column wa_overdue_notice_modalities set default array['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']::text[],
  alter column wa_multiple_overdue_modalities set default array['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO']::text[];

update public.whatsapp_birthday_settings
set modalities = array_replace(modalities, 'LIVRES', 'LIVRE')
where 'LIVRES' = any(modalities);

alter table public.whatsapp_birthday_settings
  alter column modalities set default array['TECNICO', 'EAD', 'LIVRE', 'ESPECIALIZACAO']::text[];

create table if not exists public.comunicacao_automacoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  descricao text,
  evento text not null,
  categoria text not null,
  finalidade text not null,
  status text not null default 'rascunho',
  matricula_status text[] not null default array['ATIVO']::text[],
  gatilho jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Maceio',
  versao_atual integer not null default 1,
  origem_legada text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_automacoes_chave_check
    check (chave ~ '^[a-z0-9_]+$'),
  constraint comunicacao_automacoes_evento_check
    check (evento in ('payment_due', 'payment_received', 'payment_overdue', 'multiple_overdue', 'birthday')),
  constraint comunicacao_automacoes_categoria_check
    check (categoria in ('financeiro', 'relacionamento', 'academico')),
  constraint comunicacao_automacoes_finalidade_check
    check (finalidade in ('transacional', 'marketing')),
  constraint comunicacao_automacoes_status_check
    check (status in ('rascunho', 'publicada', 'pausada', 'arquivada')),
  constraint comunicacao_automacoes_matricula_status_check
    check (
      cardinality(matricula_status) > 0
      and matricula_status <@ array['ATIVO', 'CONCLUIDO', 'TRANCADO', 'CANCELADO', 'DESISTENTE']::text[]
    ),
  constraint comunicacao_automacoes_gatilho_check
    check (jsonb_typeof(gatilho) = 'object'),
  constraint comunicacao_automacoes_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint comunicacao_automacoes_horario_check
    check (timezone = 'America/Maceio'),
  constraint comunicacao_automacoes_versao_check
    check (versao_atual > 0)
);

create table if not exists public.comunicacao_automacao_canais (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references public.comunicacao_automacoes(id) on delete cascade,
  canal text not null,
  titulo_template text,
  corpo_template text not null,
  deep_link text,
  configuracao jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_automacao_canais_automation_channel_unique
    unique (automacao_id, canal),
  constraint comunicacao_automacao_canais_canal_check
    check (canal in ('app_message', 'push', 'whatsapp')),
  constraint comunicacao_automacao_canais_corpo_check
    check (length(btrim(corpo_template)) between 1 and 8000),
  constraint comunicacao_automacao_canais_titulo_check
    check (titulo_template is null or length(btrim(titulo_template)) between 1 and 120),
  constraint comunicacao_automacao_canais_deep_link_check
    check (deep_link is null or deep_link ~ '^/aluno(?:/|$)'),
  constraint comunicacao_automacao_canais_configuracao_check
    check (jsonb_typeof(configuracao) = 'object')
);

create table if not exists public.comunicacao_automacao_rotas (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references public.comunicacao_automacoes(id) on delete cascade,
  modalidade text not null,
  canal text not null,
  habilitada boolean not null default false,
  modo_entrega text not null default 'parallel',
  prioridade smallint not null default 1,
  fallback_apos_minutos integer,
  fallback_condicao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_automacao_rotas_unique unique (automacao_id, modalidade, canal),
  constraint comunicacao_automacao_rotas_canal_fk
    foreign key (automacao_id, canal)
    references public.comunicacao_automacao_canais(automacao_id, canal)
    on delete cascade,
  constraint comunicacao_automacao_rotas_modalidade_check
    check (modalidade in ('TECNICO', 'EAD', 'LIVRE', 'ESPECIALIZACAO', 'SUPERIOR')),
  constraint comunicacao_automacao_rotas_canal_check
    check (canal in ('app_message', 'push', 'whatsapp')),
  constraint comunicacao_automacao_rotas_modo_check
    check (modo_entrega in ('parallel', 'fallback')),
  constraint comunicacao_automacao_rotas_prioridade_check
    check (prioridade between 1 and 10),
  constraint comunicacao_automacao_rotas_fallback_check
    check (
      (modo_entrega = 'parallel' and fallback_apos_minutos is null and fallback_condicao is null)
      or (
        modo_entrega = 'fallback'
        and prioridade > 1
        and fallback_apos_minutos between 1 and 10080
        and fallback_condicao in ('no_device', 'delivery_failed', 'unread')
      )
    )
);

create table if not exists public.comunicacao_automacao_versoes (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references public.comunicacao_automacoes(id) on delete cascade,
  versao integer not null,
  snapshot jsonb not null,
  motivo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  publicada_at timestamptz,
  constraint comunicacao_automacao_versoes_unique unique (automacao_id, versao),
  constraint comunicacao_automacao_versoes_numero_check check (versao > 0),
  constraint comunicacao_automacao_versoes_snapshot_check check (jsonb_typeof(snapshot) = 'object')
);

create table if not exists public.comunicacao_eventos_outbox (
  id uuid primary key default gen_random_uuid(),
  automacao_versao_id uuid not null references public.comunicacao_automacao_versoes(id) on delete restrict,
  evento text not null,
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  referencia_tipo text,
  referencia_id uuid,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  disponivel_em timestamptz not null default now(),
  bloqueado_em timestamptz,
  bloqueado_por text,
  tentativas integer not null default 0,
  ultimo_erro text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint comunicacao_eventos_outbox_evento_check
    check (evento in ('payment_due', 'payment_received', 'payment_overdue', 'multiple_overdue', 'birthday')),
  constraint comunicacao_eventos_outbox_status_check
    check (status in ('pending', 'processing', 'completed', 'error', 'cancelled')),
  constraint comunicacao_eventos_outbox_tentativas_check
    check (tentativas >= 0),
  constraint comunicacao_eventos_outbox_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 300),
  constraint comunicacao_eventos_outbox_payload_check
    check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.comunicacao_entregas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.comunicacao_eventos_outbox(id) on delete cascade,
  canal text not null,
  idempotency_key text not null unique,
  destino text,
  titulo text,
  conteudo text not null,
  status text not null default 'pending',
  provider_message_id text,
  tentativas integer not null default 0,
  tentado_em timestamptz,
  proxima_tentativa_em timestamptz,
  bloqueado_em timestamptz,
  bloqueado_por text,
  ultimo_erro text,
  enviado_em timestamptz,
  entregue_em timestamptz,
  lido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_entregas_canal_check
    check (canal in ('app_message', 'push', 'whatsapp')),
  constraint comunicacao_entregas_status_check
    check (status in ('pending', 'processing', 'sent', 'delivered', 'read', 'skipped', 'error', 'unknown')),
  constraint comunicacao_entregas_tentativas_check
    check (tentativas >= 0),
  constraint comunicacao_entregas_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 300),
  constraint comunicacao_entregas_evento_canal_unique unique (evento_id, canal)
);

create table if not exists public.comunicacao_preferencias (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.parceiros(id) on delete restrict,
  canal text not null,
  finalidade text not null,
  permitida boolean not null default false,
  origem text not null default 'nao_informada',
  base_legal text,
  politica_versao text,
  evidencia jsonb not null default '{}'::jsonb,
  consentida_em timestamptz,
  revogada_em timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comunicacao_preferencias_unique unique (aluno_id, canal, finalidade),
  constraint comunicacao_preferencias_canal_check
    check (canal in ('app_message', 'push', 'whatsapp')),
  constraint comunicacao_preferencias_finalidade_check
    check (finalidade in ('transacional', 'marketing')),
  constraint comunicacao_preferencias_origem_check
    check (origem in ('nao_informada', 'cadastro', 'app', 'whatsapp', 'gestor', 'legado')),
  constraint comunicacao_preferencias_evidencia_check
    check (jsonb_typeof(evidencia) = 'object'),
  constraint comunicacao_preferencias_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint comunicacao_preferencias_consentimento_check
    check (
      finalidade <> 'marketing'
      or permitida = false
      or (
        consentida_em is not null
        and revogada_em is null
        and nullif(btrim(coalesce(politica_versao, '')), '') is not null
      )
    ),
  constraint comunicacao_preferencias_datas_check
    check (revogada_em is null or consentida_em is null or revogada_em >= consentida_em)
);

create table if not exists public.comunicacao_automacao_auditoria (
  id bigint generated always as identity primary key,
  automacao_id uuid,
  tabela text not null,
  registro_id uuid not null,
  operacao text not null,
  actor_id uuid,
  anterior jsonb,
  posterior jsonb,
  created_at timestamptz not null default now(),
  constraint comunicacao_automacao_auditoria_operacao_check
    check (operacao in ('INSERT', 'UPDATE', 'DELETE'))
);

create index if not exists idx_comunicacao_automacoes_evento_status
  on public.comunicacao_automacoes (evento, status);
create index if not exists idx_comunicacao_automacao_rotas_dispatch
  on public.comunicacao_automacao_rotas (automacao_id, modalidade, habilitada, prioridade);
create index if not exists idx_comunicacao_automacao_versoes_automacao_created
  on public.comunicacao_automacao_versoes (automacao_id, created_at desc);
create index if not exists idx_comunicacao_eventos_outbox_dispatch
  on public.comunicacao_eventos_outbox (status, disponivel_em, created_at)
  where status in ('pending', 'error');
create index if not exists idx_comunicacao_eventos_outbox_aluno_created
  on public.comunicacao_eventos_outbox (aluno_id, created_at desc);
create index if not exists idx_comunicacao_entregas_dispatch
  on public.comunicacao_entregas (status, proxima_tentativa_em, created_at)
  where status in ('pending', 'error', 'unknown');
create index if not exists idx_comunicacao_entregas_evento
  on public.comunicacao_entregas (evento_id);
create unique index if not exists idx_comunicacao_entregas_provider_message
  on public.comunicacao_entregas (canal, provider_message_id)
  where provider_message_id is not null;
create index if not exists idx_comunicacao_automacao_auditoria_automacao_created
  on public.comunicacao_automacao_auditoria (automacao_id, created_at desc);

create or replace function public.comunicacao_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.comunicacao_audit_automation_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_automacao_id uuid;
  v_registro_id uuid;
begin
  if tg_op = 'DELETE' then
    v_registro_id := old.id;
    if tg_table_name = 'comunicacao_automacoes' then
      v_automacao_id := old.id;
    else
      v_automacao_id := old.automacao_id;
    end if;
  else
    v_registro_id := new.id;
    if tg_table_name = 'comunicacao_automacoes' then
      v_automacao_id := new.id;
    else
      v_automacao_id := new.automacao_id;
    end if;
  end if;

  insert into public.comunicacao_automacao_auditoria (
    automacao_id,
    tabela,
    registro_id,
    operacao,
    actor_id,
    anterior,
    posterior
  ) values (
    v_automacao_id,
    tg_table_name,
    v_registro_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists comunicacao_automacoes_touch_updated_at on public.comunicacao_automacoes;
create trigger comunicacao_automacoes_touch_updated_at
before update on public.comunicacao_automacoes
for each row execute function public.comunicacao_touch_updated_at();

drop trigger if exists comunicacao_automacao_canais_touch_updated_at on public.comunicacao_automacao_canais;
create trigger comunicacao_automacao_canais_touch_updated_at
before update on public.comunicacao_automacao_canais
for each row execute function public.comunicacao_touch_updated_at();

drop trigger if exists comunicacao_automacao_rotas_touch_updated_at on public.comunicacao_automacao_rotas;
create trigger comunicacao_automacao_rotas_touch_updated_at
before update on public.comunicacao_automacao_rotas
for each row execute function public.comunicacao_touch_updated_at();

drop trigger if exists comunicacao_entregas_touch_updated_at on public.comunicacao_entregas;
create trigger comunicacao_entregas_touch_updated_at
before update on public.comunicacao_entregas
for each row execute function public.comunicacao_touch_updated_at();

drop trigger if exists comunicacao_preferencias_touch_updated_at on public.comunicacao_preferencias;
create trigger comunicacao_preferencias_touch_updated_at
before update on public.comunicacao_preferencias
for each row execute function public.comunicacao_touch_updated_at();

drop trigger if exists comunicacao_automacoes_audit on public.comunicacao_automacoes;
create trigger comunicacao_automacoes_audit
after insert or update or delete on public.comunicacao_automacoes
for each row execute function public.comunicacao_audit_automation_change();

drop trigger if exists comunicacao_automacao_canais_audit on public.comunicacao_automacao_canais;
create trigger comunicacao_automacao_canais_audit
after insert or update or delete on public.comunicacao_automacao_canais
for each row execute function public.comunicacao_audit_automation_change();

drop trigger if exists comunicacao_automacao_rotas_audit on public.comunicacao_automacao_rotas;
create trigger comunicacao_automacao_rotas_audit
after insert or update or delete on public.comunicacao_automacao_rotas
for each row execute function public.comunicacao_audit_automation_change();

insert into public.comunicacao_automacoes (
  chave, nome, descricao, evento, categoria, finalidade, status, gatilho, origem_legada
)
values
  ('financeiro_aviso_vencimento', 'Aviso de vencimento', 'Lembrete enviado antes do vencimento.', 'payment_due', 'financeiro', 'transacional', 'rascunho', '{"event":"payment_due","daysBefore":3,"sendTime":"09:00"}'::jsonb, 'mensageria_config'),
  ('financeiro_pagamento_confirmado', 'Pagamento confirmado', 'Confirma a baixa do pagamento.', 'payment_received', 'financeiro', 'transacional', 'rascunho', '{"event":"payment_received","delayMinutes":0}'::jsonb, 'mensageria_config'),
  ('financeiro_pagamento_atrasado', 'Aviso de parcela vencida', 'Aviso enviado após o vencimento.', 'payment_overdue', 'financeiro', 'transacional', 'rascunho', '{"event":"payment_overdue","daysAfter":1,"sendTime":"09:00"}'::jsonb, 'mensageria_config'),
  ('financeiro_multiplos_atrasos', 'Múltiplas parcelas em atraso', 'Orienta o aluno sobre duas ou mais parcelas pendentes.', 'multiple_overdue', 'financeiro', 'transacional', 'rascunho', '{"event":"multiple_overdue","minimumInstallments":2,"sendTime":"09:00"}'::jsonb, 'mensageria_config'),
  ('relacionamento_aniversario', 'Aniversário do aluno', 'Mensagem de relacionamento condicionada a consentimento válido.', 'birthday', 'relacionamento', 'marketing', 'rascunho', '{"event":"birthday","sendTime":"09:00"}'::jsonb, 'whatsapp_birthday_settings')
on conflict (chave) do nothing;

update public.comunicacao_automacoes a
set gatilho = case a.evento
  when 'payment_due' then jsonb_build_object(
    'event', 'payment_due', 'daysBefore', greatest(c.wa_due_notice_days, 0), 'sendTime', '09:00'
  )
  when 'payment_received' then '{"event":"payment_received","delayMinutes":0}'::jsonb
  when 'payment_overdue' then jsonb_build_object(
    'event', 'payment_overdue', 'daysAfter', greatest(c.wa_overdue_notice_days, 0), 'sendTime', '09:00'
  )
  when 'multiple_overdue' then jsonb_build_object(
    'event', 'multiple_overdue', 'minimumInstallments', greatest(c.wa_multiple_overdue_min_installments, 2), 'sendTime', '09:00'
  )
  else a.gatilho
end
from public.mensageria_config c
where c.tipo = 'whatsapp'
  and a.evento in ('payment_due', 'payment_received', 'payment_overdue', 'multiple_overdue');

update public.comunicacao_automacoes a
set
  matricula_status = b.enrollment_statuses,
  gatilho = jsonb_build_object(
    'event', 'birthday', 'sendTime', to_char(b.send_time, 'HH24:MI')
  )
from public.whatsapp_birthday_settings b
where b.id = true and a.evento = 'birthday';

insert into public.comunicacao_automacao_canais (
  automacao_id, canal, titulo_template, corpo_template, deep_link, configuracao
)
select
  a.id,
  channel_seed.canal,
  channel_seed.titulo_template,
  channel_seed.corpo_template,
  channel_seed.deep_link,
  channel_seed.configuracao
from public.comunicacao_automacoes a
join lateral (
  values
    (
      'app_message'::text,
      a.nome,
      case a.evento
        when 'payment_due' then 'Olá, {{nome_aluno}}! A parcela de {{valor_fatura}} vence em {{data_vencimento}}. Consulte os detalhes e o pagamento no app.'
        when 'payment_received' then 'Olá, {{nome_aluno}}! Confirmamos o pagamento de {{valor_fatura}} referente ao curso {{nome_curso}}.'
        when 'payment_overdue' then 'Olá, {{nome_aluno}}! Há uma parcela vencida em {{data_vencimento}}. Consulte os detalhes no ambiente seguro do app.'
        when 'multiple_overdue' then 'Olá, {{nome_aluno}}! Identificamos {{quantidade_parcelas}} parcelas pendentes. Consulte as opções de atendimento no app.'
        else 'Feliz aniversário, {{nome_aluno}}! A Universo Cursos e Consultoria deseja um novo ciclo de muitas conquistas.'
      end,
      '/aluno/comunicacao',
      '{}'::jsonb
    ),
    (
      'push'::text,
      'Nova mensagem da Universo',
      'Toque para consultar a atualização no aplicativo.',
      '/aluno/comunicacao',
      '{"privacy":"private"}'::jsonb
    ),
    (
      'whatsapp'::text,
      null::text,
      'Olá, {{nome_aluno}}! Você tem uma nova atualização da Universo Cursos e Consultoria.',
      null::text,
      jsonb_build_object('category', case when a.finalidade = 'marketing' then 'marketing' else 'utility' end)
    )
) as channel_seed(canal, titulo_template, corpo_template, deep_link, configuracao)
  on true
where a.chave in (
  'financeiro_aviso_vencimento',
  'financeiro_pagamento_confirmado',
  'financeiro_pagamento_atrasado',
  'financeiro_multiplos_atrasos',
  'relacionamento_aniversario'
)
on conflict (automacao_id, canal) do nothing;

update public.comunicacao_automacao_canais channel_config
set
  corpo_template = case automation.evento
    when 'payment_due' then legacy.wa_due_notice_template
    when 'payment_received' then legacy.wa_payment_receipt_template
    when 'payment_overdue' then legacy.wa_default_overdue_template
    when 'multiple_overdue' then legacy.wa_multiple_overdue_template
    else channel_config.corpo_template
  end
from public.comunicacao_automacoes automation
cross join public.mensageria_config legacy
where channel_config.automacao_id = automation.id
  and channel_config.canal = 'whatsapp'
  and legacy.tipo = 'whatsapp'
  and automation.evento in ('payment_due', 'payment_received', 'payment_overdue', 'multiple_overdue');

update public.comunicacao_automacao_canais channel_config
set
  corpo_template = birthday.message_template,
  configuracao = channel_config.configuracao || jsonb_build_object(
    'metaTemplateName', birthday.meta_template_name,
    'metaTemplateLanguage', birthday.meta_template_language
  )
from public.comunicacao_automacoes automation
cross join public.whatsapp_birthday_settings birthday
where channel_config.automacao_id = automation.id
  and channel_config.canal = 'whatsapp'
  and automation.evento = 'birthday'
  and birthday.id = true;

insert into public.comunicacao_automacao_rotas (
  automacao_id,
  modalidade,
  canal,
  habilitada,
  modo_entrega,
  prioridade
)
select
  automation.id,
  modality.id,
  channel_config.canal,
  case
    when channel_config.canal <> 'whatsapp' then false
    when automation.evento = 'payment_due'
      then legacy.wa_send_due_notice and modality.id = any(legacy.wa_due_notice_modalities)
    when automation.evento = 'payment_received'
      then legacy.wa_send_payment_receipt and modality.id = any(legacy.wa_payment_receipt_modalities)
    when automation.evento = 'payment_overdue'
      then legacy.wa_send_overdue_notice and modality.id = any(legacy.wa_overdue_notice_modalities)
    when automation.evento = 'multiple_overdue'
      then legacy.wa_send_multiple_overdue_notice and modality.id = any(legacy.wa_multiple_overdue_modalities)
    else false
  end,
  'parallel',
  1
from public.comunicacao_automacoes automation
join public.comunicacao_automacao_canais channel_config
  on channel_config.automacao_id = automation.id
cross join public.mensageria_config legacy
cross join (values ('TECNICO'), ('EAD'), ('LIVRE'), ('ESPECIALIZACAO')) as modality(id)
where legacy.tipo = 'whatsapp'
  and automation.evento in ('payment_due', 'payment_received', 'payment_overdue', 'multiple_overdue')
on conflict (automacao_id, modalidade, canal) do nothing;

insert into public.comunicacao_automacao_rotas (
  automacao_id,
  modalidade,
  canal,
  habilitada,
  modo_entrega,
  prioridade
)
select
  automation.id,
  modality.id,
  channel_config.canal,
  channel_config.canal = 'whatsapp'
    and birthday.enabled
    and modality.id = any(birthday.modalities),
  'parallel',
  1
from public.comunicacao_automacoes automation
join public.comunicacao_automacao_canais channel_config
  on channel_config.automacao_id = automation.id
cross join public.whatsapp_birthday_settings birthday
cross join (values ('TECNICO'), ('EAD'), ('LIVRE'), ('ESPECIALIZACAO')) as modality(id)
where birthday.id = true
  and automation.evento = 'birthday'
on conflict (automacao_id, modalidade, canal) do nothing;

insert into public.comunicacao_automacao_versoes (
  automacao_id, versao, snapshot, motivo
)
select
  a.id,
  1,
  jsonb_build_object(
    'automation', to_jsonb(a),
    'channels', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.canal)
      from public.comunicacao_automacao_canais c
      where c.automacao_id = a.id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.modalidade, r.prioridade, r.canal)
      from public.comunicacao_automacao_rotas r
      where r.automacao_id = a.id
    ), '[]'::jsonb)
  ),
  'Importação segura da configuração legada; nova execução permanece desativada.'
from public.comunicacao_automacoes a
where a.chave in (
  'financeiro_aviso_vencimento',
  'financeiro_pagamento_confirmado',
  'financeiro_pagamento_atrasado',
  'financeiro_multiplos_atrasos',
  'relacionamento_aniversario'
)
on conflict (automacao_id, versao) do nothing;

alter table public.comunicacao_automacoes enable row level security;
alter table public.comunicacao_automacao_canais enable row level security;
alter table public.comunicacao_automacao_rotas enable row level security;
alter table public.comunicacao_automacao_versoes enable row level security;
alter table public.comunicacao_eventos_outbox enable row level security;
alter table public.comunicacao_entregas enable row level security;
alter table public.comunicacao_preferencias enable row level security;
alter table public.comunicacao_automacao_auditoria enable row level security;

create policy comunicacao_automacoes_global_read
on public.comunicacao_automacoes for select to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
);

create policy comunicacao_automacao_canais_global_read
on public.comunicacao_automacao_canais for select to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
);

create policy comunicacao_automacao_rotas_global_read
on public.comunicacao_automacao_rotas for select to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
);

create policy comunicacao_automacao_versoes_global_read
on public.comunicacao_automacao_versoes for select to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
);

create policy comunicacao_automacao_auditoria_global_read
on public.comunicacao_automacao_auditoria for select to authenticated
using (
  (select public.is_gestor_global())
  and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
);

drop policy if exists portal_whatsapp_automation_deliveries_gestor_read
  on public.whatsapp_automation_deliveries;
create policy portal_whatsapp_automation_deliveries_global_financial_read
  on public.whatsapp_automation_deliveries
  for select
  to authenticated
  using (
    (select public.is_gestor_global())
    and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
    and (select public.gestor_has_financeiro_tab('receber'))
  );

drop policy if exists portal_whatsapp_birthday_settings_gestor
  on public.whatsapp_birthday_settings;
create policy portal_whatsapp_birthday_settings_gestor_read
  on public.whatsapp_birthday_settings
  for select to authenticated
  using ((select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp')));
create policy portal_whatsapp_birthday_settings_global_insert
  on public.whatsapp_birthday_settings
  for insert to authenticated
  with check (
    (select public.is_gestor_global())
    and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
  );
create policy portal_whatsapp_birthday_settings_global_update
  on public.whatsapp_birthday_settings
  for update to authenticated
  using (
    (select public.is_gestor_global())
    and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
  )
  with check (
    (select public.is_gestor_global())
    and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
  );
create policy portal_whatsapp_birthday_settings_global_delete
  on public.whatsapp_birthday_settings
  for delete to authenticated
  using (
    (select public.is_gestor_global())
    and (select public.gestor_has_tab('comunicacao', 'comunicacao-whatsapp'))
  );

revoke all on public.comunicacao_automacoes from public, anon, authenticated;
revoke all on public.comunicacao_automacao_canais from public, anon, authenticated;
revoke all on public.comunicacao_automacao_rotas from public, anon, authenticated;
revoke all on public.comunicacao_automacao_versoes from public, anon, authenticated;
revoke all on public.comunicacao_eventos_outbox from public, anon, authenticated;
revoke all on public.comunicacao_entregas from public, anon, authenticated;
revoke all on public.comunicacao_preferencias from public, anon, authenticated;
revoke all on public.comunicacao_automacao_auditoria from public, anon, authenticated;

grant select on public.comunicacao_automacoes to authenticated;
grant select on public.comunicacao_automacao_canais to authenticated;
grant select on public.comunicacao_automacao_rotas to authenticated;
grant select on public.comunicacao_automacao_versoes to authenticated;
grant select on public.comunicacao_automacao_auditoria to authenticated;

grant select, insert, update on public.comunicacao_automacoes to service_role;
grant select, insert, update on public.comunicacao_automacao_canais to service_role;
grant select, insert, update on public.comunicacao_automacao_rotas to service_role;
grant select, insert on public.comunicacao_automacao_versoes to service_role;
grant select, insert, update on public.comunicacao_eventos_outbox to service_role;
grant select, insert, update on public.comunicacao_entregas to service_role;
grant select, insert, update on public.comunicacao_preferencias to service_role;
grant select on public.comunicacao_automacao_auditoria to service_role;
grant usage, select on sequence public.comunicacao_automacao_auditoria_id_seq to service_role;

revoke all on function public.comunicacao_touch_updated_at() from public, anon, authenticated;
revoke all on function public.comunicacao_audit_automation_change() from public, anon, authenticated;

commit;
