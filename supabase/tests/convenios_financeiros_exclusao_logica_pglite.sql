create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema extensions;

create function auth.role() returns text language sql stable as $function$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$function$;

create function auth.uid() returns uuid language sql stable as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

-- PGlite não inclui pgcrypto. O stub só exercita canonicalização e replay;
-- a implementação criptográfica real pertence ao ambiente Supabase.
create function extensions.digest(p_data bytea, p_algorithm text)
returns bytea language sql immutable as $function$
  select decode(
    md5(encode(p_data, 'hex')) || md5(encode(p_data, 'escape') || p_algorithm),
    'hex'
  );
$function$;

create function public.is_financeiro_for_polo(p_polo_id uuid)
returns boolean language sql stable as $function$
  select case
    when current_setting('test.can_financeiro', true) = 'null' then null
    else coalesce(current_setting('test.can_financeiro', true), 'false') = 'true'
      and nullif(current_setting('test.polo_id', true), '')::uuid = p_polo_id
  end;
$function$;

create function public.is_financeiro_global()
returns boolean language sql stable as $function$
  select false;
$function$;

create function public.gestor_has_effective_financeiro_tab(p_tab text)
returns boolean language sql stable as $function$
  select case
    when current_setting('test.can_tab', true) = 'null' then null
    else coalesce(current_setting('test.can_tab', true), 'false') = 'true'
      and p_tab = 'convenios'
  end;
$function$;

create table public.empresas (
  id uuid primary key
);

create table public.polos (
  id uuid primary key,
  company_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null
);

create table public.parceiros (
  id uuid primary key,
  nome text not null
);

create table public.contas_bancarias (
  id uuid primary key,
  banco text,
  conta text
);

create table public.contas_receber (
  id uuid primary key
);

create table public.despesas_lancamentos (
  id uuid primary key,
  status text not null,
  data_pagamento date,
  data_lancamento date,
  data_vencimento date,
  descricao text not null,
  observacao text,
  conta_bancaria_id uuid references public.contas_bancarias(id) on delete restrict
);

create table public.convenios_financeiros (
  id uuid primary key,
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  parceiro_id uuid references public.parceiros(id) on delete restrict,
  nome text not null,
  observacao text,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ARQUIVADO')),
  request_id uuid not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.convenios_financeiros_competencias (
  id uuid primary key,
  convenio_id uuid not null references public.convenios_financeiros(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  competencia date not null,
  status text not null default 'ABERTO' check (status in ('ABERTO', 'FINALIZADO')),
  saldo_inicial numeric(15,2) not null default 0,
  creditos_fechamento numeric(15,2),
  despesas_fechamento numeric(15,2),
  saldo_final numeric(15,2),
  competencia_anterior_id uuid unique
    references public.convenios_financeiros_competencias(id) on delete restrict,
  observacao text,
  fechado_em timestamptz,
  fechado_por uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convenio_id, competencia)
);

create table public.convenios_financeiros_creditos (
  id uuid primary key,
  competencia_id uuid not null
    references public.convenios_financeiros_competencias(id) on delete restrict,
  convenio_id uuid not null references public.convenios_financeiros(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  conta_receber_id uuid not null unique references public.contas_receber(id) on delete restrict,
  conta_bancaria_id uuid not null references public.contas_bancarias(id) on delete restrict,
  data_credito date not null,
  valor numeric(15,2) not null,
  forma_recebimento text not null,
  descricao text not null,
  observacao text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.convenios_financeiros_despesas (
  id uuid primary key,
  competencia_id uuid not null
    references public.convenios_financeiros_competencias(id) on delete restrict,
  convenio_id uuid not null references public.convenios_financeiros(id) on delete restrict,
  company_id uuid not null references public.empresas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  despesa_lancamento_id uuid not null unique
    references public.despesas_lancamentos(id) on delete restrict,
  valor_vinculado numeric(15,2) not null,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ESTORNADO')),
  estorno_motivo text,
  estornado_em timestamptz,
  estornado_por uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.convenios_financeiros_operacoes_requisicoes (
  request_id uuid primary key,
  convenio_id uuid references public.convenios_financeiros(id) on delete restrict,
  competencia_id uuid references public.convenios_financeiros_competencias(id) on delete restrict,
  operacao text not null constraint convenios_financeiros_operacoes_requisicoes_operacao_check
    check (operacao in (
      'CRIAR_CONVENIO', 'LANCAR_CREDITO', 'VINCULAR_DESPESA',
      'CRIAR_DESPESA', 'FINALIZAR_MES'
    )),
  actor_id uuid,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb not null,
  created_at timestamptz not null default now()
);

create function public.convenios_financeiros_mes_item_secure(p_competencia_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', mes.id,
    'convenio_id', convenio.id,
    'convenio_nome', convenio.nome,
    'parceiro_id', convenio.parceiro_id,
    'parceiro_nome', parceiro.nome,
    'polo_id', mes.polo_id,
    'polo_nome', polo.nome,
    'competencia', mes.competencia,
    'status', mes.status,
    'saldo_inicial', mes.saldo_inicial,
    'creditos', coalesce((
      select sum(credito.valor)
      from public.convenios_financeiros_creditos credito
      where credito.competencia_id = mes.id
    ), 0),
    'despesas_pagas', coalesce((
      select sum(vinculo.valor_vinculado)
      from public.convenios_financeiros_despesas vinculo
      join public.despesas_lancamentos despesa
        on despesa.id = vinculo.despesa_lancamento_id
      where vinculo.competencia_id = mes.id
        and vinculo.status = 'ATIVO' and despesa.status = 'PAGO'
    ), 0),
    'despesas_pendentes', 0,
    'saldo_disponivel', mes.saldo_inicial,
    'saldo_projetado', mes.saldo_inicial,
    'quantidade_creditos', (
      select count(*) from public.convenios_financeiros_creditos credito
      where credito.competencia_id = mes.id
    ),
    'quantidade_despesas', (
      select count(*) from public.convenios_financeiros_despesas vinculo
      where vinculo.competencia_id = mes.id and vinculo.status = 'ATIVO'
    ),
    'fechado_em', mes.fechado_em,
    'observacao', mes.observacao,
    'sucessora_id', sucessora.id
  )
  from public.convenios_financeiros_competencias mes
  join public.convenios_financeiros convenio on convenio.id = mes.convenio_id
  join public.polos polo on polo.id = mes.polo_id
  left join public.parceiros parceiro on parceiro.id = convenio.parceiro_id
  left join public.convenios_financeiros_competencias sucessora
    on sucessora.competencia_anterior_id = mes.id
  where mes.id = p_competencia_id;
$function$;
