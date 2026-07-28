-- Ledger remoto: 20260728073832
-- Registro canônico e exposição pública segura do Diário de Classe.
--
-- O diário pertence à combinação turma + disciplina, portanto não pode usar
-- documentos_validacao, cuja identidade exige aluno e matrícula. Esta tabela
-- própria mantém o mesmo contrato público de política, snapshot e kill switch
-- sem reabrir leitura anônima em documentos_templates.

create table public.diarios_validacao (
  id uuid primary key default gen_random_uuid(),
  identidade text not null unique,
  codigo text not null unique,
  turma_id uuid not null references public.turmas(id) on delete restrict,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  polo_id uuid not null references public.polos(id) on delete restrict,
  status text not null default 'ATIVO'
    check (status in ('ATIVO', 'REVOGADO')),
  validacao_publica boolean not null default true,
  politica_versao_emissao integer not null check (politica_versao_emissao > 0),
  campos_publicos_emissao text[] not null,
  dados_publicos_snapshot jsonb not null default '{}'::jsonb,
  emitido_em timestamptz not null default now(),
  ultima_emissao_em timestamptz not null default now(),
  validade_ate timestamptz,
  quantidade_emissoes integer not null default 1
    check (quantidade_emissoes > 0),
  emitido_por uuid,
  revogado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (turma_id, disciplina_id),
  check (
    campos_publicos_emissao <@ array[
      'courseName', 'className', 'institutionName', 'institutionCnpj',
      'unitName', 'issuedAt', 'lastIssuedAt', 'expiresAt', 'issueCount'
    ]::text[]
    and array['institutionName', 'issuedAt']::text[]
      <@ campos_publicos_emissao
  ),
  check (jsonb_typeof(dados_publicos_snapshot) = 'object')
);

comment on table public.diarios_validacao is
  'Registro canônico de validação do Diário de Classe por turma e disciplina, sem dados pessoais de estudantes.';

create unique index diarios_validacao_codigo_normalizado_uidx
  on public.diarios_validacao (upper(btrim(codigo)));
create index diarios_validacao_turma_disciplina_idx
  on public.diarios_validacao (turma_id, disciplina_id);

alter table public.diarios_validacao enable row level security;
revoke all on table public.diarios_validacao
  from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.diarios_validacao
  from service_role;
grant select on table public.diarios_validacao to service_role;

create table public.diarios_validacao_operacoes_idempotencia (
  idempotency_key text primary key,
  request_fingerprint text not null,
  turma_id uuid not null,
  disciplina_id uuid not null,
  codigo text not null,
  emitido_em timestamptz not null,
  ultima_emissao_em timestamptz not null,
  validade_ate timestamptz,
  quantidade_emissoes integer not null,
  reutilizado boolean not null,
  validacao_publica boolean not null,
  created_at timestamptz not null default now(),
  check (
    char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  )
);

alter table public.diarios_validacao_operacoes_idempotencia
  enable row level security;
revoke all on table public.diarios_validacao_operacoes_idempotencia
  from public, anon, authenticated, service_role;

-- O Diário nunca aceita campos de aluno, matrícula ou responsável. A regra
-- também protege chamadas administrativas diretas à RPC versionada de política.
create or replace function public.validar_campos_publicos_politica_diario()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_permitidos constant text[] := array[
    'courseName', 'className', 'institutionName', 'institutionCnpj',
    'unitName', 'issuedAt', 'lastIssuedAt', 'expiresAt', 'issueCount'
  ]::text[];
begin
  if new.documento = 'diario_classe'
    and not (new.campos_publicos <@ v_permitidos)
  then
    raise exception
      'O Diário de Classe permite somente informações institucionais e da emissão.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.validar_campos_publicos_politica_diario()
  from public, anon, authenticated;

drop trigger if exists trg_validar_campos_publicos_politica_diario
  on public.documentos_validacao_politicas;
create trigger trg_validar_campos_publicos_politica_diario
before insert or update of documento, campos_publicos
on public.documentos_validacao_politicas
for each row
execute function public.validar_campos_publicos_politica_diario();

insert into public.documentos_validacao_politicas (
  documento,
  prefixo,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo,
  validacao_publica,
  campos_publicos,
  consulta_publica_ativa,
  versao,
  updated_at
)
values (
  'diario_classe',
  'DIA',
  'PROCESSO',
  null,
  false,
  true,
  array[
    'courseName', 'className', 'institutionName', 'issuedAt', 'unitName'
  ]::text[],
  true,
  1,
  now()
)
on conflict (documento) do nothing;

insert into public.documentos_validacao_politicas_historico (
  documento,
  versao,
  prefixo,
  campos_publicos,
  consulta_publica_ativa,
  validacao_publica,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo,
  ator_id,
  ator_role,
  motivo
)
select
  policy.documento,
  policy.versao,
  policy.prefixo,
  policy.campos_publicos,
  policy.consulta_publica_ativa,
  policy.validacao_publica,
  policy.escopo_identidade,
  policy.validade_dias,
  policy.exige_vinculo_ativo,
  null,
  'migration',
  'Registro canônico inicial do Diário de Classe'
from public.documentos_validacao_politicas policy
where policy.documento = 'diario_classe'
on conflict (documento, versao) do nothing;

create or replace function public.emitir_diario_validacao_portal(
  p_turma_id uuid,
  p_disciplina_id uuid,
  p_idempotency_key text
)
returns table (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  quantidade_emissoes integer,
  reutilizado boolean,
  validacao_publica boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context record;
  v_policy public.documentos_validacao_politicas%rowtype;
  v_record public.diarios_validacao%rowtype;
  v_now timestamptz := now();
  v_identidade text;
  v_codigo text;
  v_validade timestamptz;
  v_snapshot_completo jsonb;
  v_campos text[];
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_stored public.diarios_validacao_operacoes_idempotencia%rowtype;
begin
  if p_turma_id is null or p_disciplina_id is null then
    raise exception 'Informe a turma e a disciplina do Diário de Classe.'
      using errcode = '22004';
  end if;

  if char_length(v_key) not between 16 and 128
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception
      'A emissão do Diário exige uma chave de idempotência explícita.'
      using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_operate_turma_academics(p_turma_id)
    and not public.is_professor_assigned_disciplina(
      p_turma_id,
      p_disciplina_id
    )
  then
    raise exception 'Acesso à emissão do Diário de Classe não autorizado.'
      using errcode = '42501';
  end if;

  select
    class.id as turma_id,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    class.polo_id,
    discipline.nome as disciplina_nome,
    course.nome as curso_nome,
    unit.nome as polo_nome,
    unit.cnpj as polo_cnpj,
    company.razao_social as empresa_razao_social,
    company.nome_fantasia as empresa_nome_fantasia,
    company.cnpj as empresa_cnpj
  into v_context
  from public.turmas_disciplinas class_discipline
  join public.turmas class
    on class.id = class_discipline.turma_id
  join public.disciplinas discipline
    on discipline.id = class_discipline.disciplina_id
  join public.cursos course on course.id = class.curso_id
  join public.polos unit on unit.id = class.polo_id
  left join public.empresas company on company.id = unit.company_id
  where class_discipline.turma_id = p_turma_id
    and class_discipline.disciplina_id = p_disciplina_id;

  if not found then
    raise exception 'A disciplina não pertence à turma informada.'
      using errcode = '23503';
  end if;

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = 'diario_classe'
  for share;

  if not found then
    raise exception 'A política de validação do Diário de Classe não existe.'
      using errcode = '23514';
  end if;

  v_identidade := concat_ws(
    ':',
    'diario_classe',
    p_turma_id::text,
    p_disciplina_id::text
  );
  v_fingerprint := encode(
    extensions.digest(convert_to(v_identidade, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('diary-issue:' || v_key, 0)
  );

  select operation.*
  into v_stored
  from public.diarios_validacao_operacoes_idempotencia operation
  where operation.idempotency_key = v_key;

  if found then
    if v_stored.request_fingerprint <> v_fingerprint then
      raise exception
        'A chave de idempotência do Diário já foi usada em outra solicitação.'
        using errcode = '22023';
    end if;

    -- Uma resposta idempotente não pode reabilitar um Diário que tenha sido
    -- revogado após a operação original. O estado canônico vigente prevalece
    -- sobre os metadados históricos do ledger.
    if not exists (
      select 1
      from public.diarios_validacao diary
      where diary.turma_id = v_stored.turma_id
        and diary.disciplina_id = v_stored.disciplina_id
        and diary.codigo = v_stored.codigo
        and diary.status <> 'REVOGADO'
    ) then
      raise exception 'Diário revogado ou removido não pode ser reutilizado.'
        using errcode = '55000';
    end if;

    return query
    select
      v_stored.codigo,
      'diario_classe'::text,
      v_stored.emitido_em,
      v_stored.ultima_emissao_em,
      v_stored.validade_ate,
      v_stored.quantidade_emissoes,
      v_stored.reutilizado,
      v_stored.validacao_publica;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_identidade, 0));

  v_validade := case
    when v_policy.validade_dias is null then null
    else v_now + make_interval(days => v_policy.validade_dias)
  end;
  v_campos := v_policy.campos_publicos;

  select diary.*
  into v_record
  from public.diarios_validacao diary
  where diary.turma_id = p_turma_id
    and diary.disciplina_id = p_disciplina_id
  for update;

  v_snapshot_completo := jsonb_build_object(
    'courseName', v_context.curso_nome,
    -- O componente curricular acompanha a turma sem criar um campo público novo.
    'className', concat_ws(
      ' — ',
      coalesce(v_context.turma_nome, v_context.turma_codigo),
      v_context.disciplina_nome
    ),
    'institutionName', coalesce(
      v_context.empresa_razao_social,
      v_context.empresa_nome_fantasia,
      v_context.polo_nome,
      'Universo Cursos e Consultoria'
    ),
    'institutionCnpj', public.formatar_cnpj_validacao_publica(coalesce(
      nullif(v_context.polo_cnpj, ''),
      v_context.empresa_cnpj
    )),
    'unitName', v_context.polo_nome,
    'issuedAt', coalesce(v_record.emitido_em, v_now),
    'lastIssuedAt', v_now,
    'expiresAt', v_validade,
    'issueCount', coalesce(v_record.quantidade_emissoes, 0) + 1
  );

  if v_record.id is not null then
    if v_record.status = 'REVOGADO' then
      raise exception 'Diário revogado não pode ser reemitido.'
        using errcode = '55000';
    end if;

    update public.diarios_validacao diary
    set
      ultima_emissao_em = v_now,
      validade_ate = v_validade,
      quantidade_emissoes = diary.quantidade_emissoes + 1,
      emitido_por = coalesce((select auth.uid()), diary.emitido_por),
      validacao_publica = v_policy.validacao_publica,
      politica_versao_emissao = v_policy.versao,
      campos_publicos_emissao = v_campos,
      dados_publicos_snapshot =
        public.filtrar_dados_publicos_validacao(
          v_snapshot_completo,
          v_campos
        ),
      updated_at = v_now
    where diary.id = v_record.id
    returning diary.* into v_record;

    insert into public.diarios_validacao_operacoes_idempotencia (
      idempotency_key, request_fingerprint, turma_id, disciplina_id,
      codigo, emitido_em, ultima_emissao_em, validade_ate,
      quantidade_emissoes, reutilizado, validacao_publica
    )
    values (
      v_key, v_fingerprint, p_turma_id, p_disciplina_id,
      v_record.codigo, v_record.emitido_em, v_record.ultima_emissao_em,
      v_record.validade_ate, v_record.quantidade_emissoes, true,
      v_record.validacao_publica
    );

    return query
    select
      v_record.codigo,
      'diario_classe'::text,
      v_record.emitido_em,
      v_record.ultima_emissao_em,
      v_record.validade_ate,
      v_record.quantidade_emissoes,
      true,
      v_record.validacao_publica;
    return;
  end if;

  loop
    v_codigo := v_policy.prefixo
      || '-' || upper(substring(
        encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4
      ))
      || '-' || upper(substring(
        encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4
      ))
      || '-' || upper(substring(
        encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4
      ));

    begin
      insert into public.diarios_validacao (
        identidade,
        codigo,
        turma_id,
        disciplina_id,
        polo_id,
        validacao_publica,
        politica_versao_emissao,
        campos_publicos_emissao,
        dados_publicos_snapshot,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        quantidade_emissoes,
        emitido_por
      )
      values (
        v_identidade,
        v_codigo,
        p_turma_id,
        p_disciplina_id,
        v_context.polo_id,
        v_policy.validacao_publica,
        v_policy.versao,
        v_campos,
        public.filtrar_dados_publicos_validacao(
          v_snapshot_completo,
          v_campos
        ),
        v_now,
        v_now,
        v_validade,
        1,
        (select auth.uid())
      )
      returning * into v_record;
      exit;
    exception
      when unique_violation then
        -- O advisory lock serializa a identidade; aqui só resta colisão aleatória
        -- do código, que recebe uma nova tentativa sem expor o registro.
        null;
    end;
  end loop;

  insert into public.diarios_validacao_operacoes_idempotencia (
    idempotency_key, request_fingerprint, turma_id, disciplina_id,
    codigo, emitido_em, ultima_emissao_em, validade_ate,
    quantidade_emissoes, reutilizado, validacao_publica
  )
  values (
    v_key, v_fingerprint, p_turma_id, p_disciplina_id,
    v_record.codigo, v_record.emitido_em, v_record.ultima_emissao_em,
    v_record.validade_ate, v_record.quantidade_emissoes, false,
    v_record.validacao_publica
  );

  return query
  select
    v_record.codigo,
    'diario_classe'::text,
    v_record.emitido_em,
    v_record.ultima_emissao_em,
    v_record.validade_ate,
    v_record.quantidade_emissoes,
    false,
    v_record.validacao_publica;
end;
$function$;

revoke all on function public.emitir_diario_validacao_portal(uuid, uuid, text)
  from public, anon;
grant execute on function public.emitir_diario_validacao_portal(uuid, uuid, text)
  to authenticated, service_role;

comment on function public.emitir_diario_validacao_portal(uuid, uuid, text) is
  'Emite ou reemite o registro canônico do Diário por turma e disciplina, após autorizar Gestor ou Professor vinculado.';

-- Preserva a implementação acadêmica já endurecida e cria um único ponto
-- público capaz de resolver tanto documentos por matrícula quanto o Diário.
alter function public.validar_documento_por_codigo(text)
  rename to validar_documento_academico_por_codigo_internal;

revoke all on function
  public.validar_documento_academico_por_codigo_internal(text)
  from public, anon, authenticated, service_role;

create function public.validar_documento_por_codigo(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_diary record;
begin
  v_result :=
    public.validar_documento_academico_por_codigo_internal(p_codigo);
  if v_result is not null then
    return v_result;
  end if;

  select
    diary.documento,
    diary.codigo,
    diary.status,
    diary.politica_versao_emissao,
    diary.dados_publicos_snapshot,
    diary.validade_ate,
    array(
      select emission_field.field
      from unnest(diary.campos_publicos_emissao)
        as emission_field(field)
      where emission_field.field = any(policy.campos_publicos)
      order by emission_field.field
    ) as visible_fields
  into v_diary
  from (
    select
      'diario_classe'::text as documento,
      validation.*
    from public.diarios_validacao validation
  ) diary
  join public.documentos_validacao_politicas policy
    on policy.documento = diary.documento
  where upper(btrim(diary.codigo)) = upper(btrim(p_codigo))
    and diary.validacao_publica
    and policy.consulta_publica_ativa
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'type', v_diary.documento,
    'status', case
      when v_diary.status = 'REVOGADO' then 'REVOKED'
      when v_diary.validade_ate is not null
        and v_diary.validade_ate < now() then 'EXPIRED'
      else 'ACTIVE'
    end,
    'code', v_diary.codigo
  )
  || public.filtrar_dados_publicos_validacao(
    v_diary.dados_publicos_snapshot,
    v_diary.visible_fields
  )
  || case
    when 'expiresAt' = any(v_diary.visible_fields)
      then jsonb_build_object('expiresAt', v_diary.validade_ate)
    else '{}'::jsonb
  end
  || jsonb_build_object(
    'visibleFields', v_diary.visible_fields,
    'schemaVersion', v_diary.politica_versao_emissao
  );
end;
$function$;

revoke all on function public.validar_documento_por_codigo(text)
  from public;
grant execute on function public.validar_documento_por_codigo(text)
  to anon, authenticated;

comment on function public.validar_documento_por_codigo(text) is
  'Valida documentos acadêmicos e Diários exclusivamente por registros canônicos, aplicando snapshot, allowlist vigente e kill switch.';
