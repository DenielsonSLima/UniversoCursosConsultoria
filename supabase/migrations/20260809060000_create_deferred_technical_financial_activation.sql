begin;

alter table public.turmas
  add column if not exists regra_financeira_revisao integer not null default 1,
  add column if not exists regra_financeira_fingerprint text;

-- O serviço de criação já envia esses campos para todas as modalidades. Sem
-- defaults históricos, um cliente não consegue omitir a regra e receber
-- silenciosamente 150/100/11/350 do banco.
alter table public.turmas
  alter column valor_matricula drop default,
  alter column valor_rematricula drop default,
  alter column qtd_parcelas drop default,
  alter column valor_parcela drop default;

comment on column public.turmas.regra_financeira_revisao is
  'Revisao monotônica da regra financeira viva da turma. O frontend apenas confirma essa identidade.';
comment on column public.turmas.regra_financeira_fingerprint is
  'SHA-256 dos parâmetros financeiros canônicos da turma; cronograma_financeiro é somente projeção.';

create or replace function internal_academic.technical_financial_fingerprint(
  p_data_inicio date,
  p_valor_matricula numeric,
  p_valor_parcela numeric,
  p_valor_rematricula numeric,
  p_qtd_parcelas integer,
  p_dia_vencimento integer,
  p_desconto_pontualidade numeric,
  p_juros_atraso numeric,
  p_multa_atraso numeric,
  p_multa_atraso_percentual numeric,
  p_aplicar_desconto_matricula boolean,
  p_aplicar_multa_juros_matricula boolean,
  p_aplicar_desconto_mensalidade boolean,
  p_aplicar_multa_juros_mensalidade boolean,
  p_aplicar_desconto_rematricula boolean,
  p_aplicar_multa_juros_rematricula boolean,
  p_gerar_cobrancas_futuras boolean
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'dataInicio', p_data_inicio,
          'valorMatricula', round(coalesce(p_valor_matricula, 0), 2),
          'valorMensalidade', round(coalesce(p_valor_parcela, 0), 2),
          'valorRematricula', round(coalesce(p_valor_rematricula, 0), 2),
          'mensalidadesPorCiclo', coalesce(p_qtd_parcelas, 0),
          'diaVencimento', coalesce(p_dia_vencimento, 0),
          'descontoPontualidade', round(coalesce(p_desconto_pontualidade, 0), 2),
          'jurosAtraso', round(coalesce(p_juros_atraso, 0), 2),
          'multaAtraso', round(coalesce(p_multa_atraso, 0), 2),
          'multaAtrasoPercentual', round(coalesce(p_multa_atraso_percentual, 0), 2),
          'aplicarDescontoMatricula', coalesce(p_aplicar_desconto_matricula, false),
          'aplicarMultaJurosMatricula', coalesce(p_aplicar_multa_juros_matricula, false),
          'aplicarDescontoMensalidade', coalesce(p_aplicar_desconto_mensalidade, false),
          'aplicarMultaJurosMensalidade', coalesce(p_aplicar_multa_juros_mensalidade, false),
          'aplicarDescontoRematricula', coalesce(p_aplicar_desconto_rematricula, false),
          'aplicarMultaJurosRematricula', coalesce(p_aplicar_multa_juros_rematricula, false),
          'gerarCobrancasFuturas', coalesce(p_gerar_cobrancas_futuras, false)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

revoke all on function internal_academic.technical_financial_fingerprint(
  date, numeric, numeric, numeric, integer, integer, numeric, numeric, numeric,
  numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;

create or replace function public.aplicar_padrao_financeiro_turma_tecnica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
  v_fingerprint text;
begin
  select upper(coalesce(course.modalidade, ''))
  into v_modalidade
  from public.cursos course
  where course.id = new.curso_id;

  if v_modalidade not in ('TECNICO', 'TÉCNICO') then
    return new;
  end if;

  -- Nenhum valor financeiro é inventado na criação. A turma recebe sua regra
  -- explícita do fluxo de Gestão e passa a ser a única autoridade viva.
  new.multa_atraso_percentual := coalesce(new.multa_atraso_percentual, 2.00);
  new.multa_atraso := round(
    coalesce(new.valor_parcela, 0) * new.multa_atraso_percentual / 100.0,
    2
  );
  new.aplicar_desconto_matricula := false;
  new.aplicar_multa_juros_matricula := false;
  new.aplicar_desconto_mensalidade := true;
  new.aplicar_multa_juros_mensalidade := true;
  new.aplicar_desconto_rematricula := false;
  new.aplicar_multa_juros_rematricula := false;

  if new.qtd_parcelas <> 12 then
    raise exception 'Turma técnica deve usar exatamente 12 mensalidades por ciclo.'
      using errcode = '22023';
  end if;
  if new.valor_matricula < 0 or new.valor_parcela <= 0
    or new.valor_rematricula < 0
    or new.dia_vencimento_padrao not between 1 and 31
    or new.desconto_pontualidade < 0
    or new.juros_atraso < 0
    or new.multa_atraso_percentual not between 0 and 100
  then
    raise exception 'Regra financeira técnica inválida.' using errcode = '22023';
  end if;

  new.sincronizar_asaas_futuro := false;
  new.cronograma_financeiro := public.build_gestao_financial_schedule(
    coalesce(new.data_inicio, (pg_catalog.timezone('America/Maceio', now()))::date),
    new.valor_matricula,
    new.valor_parcela,
    new.valor_rematricula,
    new.qtd_parcelas,
    new.dia_vencimento_padrao
  );

  v_fingerprint := internal_academic.technical_financial_fingerprint(
    new.data_inicio,
    new.valor_matricula,
    new.valor_parcela,
    new.valor_rematricula,
    new.qtd_parcelas,
    new.dia_vencimento_padrao,
    new.desconto_pontualidade,
    new.juros_atraso,
    new.multa_atraso,
    new.multa_atraso_percentual,
    new.aplicar_desconto_matricula,
    new.aplicar_multa_juros_matricula,
    new.aplicar_desconto_mensalidade,
    new.aplicar_multa_juros_mensalidade,
    new.aplicar_desconto_rematricula,
    new.aplicar_multa_juros_rematricula,
    new.gerar_cobrancas_futuras
  );

  if tg_op = 'INSERT' then
    new.regra_financeira_revisao := 1;
  elsif old.regra_financeira_fingerprint is distinct from v_fingerprint then
    new.regra_financeira_revisao := greatest(coalesce(old.regra_financeira_revisao, 0) + 1, 1);
  else
    new.regra_financeira_revisao := old.regra_financeira_revisao;
  end if;
  new.regra_financeira_fingerprint := v_fingerprint;
  return new;
end;
$function$;

revoke all on function public.aplicar_padrao_financeiro_turma_tecnica()
  from public, anon, authenticated;

drop trigger if exists aplicar_padrao_financeiro_turma_tecnica_trigger
  on public.turmas;
drop trigger if exists sincronizar_multa_percentual_turma_tecnica_trigger
  on public.turmas;
create trigger aplicar_padrao_financeiro_turma_tecnica_trigger
before insert or update
on public.turmas
for each row
execute function public.aplicar_padrao_financeiro_turma_tecnica();

-- Reprojeta o cronograma das turmas técnicas a partir dos valores vivos. Não
-- toca em recebíveis já emitidos/pagos nem substitui R$ 150 por R$ 200 em
-- outras turmas: cada turma continua sendo sua própria autoridade.
update public.turmas class
set cronograma_financeiro = class.cronograma_financeiro
from public.cursos course
where course.id = class.curso_id
  and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO');

create table if not exists public.matriculas_tecnicas_financeiro_config (
  matricula_id uuid primary key,
  turma_id uuid not null,
  aluno_id uuid not null,
  status_financeiro text not null default 'PENDENTE'
    check (status_financeiro in ('PENDENTE', 'AGENDADA', 'GERADA')),
  primeiro_vencimento date,
  ativar_em timestamptz,
  regra_revisao integer not null,
  regra_fingerprint text not null,
  titulo_matricula_id uuid,
  last_error text,
  tentativas integer not null default 0 check (tentativas >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matriculas_tecnicas_financeiro_config_matricula_fk
    foreign key (matricula_id, turma_id, aluno_id)
    references public.matriculas (id, turma_id, aluno_id)
    on delete cascade,
  constraint matriculas_tecnicas_financeiro_config_titulo_fk
    foreign key (titulo_matricula_id)
    references public.contas_receber (id)
    on delete restrict,
  constraint matriculas_tecnicas_financeiro_config_agendamento_check
    check (
      (
        status_financeiro = 'PENDENTE'
        and ativar_em is null
        and titulo_matricula_id is null
      ) or (
        status_financeiro = 'AGENDADA'
        and ativar_em is not null
        and titulo_matricula_id is null
      ) or (
        status_financeiro = 'GERADA'
        and ativar_em is null
        and titulo_matricula_id is not null
      )
    )
);

create index if not exists matriculas_tecnicas_financeiro_turma_status_idx
  on public.matriculas_tecnicas_financeiro_config
    (turma_id, status_financeiro, ativar_em, matricula_id);
comment on constraint matriculas_tecnicas_financeiro_config_matricula_fk
  on public.matriculas_tecnicas_financeiro_config is
  'Estado operacional dependente da matrícula. A remoção canônica elimina a configuração; requests idempotentes e auditoria acadêmico-financeira preservam o histórico da intenção.';
create index if not exists matriculas_tecnicas_financeiro_aluno_idx
  on public.matriculas_tecnicas_financeiro_config (aluno_id, turma_id);

alter table public.matriculas_tecnicas_financeiro_config enable row level security;
revoke all on table public.matriculas_tecnicas_financeiro_config
  from public, anon, authenticated;
grant select on table public.matriculas_tecnicas_financeiro_config
  to service_role;

drop policy if exists matriculas_tecnicas_financeiro_select
  on public.matriculas_tecnicas_financeiro_config;
create policy matriculas_tecnicas_financeiro_select
on public.matriculas_tecnicas_financeiro_config
for select
to authenticated
using (
  public.can_operate_turma_academics(turma_id)
  and public.gestor_has_tab('gestao', 'financeiro')
);

create table if not exists internal_academic.technical_financial_requests (
  request_id uuid primary key,
  operation text not null,
  actor_id uuid,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on table internal_academic.technical_financial_requests
  from public, anon, authenticated, service_role;

create or replace function internal_academic.touch_technical_financial_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function internal_academic.touch_technical_financial_config()
  from public, anon, authenticated, service_role;

drop trigger if exists touch_technical_financial_config
  on public.matriculas_tecnicas_financeiro_config;
create trigger touch_technical_financial_config
before update on public.matriculas_tecnicas_financeiro_config
for each row execute function internal_academic.touch_technical_financial_config();

create or replace function internal_academic.guard_technical_financial_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.titulo_matricula_id is not null and not exists (
    select 1
    from public.contas_receber title
    where title.id = new.titulo_matricula_id
      and title.matricula_id = new.matricula_id
      and upper(coalesce(title.tipo_lancamento, '')) = 'MATRICULA'
  ) then
    raise exception 'O título informado não pertence à matrícula técnica.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_technical_financial_title()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_technical_financial_title
  on public.matriculas_tecnicas_financeiro_config;
create trigger guard_technical_financial_title
before insert or update
on public.matriculas_tecnicas_financeiro_config
for each row execute function internal_academic.guard_technical_financial_title();

create or replace function public.can_subscribe_technical_financial_topic(
  p_topic text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as materialized (
    select case
      when coalesce(p_topic, '') ~* (
        '^financeiro-matricula:turma:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then pg_catalog.split_part(p_topic, ':', 3)::uuid
    end as turma_id
  )
  select exists (
    select 1 from candidate
    where candidate.turma_id is not null
      and public.can_operate_turma_academics(candidate.turma_id)
      and public.gestor_has_tab('gestao', 'financeiro')
  );
$function$;
revoke all on function public.can_subscribe_technical_financial_topic(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_subscribe_technical_financial_topic(text)
  to authenticated;

grant select on table realtime.messages to authenticated;
drop policy if exists technical_financial_broadcast_select on realtime.messages;
create policy technical_financial_broadcast_select
on realtime.messages
for select
to authenticated
using (public.can_subscribe_technical_financial_topic(realtime.topic()));

create or replace function internal_academic.send_technical_financial_changed(
  p_event text,
  p_turma_id uuid,
  p_matricula_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_turma_id is null then return; end if;
  perform realtime.send(
    jsonb_build_object(
      'changed', true,
      'turmaId', p_turma_id,
      'matriculaId', p_matricula_id,
      'requestId', nullif(current_setting('app.technical_financial_request_id', true), ''),
      'origin', coalesce(
        nullif(current_setting('app.technical_financial_origin', true), ''),
        'DATABASE'
      )
    ),
    p_event,
    'financeiro-matricula:turma:' || p_turma_id::text,
    true
  );
end;
$function$;
revoke all on function internal_academic.send_technical_financial_changed(text, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.broadcast_technical_financial_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.regra_financeira_fingerprint is distinct from new.regra_financeira_fingerprint then
    perform internal_academic.send_technical_financial_changed(
      'rule-changed', new.id, null
    );
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.broadcast_technical_financial_rule()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_technical_financial_rule on public.turmas;
create trigger broadcast_technical_financial_rule
after update on public.turmas
for each row execute function internal_academic.broadcast_technical_financial_rule();

create or replace function internal_academic.broadcast_technical_financial_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform internal_academic.send_technical_financial_changed(
    'config-changed',
    coalesce(new.turma_id, old.turma_id),
    coalesce(new.matricula_id, old.matricula_id)
  );
  return coalesce(new, old);
end;
$function$;
revoke all on function internal_academic.broadcast_technical_financial_config()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_technical_financial_config
  on public.matriculas_tecnicas_financeiro_config;
create trigger broadcast_technical_financial_config
after insert or update or delete on public.matriculas_tecnicas_financeiro_config
for each row execute function internal_academic.broadcast_technical_financial_config();

alter table public.matriculas_tecnicas_financeiro_config
  disable trigger broadcast_technical_financial_config;

create or replace function internal_academic.broadcast_technical_financial_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula_id uuid := coalesce(new.matricula_id, old.matricula_id);
  v_turma_id uuid;
begin
  if v_matricula_id is null then return coalesce(new, old); end if;
  select config.turma_id into v_turma_id
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = v_matricula_id
    and (
      config.titulo_matricula_id = coalesce(new.id, old.id)
      or upper(coalesce(new.tipo_lancamento, old.tipo_lancamento, '')) = 'MATRICULA'
    );
  if v_turma_id is not null then
    perform internal_academic.send_technical_financial_changed(
      'title-changed', v_turma_id, v_matricula_id
    );
  end if;
  return coalesce(new, old);
end;
$function$;
revoke all on function internal_academic.broadcast_technical_financial_title()
  from public, anon, authenticated, service_role;

drop trigger if exists broadcast_technical_financial_title_change on public.contas_receber;
drop trigger if exists broadcast_technical_financial_title_update on public.contas_receber;
create trigger broadcast_technical_financial_title_change
after insert or delete on public.contas_receber
for each row execute function internal_academic.broadcast_technical_financial_title();
create trigger broadcast_technical_financial_title_update
after update of status, valor, data_vencimento on public.contas_receber
for each row execute function internal_academic.broadcast_technical_financial_title();

create or replace function internal_academic.technical_financial_rule(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_first_due date;
begin
  select class.*, upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;
  if v_turma.qtd_parcelas <> 12 then
    raise exception 'A regra técnica deve possuir 12 mensalidades.' using errcode = '22023';
  end if;
  v_first_due := greatest(coalesce(v_turma.data_inicio, v_today), v_today);
  return jsonb_build_object(
    'revisao', v_turma.regra_financeira_revisao,
    'fingerprint', v_turma.regra_financeira_fingerprint,
    'origem', 'TURMA',
    'valorMatricula', pg_catalog.to_char(v_turma.valor_matricula, 'FM999999990.00'),
    'valorMensalidade', pg_catalog.to_char(v_turma.valor_parcela, 'FM999999990.00'),
    'valorRematricula', pg_catalog.to_char(v_turma.valor_rematricula, 'FM999999990.00'),
    'mensalidadesPorCiclo', 12,
    'diaVencimento', v_turma.dia_vencimento_padrao,
    'primeiroVencimentoSugerido', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
    'ciclo', jsonb_build_array(
      jsonb_build_object('tipo', 'MATRICULA', 'quantidade', 1),
      jsonb_build_object('tipo', 'MENSALIDADE', 'quantidade', 12),
      jsonb_build_object('tipo', 'REMATRICULA', 'quantidade', 1)
    )
  );
end;
$function$;
revoke all on function internal_academic.technical_financial_rule(uuid)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_expected_technical_rule(
  p_turma_id uuid,
  p_expected_revision integer,
  p_expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb;
begin
  v_rule := internal_academic.technical_financial_rule(p_turma_id);
  if p_expected_revision is null or coalesce(p_expected_fingerprint, '') = ''
    or (v_rule->>'revisao')::integer <> p_expected_revision
    or v_rule->>'fingerprint' <> p_expected_fingerprint
  then
    raise exception 'A regra financeira da turma mudou. Recarregue e confirme os valores atuais.'
      using errcode = '40001';
  end if;
  return v_rule;
end;
$function$;
revoke all on function internal_academic.assert_expected_technical_rule(uuid, integer, text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.normalize_technical_first_due(
  p_candidate date,
  p_floor date
)
returns date
language sql
immutable
set search_path = ''
as $function$
  select greatest(coalesce(p_candidate, p_floor), p_floor);
$function$;
revoke all on function internal_academic.normalize_technical_first_due(date, date)
  from public, anon, authenticated, service_role;

-- Transferencia interna, retorno e recebimento externo preservam o estado
-- academico ATIVO do vinculo de destino, mas jamais devem criar cobranca por
-- efeito colateral. O antigo trigger de ativacao passa a materializar somente
-- a configuracao financeira PENDENTE, cobrindo tambem futuros entrypoints
-- academicos oficiais sem duplicar regra no frontend.
create or replace function internal_academic.ensure_technical_financial_pending(
  p_matricula_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment record;
  v_rule jsonb;
  v_due date;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
begin
  select
    enrollment.id,
    enrollment.turma_id,
    enrollment.aluno_id,
    enrollment.fluxo_operacional,
    enrollment.data_primeiro_vencimento_financeiro,
    class.data_inicio,
    upper(coalesce(course.modalidade, '')) as modalidade
  into v_enrollment
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_matricula_id;

  if not found
    or v_enrollment.modalidade not in ('TECNICO', 'TÉCNICO')
    or upper(coalesce(v_enrollment.fluxo_operacional, 'REGULAR')) = 'IMPLANTACAO'
  then
    return false;
  end if;

  -- Nunca rebaixa, reprograma ou desassocia um estado financeiro existente.
  -- Isso preserva GERADA/AGENDADA em reativações e torna o helper idempotente.
  if exists (
    select 1
    from public.matriculas_tecnicas_financeiro_config config
    where config.matricula_id = p_matricula_id
  ) then
    return false;
  end if;

  v_rule := internal_academic.technical_financial_rule(v_enrollment.turma_id);
  v_due := internal_academic.normalize_technical_first_due(
    coalesce(
      v_enrollment.data_primeiro_vencimento_financeiro,
      v_enrollment.data_inicio,
      (v_rule ->> 'primeiroVencimentoSugerido')::date
    ),
    v_today
  );

  -- Os defaults históricos de matriculas ainda marcam cobrança inicial como
  -- true. Neutralizamos somente o novo vínculo sem tocar no status acadêmico.
  perform internal_academic.authorize_matricula_control_update(p_matricula_id);
  update public.matriculas enrollment
  set
    gerar_cobranca_inicial = false,
    gerar_cobranca_futura = false,
    sincronizar_asaas = false,
    data_primeiro_vencimento_financeiro = v_due
  where enrollment.id = p_matricula_id;

  insert into public.matriculas_tecnicas_financeiro_config (
    matricula_id, turma_id, aluno_id, status_financeiro,
    primeiro_vencimento, ativar_em, regra_revisao, regra_fingerprint,
    titulo_matricula_id, last_error
  ) values (
    p_matricula_id,
    v_enrollment.turma_id,
    v_enrollment.aluno_id,
    'PENDENTE',
    v_due,
    null,
    (v_rule ->> 'revisao')::integer,
    v_rule ->> 'fingerprint',
    null,
    null
  )
  on conflict (matricula_id) do nothing;

  return found;
end;
$function$;

revoke all on function internal_academic.ensure_technical_financial_pending(uuid)
  from public, anon, authenticated, service_role;

-- A autorização transitória continua obrigatória. PENDENTE é usado pelo
-- pré-vínculo e ATIVO somente pelos entrypoints acadêmicos oficiais de
-- transferência/retorno, que já registram a autorização com o status exato.
create or replace function public.protect_technical_enrollment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_tecnico boolean := false;
  v_old_tecnico boolean := false;
  v_service boolean :=
    coalesce((select auth.role()), '') = 'service_role';
  v_activation boolean := tg_op = 'INSERT';
  v_authorized boolean;
begin
  select
    class.status,
    upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  into v_status, v_tecnico
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = new.turma_id;

  if tg_op = 'UPDATE' then
    select upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
    into v_old_tecnico
    from public.turmas class
    join public.cursos course on course.id = class.curso_id
    where class.id = old.turma_id;

    if (coalesce(v_tecnico, false) or coalesce(v_old_tecnico, false))
      and new.turma_id is distinct from old.turma_id
    then
      raise exception
        'Matrícula técnica deve mudar de turma somente pela transferência acadêmica.';
    end if;
    if (coalesce(v_tecnico, false) or coalesce(v_old_tecnico, false))
      and new.aluno_id is distinct from old.aluno_id
    then
      raise exception 'O aluno de uma matrícula técnica é imutável.';
    end if;
    v_activation := new.status = 'ATIVO' and old.status is distinct from 'ATIVO';
  end if;

  if not coalesce(v_tecnico, false) then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status not in ('PENDENTE', 'ATIVO') then
    raise exception 'Matrícula técnica nova deve iniciar pendente ou por continuidade acadêmica oficial.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
    and v_status = 'FINALIZADA'
    and (to_jsonb(new) - 'status' - 'updated_at')
      is distinct from
      (to_jsonb(old) - 'status' - 'updated_at')
  then
    raise exception 'Dados de matrícula técnica finalizada são imutáveis.';
  end if;

  if v_activation then
    if v_status not in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO') then
      raise exception 'Turma técnica finalizada não aceita matrícula ou reativação.';
    end if;
    if not v_service and not (select public.can_write_turma(new.turma_id)) then
      raise exception 'Sem permissão para matricular nesta turma técnica.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.status is distinct from old.status)
  then
    delete from internal_academic.transition_authorizations transition_auth
    where transition_auth.transaction_id = pg_current_xact_id()::text
      and transition_auth.backend_pid = pg_backend_pid()
      and transition_auth.entity = case
        when tg_op = 'INSERT' then 'MATRICULA_INSERT'
        else 'MATRICULA_STATUS'
      end
      and transition_auth.record_id = case
        when tg_op = 'INSERT' then new.turma_id
        else new.id
      end
      and transition_auth.new_status = new.status
    returning true into v_authorized;

    if not coalesce(v_authorized, false) then
      raise exception 'Use a ação acadêmica oficial para alterar matrícula técnica.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if v_status = 'FINALIZADA' and not (
      (old.status = 'ATIVO' and new.status in ('CONCLUIDO', 'REPROVADO', 'EM_DEPENDENCIA'))
      or (old.status = 'EM_DEPENDENCIA' and new.status = 'CONCLUIDO')
      or (old.status = 'REPROVADO' and new.status = 'EM_DEPENDENCIA')
    ) then
      raise exception 'Matrícula de turma técnica finalizada é somente leitura.';
    end if;
    if new.status in ('CONCLUIDO', 'REPROVADO', 'EM_DEPENDENCIA')
      and v_status <> 'FINALIZADA'
    then
      raise exception 'Conclusão, reprovação ou dependência exige a finalização acadêmica oficial.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_technical_enrollment_lifecycle()
  from public, anon, authenticated;

-- Substitui a fonte do problema: o trigger legado deixa de chamar
-- gerar_cobranca_matricula. A ativação financeira acontece exclusivamente nas
-- RPCs individuais/em lote desta migration.
create or replace function public.criar_financeiro_ao_matricular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'ATIVO' then
    perform internal_academic.ensure_technical_financial_pending(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.criar_financeiro_ao_matricular()
  from public, anon, authenticated;

create or replace function internal_academic.technical_financial_row(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_row record;
begin
  select
    enrollment.id as matricula_id,
    enrollment.aluno_id,
    student.nome as aluno_nome,
    enrollment.status as status_academico,
    config.status_financeiro,
    config.primeiro_vencimento,
    config.ativar_em,
    config.regra_revisao,
    config.regra_fingerprint,
    config.updated_at,
    class.regra_financeira_fingerprint as current_fingerprint,
    title.id as titulo_id,
    title.status as titulo_status,
    title.valor as titulo_valor,
    title.data_vencimento as titulo_vencimento
  into v_row
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  join public.turmas class on class.id = enrollment.turma_id
  left join public.matriculas_tecnicas_financeiro_config config
    on config.matricula_id = enrollment.id
  left join public.contas_receber title
    on title.id = config.titulo_matricula_id
  where enrollment.id = p_matricula_id;
  if not found then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'matriculaId', v_row.matricula_id,
    'alunoId', v_row.aluno_id,
    'alunoNome', v_row.aluno_nome,
    'statusAcademico', v_row.status_academico,
    'financeiro', jsonb_build_object(
      'status', coalesce(v_row.status_financeiro, 'NAO_CONFIGURADO'),
      'primeiroVencimento', v_row.primeiro_vencimento,
      'ativarEm', v_row.ativar_em,
      'regraRevisao', v_row.regra_revisao,
      'regraFingerprint', v_row.regra_fingerprint,
      'regraDesatualizada', v_row.regra_fingerprint is distinct from v_row.current_fingerprint,
      'titulo', case when v_row.titulo_id is null then null else jsonb_build_object(
        'id', v_row.titulo_id,
        'status', v_row.titulo_status,
        'valor', pg_catalog.to_char(v_row.titulo_valor, 'FM999999990.00'),
        'vencimento', pg_catalog.to_char(v_row.titulo_vencimento, 'YYYY-MM-DD')
      ) end,
      'updatedAt', v_row.updated_at
    )
  );
end;
$function$;
revoke all on function internal_academic.technical_financial_row(uuid)
  from public, anon, authenticated, service_role;

-- Todos os vínculos técnicos existentes recebem estado explícito. Sem título,
-- ficam PENDENTE e nenhuma cobrança é criada. Com título inicial histórico,
-- ficam GERADA e o título apenas é referenciado.
insert into public.matriculas_tecnicas_financeiro_config (
  matricula_id, turma_id, aluno_id, status_financeiro, primeiro_vencimento,
  ativar_em, regra_revisao, regra_fingerprint, titulo_matricula_id
)
select
  enrollment.id,
  enrollment.turma_id,
  enrollment.aluno_id,
  case when title.id is null then 'PENDENTE' else 'GERADA' end,
  case
    when title.id is not null then title.data_vencimento
    else greatest(
      coalesce(enrollment.data_primeiro_vencimento_financeiro, class.data_inicio, local_day.today),
      local_day.today
    )
  end,
  null,
  class.regra_financeira_revisao,
  class.regra_financeira_fingerprint,
  title.id
from public.matriculas enrollment
join public.turmas class on class.id = enrollment.turma_id
join public.cursos course on course.id = class.curso_id
cross join lateral (
  select (pg_catalog.timezone('America/Maceio', now()))::date as today
) local_day
left join lateral (
  select receivable.id, receivable.data_vencimento
  from public.contas_receber receivable
  where receivable.matricula_id = enrollment.id
    and upper(coalesce(receivable.tipo_lancamento, '')) = 'MATRICULA'
  order by receivable.created_at, receivable.id
  limit 1
) title on true
where upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO')
  and upper(coalesce(enrollment.fluxo_operacional, 'REGULAR')) <> 'IMPLANTACAO'
on conflict (matricula_id) do nothing;

do $backfill$
declare
  v_matricula_id uuid;
begin
  for v_matricula_id in
    select config.matricula_id
    from public.matriculas_tecnicas_financeiro_config config
    where config.status_financeiro = 'PENDENTE'
    order by config.matricula_id
  loop
    perform internal_academic.authorize_matricula_control_update(v_matricula_id);
    update public.matriculas enrollment
    set
      gerar_cobranca_inicial = false,
      gerar_cobranca_futura = false,
      sincronizar_asaas = false
    where enrollment.id = v_matricula_id;
  end loop;
end;
$backfill$;

alter table public.matriculas_tecnicas_financeiro_config
  enable trigger broadcast_technical_financial_config;

create or replace function public.obter_pre_vinculo_aluno_tecnico_contexto_secure(
  p_turma_id uuid,
  p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_aluno record;
  v_rule jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'alunos')
  ) then
    raise exception 'Sem permissão para vincular aluno nesta turma.' using errcode = '42501';
  end if;
  select class.id, class.codigo, class.nome, class.polo_id, class.status,
    upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;
  select student.id, student.nome into v_aluno
  from public.parceiros student
  where student.id = p_aluno_id and student.tipo = 'Aluno';
  if not found then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  v_rule := internal_academic.technical_financial_rule(p_turma_id);
  return jsonb_build_object(
    'turma', jsonb_build_object(
      'turmaId', v_turma.id,
      'codigo', v_turma.codigo,
      'nome', v_turma.nome,
      'poloId', v_turma.polo_id,
      'status', v_turma.status
    ),
    'aluno', jsonb_build_object('alunoId', v_aluno.id, 'nome', v_aluno.nome),
    'regra', jsonb_build_object(
      'revisao', (v_rule->>'revisao')::integer,
      'fingerprint', v_rule->>'fingerprint',
      'primeiroVencimentoSugerido', v_rule->>'primeiroVencimentoSugerido'
    )
  );
end;
$function$;

create or replace function public.obter_financeiro_matricula_tecnica_workspace_secure(
  p_turma_id uuid,
  p_aluno_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_aluno jsonb := null;
  v_rows jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão para consultar esta turma.' using errcode = '42501';
  end if;
  select class.id, class.codigo, class.nome, class.polo_id, class.status,
    upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;
  if p_aluno_id is not null then
    select jsonb_build_object('alunoId', student.id, 'nome', student.nome)
    into v_aluno from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno';
    if v_aluno is null then
      raise exception 'Aluno não encontrado.' using errcode = '22023';
    end if;
  end if;
  select coalesce(jsonb_agg(
    internal_academic.technical_financial_row(enrollment.id)
    order by student.nome, enrollment.id
  ), '[]'::jsonb)
  into v_rows
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  where enrollment.turma_id = p_turma_id
    and (p_aluno_id is null or enrollment.aluno_id = p_aluno_id);
  return jsonb_build_object(
    'turma', jsonb_build_object(
      'turmaId', v_turma.id,
      'codigo', v_turma.codigo,
      'nome', v_turma.nome,
      'poloId', v_turma.polo_id,
      'status', v_turma.status
    ),
    'regra', internal_academic.technical_financial_rule(p_turma_id),
    'aluno', v_aluno,
    'matriculas', v_rows
  );
end;
$function$;

create or replace function public.pre_vincular_aluno_tecnico_secure(
  p_turma_id uuid,
  p_aluno_id uuid,
  p_request_id uuid,
  p_primeiro_vencimento date default null,
  p_expected_regra_revisao integer default null,
  p_expected_regra_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb;
  v_turma public.turmas%rowtype;
  v_matricula public.matriculas%rowtype;
  v_existing record;
  v_payload_hash text;
  v_response jsonb;
  v_today date := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_due date;
  v_public_rule jsonb;
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'alunos')
  ) then
    raise exception 'Sem permissão para vincular aluno nesta turma.' using errcode = '42501';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id, 'alunoId', p_aluno_id,
      'primeiroVencimento', p_primeiro_vencimento,
      'regraRevisao', p_expected_regra_revisao,
      'regraFingerprint', p_expected_regra_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.technical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'PRE_VINCULO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  select class.* into v_turma from public.turmas class where class.id = p_turma_id for update;
  if not found then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  v_rule := internal_academic.assert_expected_technical_rule(
    p_turma_id, p_expected_regra_revisao, p_expected_regra_fingerprint
  );
  v_public_rule := jsonb_build_object(
    'revisao', (v_rule->>'revisao')::integer,
    'fingerprint', v_rule->>'fingerprint',
    'primeiroVencimentoSugerido', v_rule->>'primeiroVencimentoSugerido'
  );
  if p_primeiro_vencimento is not null and p_primeiro_vencimento < v_today then
    raise exception 'O primeiro vencimento não pode estar no passado.' using errcode = '22023';
  end if;
  v_due := internal_academic.normalize_technical_first_due(
    coalesce(p_primeiro_vencimento, (v_rule->>'primeiroVencimentoSugerido')::date),
    v_today
  );

  if not exists (
    select 1 from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno'
  ) then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  perform public.assert_aluno_sem_matricula_curso_duplicada(p_aluno_id, v_turma.curso_id, p_turma_id);
  perform 1
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  for update;
  if found then
    raise exception 'Aluno já vinculado. Alterações posteriores pertencem ao módulo Financeiro.'
      using errcode = '22023';
  end if;
  insert into public.matriculas (
    aluno_id, turma_id, status,
    valor_matricula_individual, valor_rematricula_individual,
    valor_parcela_individual, dia_vencimento_individual,
    data_primeiro_vencimento_financeiro, financeiro_herdado,
    gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas,
    desconto_pontualidade_individual, juros_atraso_individual,
    multa_atraso_individual, multa_atraso_percentual_individual,
    fluxo_operacional
  ) values (
    p_aluno_id, p_turma_id, 'PENDENTE',
    v_turma.valor_matricula, v_turma.valor_rematricula,
    v_turma.valor_parcela, v_turma.dia_vencimento_padrao,
    v_due, false, false, false, false,
    v_turma.desconto_pontualidade, v_turma.juros_atraso,
    v_turma.multa_atraso, v_turma.multa_atraso_percentual,
    'REGULAR'
  )
  returning * into v_matricula;

  insert into public.matriculas_tecnicas_financeiro_config (
    matricula_id, turma_id, aluno_id, status_financeiro,
    primeiro_vencimento, ativar_em, regra_revisao, regra_fingerprint,
    titulo_matricula_id, last_error
  ) values (
    v_matricula.id, p_turma_id, p_aluno_id, 'PENDENTE',
    v_due, null, (v_rule->>'revisao')::integer, v_rule->>'fingerprint', null, null
  );

  perform public.sync_aluno_polo_scope(v_matricula.aluno_id, v_turma.polo_id);
  perform public.registrar_turma_financeiro_auditoria(
    v_matricula.id, 'MATRICULA_TECNICA_PRE_VINCULO', v_rule,
    'Aluno vinculado sem criar título ou cobrança externa.'
  );
  insert into public.matricula_movimentacoes (
    matricula_id, aluno_id, tipo, status_anterior, status_novo,
    turma_destino_id, motivo, responsavel_id
  ) values (
    v_matricula.id, v_matricula.aluno_id, 'MATRICULA', null,
    v_matricula.status, v_matricula.turma_id,
    'Pré-vínculo técnico sem geração de cobrança.', null
  ) on conflict do nothing;
  v_response := jsonb_build_object(
    'operacao', 'PRE_VINCULO', 'requestId', p_request_id,
    'replayed', false,
    'matricula', internal_academic.technical_financial_row(v_matricula.id),
    'regraAplicada', v_public_rule, 'cobrancaGerada', false
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'PRE_VINCULO', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

create or replace function internal_academic.activate_technical_financial_enrollment(
  p_matricula_id uuid,
  p_mode text,
  p_activate_at timestamptz default null,
  p_require_matching_scheduled_rule boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma public.turmas%rowtype;
  v_matricula public.matriculas%rowtype;
  v_config public.matriculas_tecnicas_financeiro_config%rowtype;
  v_rule jsonb;
  v_title public.contas_receber%rowtype;
  v_floor date;
  v_due date;
begin
  select enrollment.turma_id into v_matricula.turma_id
  from public.matriculas enrollment where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  select class.* into v_turma from public.turmas class
  where class.id = v_matricula.turma_id for update;
  if upper(coalesce(v_turma.status, '')) not in ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO') then
    raise exception 'O estado da turma não permite ativar ou agendar o financeiro.' using errcode = '22023';
  end if;
  select enrollment.* into v_matricula from public.matriculas enrollment
  where enrollment.id = p_matricula_id for update;
  select config.* into v_config
  from public.matriculas_tecnicas_financeiro_config config
  where config.matricula_id = p_matricula_id for update;
  if not found then raise exception 'Financeiro técnico não configurado.' using errcode = '22023'; end if;
  v_rule := internal_academic.technical_financial_rule(v_turma.id);
  if upper(coalesce(v_matricula.fluxo_operacional, 'REGULAR')) = 'IMPLANTACAO'
    or exists (
      select 1 from public.matricula_liberacoes_diario release
      where release.matricula_id = p_matricula_id and release.revogado_em is null
    )
  then
    raise exception 'Matrícula em implantação não pode ativar financeiro.' using errcode = '22023';
  end if;
  if upper(coalesce(v_matricula.status, '')) not in ('PENDENTE', 'ATIVO') then
    raise exception 'O estado acadêmico da matrícula não permite gerar cobrança.' using errcode = '22023';
  end if;
  if p_require_matching_scheduled_rule
    and v_config.regra_fingerprint is distinct from (v_rule->>'fingerprint')
  then
    update public.matriculas_tecnicas_financeiro_config set
      status_financeiro = 'PENDENTE', ativar_em = null,
      last_error = 'A regra financeira mudou; é necessária nova confirmação.'
    where matricula_id = p_matricula_id;
    return internal_academic.technical_financial_row(p_matricula_id);
  end if;
  if v_config.status_financeiro = 'GERADA' and v_config.titulo_matricula_id is not null then
    if upper(coalesce(p_mode, '')) = 'AGORA' then
      return internal_academic.technical_financial_row(p_matricula_id);
    end if;
    raise exception 'Uma matrícula já gerada não pode voltar para agendada.' using errcode = '22023';
  end if;
  if upper(coalesce(p_mode, '')) = 'AGENDADA' then
    if p_activate_at is null or p_activate_at <= now() then
      raise exception 'A ativação agendada deve usar data e hora futuras.' using errcode = '22023';
    end if;
    v_floor := (pg_catalog.timezone('America/Maceio', p_activate_at))::date;
    v_due := internal_academic.normalize_technical_first_due(v_config.primeiro_vencimento, v_floor);
    update public.matriculas_tecnicas_financeiro_config set
      status_financeiro = 'AGENDADA', primeiro_vencimento = v_due,
      ativar_em = p_activate_at, regra_revisao = (v_rule->>'revisao')::integer,
      regra_fingerprint = v_rule->>'fingerprint', titulo_matricula_id = null,
      last_error = null
    where matricula_id = p_matricula_id;
    return internal_academic.technical_financial_row(p_matricula_id);
  elsif upper(coalesce(p_mode, '')) <> 'AGORA' then
    raise exception 'Modo de ativação inválido.' using errcode = '22023';
  end if;
  if p_activate_at is not null then
    raise exception 'AGORA não aceita data de agendamento.' using errcode = '22023';
  end if;
  v_floor := (pg_catalog.timezone('America/Maceio', now()))::date;
  v_due := internal_academic.normalize_technical_first_due(v_config.primeiro_vencimento, v_floor);
  perform internal_academic.authorize_matricula_control_update(p_matricula_id);
  update public.matriculas set
    valor_matricula_individual = v_turma.valor_matricula,
    valor_rematricula_individual = v_turma.valor_rematricula,
    valor_parcela_individual = v_turma.valor_parcela,
    dia_vencimento_individual = v_turma.dia_vencimento_padrao,
    data_primeiro_vencimento_financeiro = v_due,
    financeiro_herdado = false,
    gerar_cobranca_inicial = true,
    gerar_cobranca_futura = coalesce(v_turma.gerar_cobrancas_futuras, false),
    sincronizar_asaas = false,
    desconto_pontualidade_individual = v_turma.desconto_pontualidade,
    juros_atraso_individual = v_turma.juros_atraso,
    multa_atraso_individual = v_turma.multa_atraso,
    multa_atraso_percentual_individual = v_turma.multa_atraso_percentual
  where id = p_matricula_id;
  v_title := public.gerar_cobranca_matricula(p_matricula_id);
  if v_title.id is null then
    raise exception 'Não foi possível gerar o título inicial da matrícula.' using errcode = 'P0001';
  end if;
  update public.matriculas_tecnicas_financeiro_config set
    status_financeiro = 'GERADA', primeiro_vencimento = v_due, ativar_em = null,
    regra_revisao = (v_rule->>'revisao')::integer,
    regra_fingerprint = v_rule->>'fingerprint', titulo_matricula_id = v_title.id,
    last_error = null, tentativas = tentativas + 1
  where matricula_id = p_matricula_id;
  perform public.registrar_turma_financeiro_auditoria(
    p_matricula_id, 'MATRICULA_TECNICA_FINANCEIRO_ATIVADO', v_rule,
    'Título inicial local gerado sem envio automático a gateway.'
  );
  return internal_academic.technical_financial_row(p_matricula_id);
end;
$function$;
revoke all on function internal_academic.activate_technical_financial_enrollment(uuid, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.ativar_financeiro_matricula_tecnica_secure(
  p_matricula_id uuid,
  p_modo text,
  p_request_id uuid,
  p_ativar_em timestamptz default null,
  p_expected_regra_revisao integer default null,
  p_expected_regra_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_turma_id uuid;
  v_rule jsonb;
  v_row jsonb;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  select enrollment.turma_id into v_turma_id from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then raise exception 'Matrícula não encontrada.' using errcode = '22023'; end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(v_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'matriculaId', p_matricula_id, 'modo', upper(coalesce(p_modo, '')),
      'ativarEm', p_ativar_em, 'regraRevisao', p_expected_regra_revisao,
      'regraFingerprint', p_expected_regra_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_financial_requests request where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'ATIVACAO_INDIVIDUAL'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  perform 1 from public.turmas class where class.id = v_turma_id for update;
  v_rule := internal_academic.assert_expected_technical_rule(
    v_turma_id, p_expected_regra_revisao, p_expected_regra_fingerprint
  );
  v_row := internal_academic.activate_technical_financial_enrollment(
    p_matricula_id, upper(p_modo), p_ativar_em, false
  );
  v_response := jsonb_build_object(
    'operacao', 'ATIVACAO_INDIVIDUAL', 'modo', upper(p_modo),
    'requestId', p_request_id, 'replayed', false, 'matricula', v_row,
    'regraAplicada', v_rule, 'titulo', v_row->'financeiro'->'titulo'
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'ATIVACAO_INDIVIDUAL', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

create or replace function public.ativar_financeiro_matriculas_tecnicas_lote_secure(
  p_turma_id uuid,
  p_matricula_ids uuid[],
  p_modo text,
  p_request_id uuid,
  p_ativar_em timestamptz default null,
  p_expected_regra_revisao integer default null,
  p_expected_regra_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb;
  v_id uuid;
  v_row jsonb;
  v_results jsonb := '[]'::jsonb;
  v_payload_hash text;
  v_existing record;
  v_response jsonb;
  v_count integer;
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  perform set_config('app.technical_financial_request_id', p_request_id::text, true);
  perform set_config('app.technical_financial_origin', 'MUTATION', true);
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then raise exception 'Sem permissão financeira nesta turma.' using errcode = '42501'; end if;
  if p_matricula_ids is null or cardinality(p_matricula_ids) not between 1 and 100 then
    raise exception 'O lote deve conter de 1 a 100 matrículas.' using errcode = '22023';
  end if;
  select count(distinct item) into v_count from unnest(p_matricula_ids) item;
  if v_count <> cardinality(p_matricula_ids) then
    raise exception 'O lote contém matrículas duplicadas.' using errcode = '22023';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'matriculaIds', (select jsonb_agg(item order by item) from unnest(p_matricula_ids) item),
      'modo', upper(coalesce(p_modo, '')), 'ativarEm', p_ativar_em,
      'regraRevisao', p_expected_regra_revisao,
      'regraFingerprint', p_expected_regra_fingerprint
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('technical-finance-request:' || p_request_id::text, 0));
  select request.operation, request.actor_id, request.payload_hash, request.response into v_existing
  from internal_academic.technical_financial_requests request where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'ATIVACAO_LOTE'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  perform 1 from public.turmas class where class.id = p_turma_id for update;
  select count(*) into v_count from public.matriculas enrollment
  join public.matriculas_tecnicas_financeiro_config config on config.matricula_id = enrollment.id
  where enrollment.id = any(p_matricula_ids) and enrollment.turma_id = p_turma_id;
  if v_count <> cardinality(p_matricula_ids) then
    raise exception 'O lote contém matrícula fora da turma ou sem configuração.' using errcode = '22023';
  end if;
  v_rule := internal_academic.assert_expected_technical_rule(
    p_turma_id, p_expected_regra_revisao, p_expected_regra_fingerprint
  );
  for v_id in select distinct item from unnest(p_matricula_ids) item order by item loop
    v_row := internal_academic.activate_technical_financial_enrollment(
      v_id, upper(p_modo), p_ativar_em, false
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'matriculaId', v_id,
      'status', v_row->'financeiro'->>'status',
      'titulo', v_row->'financeiro'->'titulo'
    ));
  end loop;
  v_response := jsonb_build_object(
    'operacao', 'ATIVACAO_LOTE', 'modo', upper(p_modo),
    'requestId', p_request_id, 'replayed', false, 'turmaId', p_turma_id,
    'total', jsonb_array_length(v_results), 'resultados', v_results
  );
  insert into internal_academic.technical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (p_request_id, 'ATIVACAO_LOTE', auth.uid(), v_payload_hash, v_response);
  return v_response;
end;
$function$;

create or replace function public.processar_ativacoes_financeiras_tecnicas_agendadas(
  p_limite integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_row jsonb;
begin
  if p_limite not between 1 and 500 then
    raise exception 'Limite inválido.' using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('scheduled-technical-finance-worker', 0)) then
    return jsonb_build_object('processados', 0, 'falhas', 0, 'ocupado', true);
  end if;
  perform set_config('app.technical_financial_request_id', '', true);
  perform set_config('app.technical_financial_origin', 'SCHEDULED_WORKER', true);
  for v_item in
    select config.matricula_id
    from public.matriculas_tecnicas_financeiro_config config
    where config.status_financeiro = 'AGENDADA' and config.ativar_em <= now()
    order by config.ativar_em, config.matricula_id
    limit p_limite
  loop
    begin
      v_row := internal_academic.activate_technical_financial_enrollment(
        v_item.matricula_id, 'AGORA', null, true
      );
      if v_row->'financeiro'->>'status' = 'GERADA' then
        v_processed := v_processed + 1;
      else
        v_failed := v_failed + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      update public.matriculas_tecnicas_financeiro_config set
        status_financeiro = 'PENDENTE', ativar_em = null,
        last_error = left(sqlerrm, 500), tentativas = tentativas + 1
      where matricula_id = v_item.matricula_id;
    end;
  end loop;
  return jsonb_build_object('processados', v_processed, 'falhas', v_failed, 'ocupado', false);
end;
$function$;

-- Fecha o entrypoint técnico legado que aceitava valores e flags do browser.
-- Cursos não técnicos preservam exatamente o fluxo anterior.
create or replace function public.matricular_aluno_turma_financeiro(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_responsavel_id uuid default null,
  p_valor_matricula numeric default null,
  p_data_vencimento_matricula date default null,
  p_valor_parcela numeric default null,
  p_valor_rematricula numeric default null,
  p_dia_vencimento integer default null,
  p_financeiro_herdado boolean default null,
  p_gerar_cobranca_inicial boolean default null,
  p_gerar_cobranca_futura boolean default null,
  p_sincronizar_asaas boolean default null
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.gestor_has_module('gestao') and public.can_write_turma(p_turma_id)
  ) then raise exception 'Sem permissão para matricular aluno nesta turma.' using errcode = '42501'; end if;
  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.turmas class join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_modalidade is null then raise exception 'Turma não encontrada.' using errcode = '22023'; end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'Use o pré-vínculo técnico e a ativação financeira canônica.' using errcode = '22023';
  end if;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'ATIVO');
  return internal_academic.legacy_matricular_aluno_turma_financeiro(
    p_aluno_id, p_turma_id, p_responsavel_id, p_valor_matricula,
    coalesce(p_data_vencimento_matricula, (pg_catalog.timezone('America/Maceio', now()))::date),
    p_valor_parcela, p_valor_rematricula, p_dia_vencimento,
    p_financeiro_herdado, p_gerar_cobranca_inicial,
    p_gerar_cobranca_futura, p_sincronizar_asaas
  );
end;
$function$;

-- Os checkouts legados não podem contornar o estado PENDENTE nem reativar Asaas
-- para cursos técnicos. Cursos não técnicos preservam o comportamento vigente.
create or replace function public.payment_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean default false
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_id uuid;
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and public.current_aluno_id() is distinct from p_aluno_id
  then
    raise exception 'O checkout só pode alterar a matrícula do próprio aluno.' using errcode = '42501';
  end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'O checkout não pode gerar cobrança para curso técnico; use a ativação financeira canônica.'
      using errcode = '22023';
  end if;

  select enrollment.id into v_existing_id
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  order by enrollment.data_matricula desc nulls last
  limit 1;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  if v_existing_id is not null then
    perform internal_academic.authorize_matricula_control_update(v_existing_id);
  end if;
  return public.p1_payment_checkout_upsert_matricula_20260731(
    p_aluno_id, p_turma_id, p_gerar_cobranca_futura
  );
end;
$function$;

create or replace function public.asaas_checkout_upsert_matricula(
  p_aluno_id uuid,
  p_turma_id uuid,
  p_gerar_cobranca_futura boolean default false
)
returns public.matriculas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing_id uuid;
  v_modalidade text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'O checkout Asaas legado é restrito à integração de encerramento.' using errcode = '42501';
  end if;

  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if v_modalidade is null then
    raise exception 'Turma não encontrada.' using errcode = '22023';
  end if;
  if v_modalidade in ('TECNICO', 'TÉCNICO') then
    raise exception 'O checkout Asaas legado não pode processar curso técnico.' using errcode = '22023';
  end if;

  select enrollment.id into v_existing_id
  from public.matriculas enrollment
  where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id
  order by enrollment.data_matricula desc nulls last
  limit 1;
  perform internal_academic.authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE');
  if v_existing_id is not null then
    perform internal_academic.authorize_matricula_control_update(v_existing_id);
  end if;
  return public.p1_asaas_checkout_upsert_matricula_20260731(
    p_aluno_id, p_turma_id, p_gerar_cobranca_futura
  );
end;
$function$;

revoke all on function public.obter_pre_vinculo_aluno_tecnico_contexto_secure(uuid, uuid)
  from public, anon;
revoke all on function public.obter_financeiro_matricula_tecnica_workspace_secure(uuid, uuid)
  from public, anon;
revoke all on function public.pre_vincular_aluno_tecnico_secure(uuid, uuid, uuid, date, integer, text)
  from public, anon;
revoke all on function public.ativar_financeiro_matricula_tecnica_secure(uuid, text, uuid, timestamptz, integer, text)
  from public, anon;
revoke all on function public.ativar_financeiro_matriculas_tecnicas_lote_secure(uuid, uuid[], text, uuid, timestamptz, integer, text)
  from public, anon;
revoke all on function public.processar_ativacoes_financeiras_tecnicas_agendadas(integer)
  from public, anon, authenticated;
grant execute on function public.obter_pre_vinculo_aluno_tecnico_contexto_secure(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.obter_financeiro_matricula_tecnica_workspace_secure(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.pre_vincular_aluno_tecnico_secure(uuid, uuid, uuid, date, integer, text)
  to authenticated, service_role;
grant execute on function public.ativar_financeiro_matricula_tecnica_secure(uuid, text, uuid, timestamptz, integer, text)
  to authenticated, service_role;
grant execute on function public.ativar_financeiro_matriculas_tecnicas_lote_secure(uuid, uuid[], text, uuid, timestamptz, integer, text)
  to authenticated, service_role;
grant execute on function public.processar_ativacoes_financeiras_tecnicas_agendadas(integer)
  to service_role;

do $block$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(job.jobid)
    from cron.job job
    where job.jobname = 'activate-scheduled-technical-finance-every-minute';
    perform cron.schedule(
      'activate-scheduled-technical-finance-every-minute',
      '* * * * *',
      'select public.processar_ativacoes_financeiras_tecnicas_agendadas(100);'
    );
  end if;
end;
$block$;

notify pgrst, 'reload schema';
commit;
