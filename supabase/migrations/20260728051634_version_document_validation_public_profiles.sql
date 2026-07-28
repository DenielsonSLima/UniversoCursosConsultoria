-- Ledger remoto: 20260728051634.
-- Perfis versionados de exposição pública para documentos acadêmicos.
--
-- Princípios:
--   * type, status e code são metadados invariáveis do contrato público;
--   * os demais campos pertencem a uma allowlist fechada;
--   * valores são congelados e mascarados na emissão/reemissão;
--   * visibilidade é a interseção emissão x política vigente;
--   * remover um campo ou acionar o kill switch tem efeito imediato;
--   * adicionar um campo não expõe retroativamente emissões antigas;
--   * alterações de prefixo afetam somente códigos criados depois da mudança.

alter table public.documentos_validacao_politicas
  add column if not exists campos_publicos text[] not null
    default array['institutionName', 'issuedAt']::text[],
  add column if not exists consulta_publica_ativa boolean not null default true,
  add column if not exists versao integer not null default 1;

comment on column public.documentos_validacao_politicas.campos_publicos is
  'Allowlist vigente de campos opcionais devolvidos pelo validador público.';
comment on column public.documentos_validacao_politicas.consulta_publica_ativa is
  'Kill switch vigente: quando falso, bloqueia imediatamente todas as consultas públicas do tipo.';
comment on column public.documentos_validacao_politicas.versao is
  'Versão usada para concorrência otimista e auditoria da política pública.';

-- O comportamento atual é preservado na adoção: tipos que já não geravam
-- validação pública também começam com a consulta pública desligada.
update public.documentos_validacao_politicas
set
  prefixo = upper(btrim(prefixo)),
  consulta_publica_ativa = validacao_publica,
  versao = greatest(1, versao),
  campos_publicos = case documento
    when 'carteirinha' then array[
      'className', 'courseName', 'enrollmentDate', 'enrollmentStatus',
      'expiresAt', 'institutionCnpj', 'institutionName', 'issuedAt',
      'maskedEnrollmentNumber', 'studentName', 'studentPhotoUrl', 'unitName'
    ]::text[]
    when 'cracha_estagio' then array[
      'className', 'courseName', 'enrollmentDate', 'enrollmentStatus',
      'expiresAt', 'institutionCnpj', 'institutionName', 'issuedAt',
      'maskedEnrollmentNumber', 'studentName', 'studentPhotoUrl', 'unitName'
    ]::text[]
    when 'declaracao_matricula' then array[
      'className', 'courseName', 'enrollmentDate', 'enrollmentStatus',
      'expiresAt', 'institutionCnpj', 'institutionName', 'issuedAt',
      'maskedEnrollmentNumber', 'studentName', 'unitName'
    ]::text[]
    when 'declaracao_frequencia' then array[
      'className', 'courseName', 'enrollmentStatus', 'expiresAt',
      'institutionCnpj', 'institutionName', 'issuedAt',
      'maskedEnrollmentNumber', 'referencePeriod', 'studentName', 'unitName'
    ]::text[]
    when 'declaracao_irpf' then array[
      'institutionName', 'issuedAt', 'referencePeriod'
    ]::text[]
    when 'boletim' then array[
      'className', 'courseName', 'institutionName', 'issuedAt',
      'referencePeriod', 'studentName', 'unitName'
    ]::text[]
    when 'atestado_conclusao_tecnico' then array[
      'courseName', 'expiresAt', 'institutionCnpj', 'institutionName',
      'issuedAt', 'studentName', 'unitName'
    ]::text[]
    when 'historico_escolar' then array[
      'courseName', 'institutionCnpj', 'institutionName', 'issuedAt',
      'studentName', 'unitName'
    ]::text[]
    when 'transferencia' then array[
      'courseName', 'expiresAt', 'institutionCnpj', 'institutionName',
      'issuedAt', 'studentName', 'unitName'
    ]::text[]
    when 'rematricula' then array[
      'className', 'courseName', 'enrollmentStatus', 'expiresAt',
      'institutionName', 'issuedAt', 'maskedEnrollmentNumber',
      'studentName', 'unitName'
    ]::text[]
    when 'termo_estagio' then array[
      'className', 'courseName', 'expiresAt', 'institutionName', 'issuedAt',
      'referencePeriod', 'studentName', 'unitName'
    ]::text[]
    when 'pasta_identificacao' then array[
      'institutionName', 'issuedAt', 'maskedEnrollmentNumber', 'studentName'
    ]::text[]
    when 'ficha_matricula' then array[
      'institutionName', 'issuedAt', 'maskedEnrollmentNumber', 'studentName'
    ]::text[]
    when 'certificado_tecnico' then array[
      'courseName', 'institutionCnpj', 'institutionName', 'issuedAt',
      'studentName', 'unitName'
    ]::text[]
    when 'certificado_livre' then array[
      'courseName', 'institutionCnpj', 'institutionName', 'issuedAt',
      'studentName', 'unitName'
    ]::text[]
    when 'certificado_ead' then array[
      'courseName', 'institutionCnpj', 'institutionName', 'issuedAt',
      'studentName', 'unitName'
    ]::text[]
    when 'certificado_especializacao' then array[
      'courseName', 'institutionCnpj', 'institutionName', 'issuedAt',
      'studentName', 'unitName'
    ]::text[]
    else array['institutionName', 'issuedAt']::text[]
  end,
  updated_at = now();

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documentos_validacao_politicas'::regclass
      and conname = 'documentos_validacao_politicas_prefixo_publico_check'
  ) then
    alter table public.documentos_validacao_politicas
      add constraint documentos_validacao_politicas_prefixo_publico_check
      check (
        prefixo = upper(prefixo)
        and char_length(prefixo) between 2 and 20
        and prefixo ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documentos_validacao_politicas'::regclass
      and conname = 'documentos_validacao_politicas_campos_publicos_check'
  ) then
    alter table public.documentos_validacao_politicas
      add constraint documentos_validacao_politicas_campos_publicos_check
      check (
        campos_publicos <@ array[
          'studentName', 'studentPhotoUrl', 'studentCpf', 'studentBirthDate',
          'maskedMotherName', 'maskedEnrollmentNumber', 'courseName',
          'className', 'institutionName', 'institutionCnpj', 'unitName',
          'enrollmentStatus', 'issuedAt', 'lastIssuedAt', 'expiresAt',
          'referencePeriod', 'issueCount', 'enrollmentDate'
        ]::text[]
        and array['institutionName', 'issuedAt']::text[] <@ campos_publicos
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documentos_validacao_politicas'::regclass
      and conname = 'documentos_validacao_politicas_versao_check'
  ) then
    alter table public.documentos_validacao_politicas
      add constraint documentos_validacao_politicas_versao_check
      check (versao > 0);
  end if;
end;
$migration$;

create unique index if not exists
  documentos_validacao_politicas_prefixo_lower_uidx
  on public.documentos_validacao_politicas (lower(prefixo));

-- Escritas, inclusive com service_role, devem atravessar a RPC versionada.
-- As funções SECURITY DEFINER continuam operando como proprietárias.
revoke all on table public.documentos_validacao_politicas
  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.documentos_validacao_politicas
  from service_role;
grant select on table public.documentos_validacao_politicas
  to service_role;

-- Histórico append-only. A versão inicial também é registrada para permitir
-- reconstruir integralmente a política desde a adoção deste modelo.
create table if not exists public.documentos_validacao_politicas_historico (
  id uuid primary key default gen_random_uuid(),
  documento text not null
    references public.documentos_validacao_politicas(documento),
  versao integer not null check (versao > 0),
  prefixo text not null,
  campos_publicos text[] not null,
  consulta_publica_ativa boolean not null,
  validacao_publica boolean not null,
  escopo_identidade text not null,
  validade_dias integer,
  exige_vinculo_ativo boolean not null,
  ator_id uuid,
  ator_role text not null,
  motivo text not null check (char_length(btrim(motivo)) >= 5),
  created_at timestamptz not null default now(),
  unique (documento, versao)
);

comment on table public.documentos_validacao_politicas_historico is
  'Histórico imutável das políticas de exposição pública, preenchido somente pelas RPCs autorizadas.';

alter table public.documentos_validacao_politicas_historico
  enable row level security;

revoke all on table public.documentos_validacao_politicas_historico
  from public, anon, authenticated, service_role;
grant select on table public.documentos_validacao_politicas_historico
  to service_role;

drop policy if exists "gestores_consultam_historico_politicas_validacao"
  on public.documentos_validacao_politicas_historico;

-- Sem policy de SELECT, uma concessão direta acidental continuará retornando
-- zero linhas por RLS. Gestores consultam somente a projeção audit-safe criada
-- na etapa de governança, que não devolve ator_id.

create or replace function public.bloquear_mutacao_historico_politica_validacao()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'O histórico de políticas de validação é imutável.'
    using errcode = '55000';
end;
$function$;

revoke all on function
  public.bloquear_mutacao_historico_politica_validacao()
  from public, anon, authenticated;

drop trigger if exists trg_bloquear_mutacao_historico_politica_validacao
  on public.documentos_validacao_politicas_historico;
create trigger trg_bloquear_mutacao_historico_politica_validacao
before update or delete on public.documentos_validacao_politicas_historico
for each row
execute function public.bloquear_mutacao_historico_politica_validacao();

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
  'Perfil público inicial seguro'
from public.documentos_validacao_politicas policy
on conflict (documento, versao) do nothing;

-- Snapshot público por emissão. As colunas começam anuláveis apenas durante
-- o backfill; o trigger abaixo passa a preenchê-las para qualquer emissor.
alter table public.documentos_validacao
  add column if not exists politica_versao_emissao integer,
  add column if not exists campos_publicos_emissao text[],
  add column if not exists dados_publicos_snapshot jsonb;

comment on column public.documentos_validacao.politica_versao_emissao is
  'Versão da política congelada na emissão ou reemissão mais recente.';
comment on column public.documentos_validacao.campos_publicos_emissao is
  'Allowlist congelada na emissão; novos campos da política não retroagem.';
comment on column public.documentos_validacao.dados_publicos_snapshot is
  'Valores públicos canônicos e previamente mascarados, congelados na emissão.';

create or replace function public.mascarar_nome_validacao_publica(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_valor text;
begin
  v_valor := nullif(regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g'), '');
  if v_valor is null or lower(v_valor) = 'não informado' then
    return null;
  end if;
  -- Nunca aceite um asterisco fornecido pelo snapshot bruto como prova de que
  -- o valor já está seguro. Remove marcadores e aplica a máscara canônica.
  v_valor := nullif(
    regexp_replace(
      regexp_replace(v_valor, '\*', '', 'g'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
  if v_valor is null then
    return null;
  end if;
  return split_part(v_valor, ' ', 1)
    || case
      when position(' ' in v_valor) > 0
        then ' ' || left(split_part(v_valor, ' ', 2), 1) || '***'
      else ''
    end;
end;
$function$;

create or replace function public.mascarar_cpf_validacao_publica(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_digitos text;
begin
  v_digitos := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
  if char_length(v_digitos) < 2 then
    return null;
  end if;
  return '***.***.***-' || right(v_digitos, 2);
end;
$function$;

create or replace function public.mascarar_nascimento_validacao_publica(
  p_valor text
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_ano text;
begin
  v_ano := substring(coalesce(p_valor, '') from '([12][0-9]{3})');
  if v_ano is null then
    return null;
  end if;
  return '**/**/' || v_ano;
end;
$function$;

create or replace function public.mascarar_matricula_validacao_publica(
  p_valor text
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_valor text;
begin
  -- A matrícula pode vir de dados_emissao. Elimina qualquer máscara alegada
  -- pelo chamador e remascara o identificador normalizado do zero.
  v_valor := nullif(
    regexp_replace(
      upper(btrim(coalesce(p_valor, ''))),
      '[^A-Z0-9-]',
      '',
      'g'
    ),
    ''
  );
  if v_valor is null then
    return null;
  end if;
  if char_length(v_valor) <= 4 then
    return repeat('*', char_length(v_valor));
  end if;
  return left(v_valor, greatest(2, char_length(v_valor) - 6))
    || '****'
    || right(v_valor, 2);
end;
$function$;

create or replace function public.formatar_cnpj_validacao_publica(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_digitos text;
begin
  v_digitos := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
  if char_length(v_digitos) <> 14 then
    return null;
  end if;
  return substring(v_digitos from 1 for 2)
    || '.' || substring(v_digitos from 3 for 3)
    || '.' || substring(v_digitos from 6 for 3)
    || '/' || substring(v_digitos from 9 for 4)
    || '-' || substring(v_digitos from 13 for 2);
end;
$function$;

create or replace function public.filtrar_dados_publicos_validacao(
  p_snapshot jsonb,
  p_campos text[]
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_snapshot, '{}'::jsonb)) entry
  where entry.key = any(coalesce(p_campos, array[]::text[]));
$function$;

revoke all on function public.mascarar_nome_validacao_publica(text)
  from public, anon, authenticated;
revoke all on function public.mascarar_cpf_validacao_publica(text)
  from public, anon, authenticated;
revoke all on function public.mascarar_nascimento_validacao_publica(text)
  from public, anon, authenticated;
revoke all on function public.mascarar_matricula_validacao_publica(text)
  from public, anon, authenticated;
revoke all on function public.formatar_cnpj_validacao_publica(text)
  from public, anon, authenticated;
revoke all on function public.filtrar_dados_publicos_validacao(jsonb, text[])
  from public, anon, authenticated;

create or replace function public.preparar_snapshot_publico_documento_validacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.documentos_validacao_politicas%rowtype;
  v_source record;
  v_campos text[];
  v_snapshot_completo jsonb;
  v_numero_matricula text;
begin
  -- Atualizações operacionais comuns não reescrevem um documento histórico.
  -- Uma reemissão explícita (contador maior) adota o perfil vigente.
  if tg_op = 'UPDATE'
    and old.dados_publicos_snapshot is not null
    and old.campos_publicos_emissao is not null
    and old.politica_versao_emissao is not null
    and new.quantidade_emissoes <= old.quantidade_emissoes
  then
    new.dados_publicos_snapshot := old.dados_publicos_snapshot;
    new.campos_publicos_emissao := old.campos_publicos_emissao;
    new.politica_versao_emissao := old.politica_versao_emissao;
    return new;
  end if;

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = new.documento;

  if not found then
    raise exception 'Política pública não encontrada para o documento: %',
      new.documento
      using errcode = '23514';
  end if;

  select
    enrollment.status as enrollment_status,
    enrollment.data_matricula as enrollment_date,
    student.nome as student_name,
    student.cpf_cnpj as student_cpf,
    student.data_nascimento as student_birth_date,
    student.nome_mae as mother_name,
    student.foto_url as student_photo_url,
    class.nome as class_name,
    class.codigo as class_code,
    class.data_previsao_termino as class_expected_end_date,
    course.nome as course_name,
    unit.nome as unit_name,
    unit.cnpj as unit_cnpj,
    company.razao_social as company_legal_name,
    company.nome_fantasia as company_trade_name,
    company.cnpj as company_cnpj
  into v_source
  from public.matriculas enrollment
  left join public.parceiros student on student.id = enrollment.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit
    on unit.id = coalesce(new.polo_id, class.polo_id)
  left join public.empresas company on company.id = unit.company_id
  where enrollment.id = new.matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada para preparar o snapshot público.'
      using errcode = '23503';
  end if;

  v_campos := v_policy.campos_publicos;
  v_numero_matricula := coalesce(
    nullif(new.dados_emissao ->> 'maskedEnrollmentNumber', ''),
    public.formatar_matricula_validacao(
      new.matricula_id,
      v_source.enrollment_date,
      new.polo_id
    )
  );

  v_snapshot_completo := jsonb_build_object(
    'studentName',
      public.mascarar_nome_validacao_publica(coalesce(
        nullif(new.dados_emissao ->> 'studentName', ''),
        v_source.student_name
      )),
    'studentPhotoUrl', coalesce(
      nullif(new.dados_emissao ->> 'studentPhotoUrl', ''),
      v_source.student_photo_url
    ),
    'studentCpf',
      public.mascarar_cpf_validacao_publica(coalesce(
        nullif(new.dados_emissao ->> 'studentCpf', ''),
        v_source.student_cpf
      )),
    'studentBirthDate',
      public.mascarar_nascimento_validacao_publica(coalesce(
        nullif(new.dados_emissao ->> 'studentBirthDate', ''),
        v_source.student_birth_date::text
      )),
    'maskedMotherName',
      public.mascarar_nome_validacao_publica(coalesce(
        nullif(new.dados_emissao ->> 'maskedMotherName', ''),
        nullif(new.dados_emissao ->> 'motherName', ''),
        v_source.mother_name
      )),
    'maskedEnrollmentNumber',
      public.mascarar_matricula_validacao_publica(v_numero_matricula),
    'courseName', coalesce(
      nullif(new.dados_emissao ->> 'courseName', ''),
      v_source.course_name
    ),
    'className', coalesce(
      nullif(new.dados_emissao ->> 'className', ''),
      v_source.class_name,
      v_source.class_code
    ),
    'institutionName', coalesce(
      nullif(new.dados_emissao ->> 'institutionName', ''),
      v_source.company_legal_name,
      v_source.company_trade_name,
      v_source.unit_name,
      'Universo Cursos e Consultoria'
    ),
    'institutionCnpj',
      public.formatar_cnpj_validacao_publica(coalesce(
        nullif(new.dados_emissao ->> 'institutionCnpj', ''),
        nullif(v_source.unit_cnpj, ''),
        v_source.company_cnpj
      )),
    'unitName', coalesce(
      nullif(new.dados_emissao ->> 'unitName', ''),
      v_source.unit_name
    ),
    'enrollmentStatus', upper(coalesce(
      nullif(new.dados_emissao ->> 'enrollmentStatus', ''),
      v_source.enrollment_status,
      ''
    )),
    'issuedAt', new.emitido_em,
    'lastIssuedAt', new.ultima_emissao_em,
    'expiresAt', public.documento_validade_efetiva(
      new.documento,
      new.validade_ate,
      v_source.class_expected_end_date
    ),
    'referencePeriod', new.periodo_referencia,
    'issueCount', new.quantidade_emissoes,
    'enrollmentDate', coalesce(
      nullif(new.dados_emissao ->> 'enrollmentDate', ''),
      v_source.enrollment_date::text
    )
  );

  new.politica_versao_emissao := v_policy.versao;
  new.campos_publicos_emissao := v_campos;
  new.dados_publicos_snapshot :=
    public.filtrar_dados_publicos_validacao(
      v_snapshot_completo,
      v_campos
    );

  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and new.quantidade_emissoes > old.quantidade_emissoes
    )
  then
    new.validacao_publica := v_policy.validacao_publica;
  end if;

  return new;
end;
$function$;

revoke all on function
  public.preparar_snapshot_publico_documento_validacao()
  from public, anon, authenticated;

drop trigger if exists trg_zz_preparar_snapshot_publico_documento_validacao
  on public.documentos_validacao;
create trigger trg_zz_preparar_snapshot_publico_documento_validacao
before insert or update on public.documentos_validacao
for each row
execute function public.preparar_snapshot_publico_documento_validacao();

-- O mesmo trigger usado por novas emissões prepara os registros históricos.
update public.documentos_validacao
set updated_at = updated_at
where politica_versao_emissao is null
   or campos_publicos_emissao is null
   or dados_publicos_snapshot is null;

alter table public.documentos_validacao
  alter column politica_versao_emissao set default 1,
  alter column politica_versao_emissao set not null,
  alter column campos_publicos_emissao
    set default array['institutionName', 'issuedAt']::text[],
  alter column campos_publicos_emissao set not null,
  alter column dados_publicos_snapshot set default '{}'::jsonb,
  alter column dados_publicos_snapshot set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documentos_validacao'::regclass
      and conname = 'documentos_validacao_campos_publicos_emissao_check'
  ) then
    alter table public.documentos_validacao
      add constraint documentos_validacao_campos_publicos_emissao_check
      check (
        campos_publicos_emissao <@ array[
          'studentName', 'studentPhotoUrl', 'studentCpf', 'studentBirthDate',
          'maskedMotherName', 'maskedEnrollmentNumber', 'courseName',
          'className', 'institutionName', 'institutionCnpj', 'unitName',
          'enrollmentStatus', 'issuedAt', 'lastIssuedAt', 'expiresAt',
          'referencePeriod', 'issueCount', 'enrollmentDate'
        ]::text[]
        and array['institutionName', 'issuedAt']::text[]
          <@ campos_publicos_emissao
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documentos_validacao'::regclass
      and conname = 'documentos_validacao_snapshot_publico_check'
  ) then
    alter table public.documentos_validacao
      add constraint documentos_validacao_snapshot_publico_check
      check (
        politica_versao_emissao > 0
        and jsonb_typeof(dados_publicos_snapshot) = 'object'
      );
  end if;
end;
$migration$;

-- Índice funcional compatível com códigos legados em caixa mista. A RPC usa
-- a mesma expressão e não depende de um scan sequencial por upper(codigo).
create unique index if not exists documentos_validacao_codigo_normalizado_uidx
  on public.documentos_validacao (upper(btrim(codigo)));

-- Leitura administrativa das políticas. A ordem antiga é preservada e os
-- campos novos são anexados para facilitar a compatibilidade do frontend.
drop function if exists public.listar_politicas_validacao_documentos();
create function public.listar_politicas_validacao_documentos()
returns table (
  documento text,
  prefixo text,
  escopo_identidade text,
  validade_dias integer,
  exige_vinculo_ativo boolean,
  validacao_publica boolean,
  updated_at timestamptz,
  campos_publicos text[],
  consulta_publica_ativa boolean,
  versao integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_has_any_module(
      array['cadastros', 'secretaria']::text[]
    )
  then
    raise exception 'Acesso às políticas documentais não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select
    policy.documento,
    policy.prefixo,
    policy.escopo_identidade,
    policy.validade_dias,
    policy.exige_vinculo_ativo,
    policy.validacao_publica,
    policy.updated_at,
    policy.campos_publicos,
    policy.consulta_publica_ativa,
    policy.versao
  from public.documentos_validacao_politicas policy
  order by policy.documento;
end;
$function$;

revoke all on function public.listar_politicas_validacao_documentos()
  from public, anon;
grant execute on function public.listar_politicas_validacao_documentos()
  to authenticated, service_role;

create or replace function public.atualizar_politica_validacao_documento_v2(
  p_documento text,
  p_expected_version integer,
  p_prefixo text,
  p_campos_publicos text[],
  p_consulta_publica_ativa boolean,
  p_validacao_publica boolean,
  p_validade_dias integer default null,
  p_motivo text default null
)
returns public.documentos_validacao_politicas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.documentos_validacao_politicas%rowtype;
  v_updated public.documentos_validacao_politicas%rowtype;
  v_prefixo text;
  v_campos text[];
  v_motivo text;
  v_permitidos constant text[] := array[
    'studentName', 'studentPhotoUrl', 'studentCpf', 'studentBirthDate',
    'maskedMotherName', 'maskedEnrollmentNumber', 'courseName',
    'className', 'institutionName', 'institutionCnpj', 'unitName',
    'enrollmentStatus', 'issuedAt', 'lastIssuedAt', 'expiresAt',
    'referencePeriod', 'issueCount', 'enrollmentDate'
  ]::text[];
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_has_any_global_module(
      array['cadastros', 'secretaria']::text[]
    )
  then
    raise exception 'Alteração das políticas documentais não autorizada.'
      using errcode = '42501';
  end if;

  select policy.*
  into v_current
  from public.documentos_validacao_politicas policy
  where policy.documento = nullif(btrim(p_documento), '')
  for update;

  if not found then
    raise exception 'Tipo de documento não encontrado: %', p_documento
      using errcode = '22023';
  end if;

  if p_expected_version is null
    or p_expected_version <> v_current.versao
  then
    raise exception
      'A política foi alterada por outro usuário. Esperada %, atual %.',
      p_expected_version,
      v_current.versao
      using errcode = '40001';
  end if;

  v_prefixo := upper(btrim(coalesce(p_prefixo, '')));
  if char_length(v_prefixo) not between 2 and 20
    or v_prefixo !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
  then
    raise exception
      'O prefixo deve ter 2 a 20 letras/números, com hífens apenas entre blocos.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.documentos_validacao_politicas policy
    where policy.documento <> v_current.documento
      and lower(policy.prefixo) = lower(v_prefixo)
  ) then
    raise exception 'O prefixo % já está em uso por outro documento.', v_prefixo
      using errcode = '23505';
  end if;

  if p_campos_publicos is null then
    raise exception 'Informe os campos públicos do documento.'
      using errcode = '22004';
  end if;

  select coalesce(
    array_agg(
      distinct btrim(input.field)
      order by btrim(input.field)
    ),
    array[]::text[]
  )
  into v_campos
  from unnest(p_campos_publicos) as input(field)
  where nullif(btrim(input.field), '') is not null;

  if not (v_campos <@ v_permitidos) then
    raise exception 'A política contém campo público não permitido.'
      using errcode = '22023';
  end if;

  if not (
    array['institutionName', 'issuedAt']::text[] <@ v_campos
  ) then
    raise exception 'Instituição e data de emissão são campos obrigatórios.'
      using errcode = '22023';
  end if;

  if 'studentPhotoUrl' = any(v_campos)
    and v_current.documento not in ('carteirinha', 'cracha_estagio')
  then
    raise exception
      'A fotografia pública é permitida somente em carteirinha e crachá.'
      using errcode = '22023';
  end if;

  if p_consulta_publica_ativa is null or p_validacao_publica is null then
    raise exception 'Informe os dois controles de consulta pública.'
      using errcode = '22004';
  end if;

  if p_validade_dias is not null
    and (p_validade_dias <= 0 or p_validade_dias > 3650)
  then
    raise exception 'A validade deve estar entre 1 e 3650 dias.'
      using errcode = '22023';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null or char_length(v_motivo) < 5 then
    raise exception 'Informe um motivo com pelo menos 5 caracteres.'
      using errcode = '22023';
  end if;

  update public.documentos_validacao_politicas policy
  set
    prefixo = v_prefixo,
    campos_publicos = v_campos,
    consulta_publica_ativa = p_consulta_publica_ativa,
    validacao_publica = p_validacao_publica,
    validade_dias = case
      when v_current.documento = 'carteirinha' then null
      when p_validacao_publica then p_validade_dias
      else null
    end,
    versao = policy.versao + 1,
    updated_at = now()
  where policy.documento = v_current.documento
    and policy.versao = p_expected_version
  returning policy.* into v_updated;

  if not found then
    raise exception 'Conflito concorrente ao atualizar a política.'
      using errcode = '40001';
  end if;

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
  values (
    v_updated.documento,
    v_updated.versao,
    v_updated.prefixo,
    v_updated.campos_publicos,
    v_updated.consulta_publica_ativa,
    v_updated.validacao_publica,
    v_updated.escopo_identidade,
    v_updated.validade_dias,
    v_updated.exige_vinculo_ativo,
    (select auth.uid()),
    coalesce((select auth.role()), 'unknown'),
    v_motivo
  );

  return v_updated;
end;
$function$;

revoke all on function public.atualizar_politica_validacao_documento_v2(
  text, integer, text, text[], boolean, boolean, integer, text
) from public, anon;
grant execute on function public.atualizar_politica_validacao_documento_v2(
  text, integer, text, text[], boolean, boolean, integer, text
) to authenticated, service_role;

-- Compatibilidade: clientes antigos continuam alterando os dois campos
-- originais, mas a operação passa pelo mesmo versionamento e auditoria.
create or replace function public.atualizar_politica_validacao_documento(
  p_documento text,
  p_validacao_publica boolean,
  p_validade_dias integer default null
)
returns public.documentos_validacao_politicas
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.documentos_validacao_politicas%rowtype;
  v_updated public.documentos_validacao_politicas%rowtype;
begin
  select policy.*
  into v_current
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento
  for update;

  if not found then
    raise exception 'Tipo de documento não encontrado: %', p_documento
      using errcode = '22023';
  end if;

  select updated.*
  into v_updated
  from public.atualizar_politica_validacao_documento_v2(
    v_current.documento,
    v_current.versao,
    v_current.prefixo,
    v_current.campos_publicos,
    case
      -- Compatibilidade v1: a transição explícita false -> true precisa tornar
      -- a consulta utilizável. Se a emissão já estava ativa, preserva um kill
      -- switch desligado manualmente pela interface v2.
      when p_validacao_publica
        and not v_current.validacao_publica
        then true
      else v_current.consulta_publica_ativa
    end,
    p_validacao_publica,
    p_validade_dias,
    'Atualização pela interface legada'
  ) updated;

  return v_updated;
end;
$function$;

revoke all on function public.atualizar_politica_validacao_documento(
  text, boolean, integer
) from public, anon;
grant execute on function public.atualizar_politica_validacao_documento(
  text, boolean, integer
) to authenticated, service_role;

-- A RPC pública não consulta dados cadastrais. Somente status, revogação e
-- validade efetiva permanecem dinâmicos; os valores exibidos vêm do snapshot.
create or replace function public.validar_documento_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as (
    select
      validation.documento,
      validation.codigo,
      validation.status,
      validation.validacao_publica,
      validation.politica_versao_emissao,
      validation.campos_publicos_emissao,
      validation.dados_publicos_snapshot,
      policy.campos_publicos as campos_publicos_atuais,
      policy.consulta_publica_ativa,
      policy.exige_vinculo_ativo,
      enrollment.status as enrollment_status,
      public.documento_validade_efetiva(
        validation.documento,
        validation.validade_ate,
        class.data_previsao_termino
      ) as validade_efetiva
    from public.documentos_validacao validation
    join public.documentos_validacao_politicas policy
      on policy.documento = validation.documento
    left join public.matriculas enrollment
      on enrollment.id = validation.matricula_id
    left join public.turmas class on class.id = enrollment.turma_id
    where upper(btrim(validation.codigo)) = upper(btrim(p_codigo))
      and validation.validacao_publica
      and policy.consulta_publica_ativa
    limit 1
  ),
  visible as (
    select
      candidate.*,
      coalesce(
        array(
          select emission_field.field
          from unnest(candidate.campos_publicos_emissao)
            as emission_field(field)
          where emission_field.field = any(candidate.campos_publicos_atuais)
          order by emission_field.field
        ),
        array[]::text[]
      ) as visible_fields
    from candidate
  )
  select
    jsonb_build_object(
      'type', visible.documento,
      'status', case
        when visible.status = 'REVOGADO' then 'REVOKED'
        when visible.validade_efetiva is not null
          and visible.validade_efetiva < now() then 'EXPIRED'
        when visible.exige_vinculo_ativo
          and upper(coalesce(visible.enrollment_status, '')) <> 'ATIVO'
          then 'REVOKED'
        else 'ACTIVE'
      end,
      'code', visible.codigo
    )
    || public.filtrar_dados_publicos_validacao(
      visible.dados_publicos_snapshot,
      visible.visible_fields
    )
    || case
      when 'expiresAt' = any(visible.visible_fields)
        then jsonb_build_object('expiresAt', visible.validade_efetiva)
      else '{}'::jsonb
    end
    || jsonb_build_object(
      'visibleFields', visible.visible_fields,
      'schemaVersion', visible.politica_versao_emissao
    )
  from visible;
$function$;

revoke all on function public.validar_documento_por_codigo(text)
  from public;
grant execute on function public.validar_documento_por_codigo(text)
  to anon, authenticated;

comment on function public.validar_documento_por_codigo(text) is
  'Retorna somente metadados invariáveis e a interseção allowlist emissão x política atual, usando snapshot público mascarado e kill switch vigente.';

-- Não adicionar as tabelas novas ao Realtime: políticas e histórico serão
-- invalidados pelo cliente após mutações. documentos_validacao já conserva sua
-- publicação existente para os consumidores acadêmicos atuais.
