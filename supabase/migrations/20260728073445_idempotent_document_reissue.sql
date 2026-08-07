-- Ledger remoto: 20260728073445
-- Separa consulta de emissão de reemissão e torna a ação explícita idempotente.
--
-- A chave da política permanece bloqueada em modo compartilhado durante a
-- emissão. A RPC v2 de edição usa FOR UPDATE na mesma linha, impedindo que
-- prefixo, validade e snapshot sejam derivados de versões diferentes.

create or replace function public.emitir_documento_validacao_interno(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
)
returns table (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matricula record;
  v_periodo text;
  v_referencia text;
  v_identidade text;
  v_prefixo text;
  v_validade timestamptz;
  v_codigo text;
  v_existia boolean;
  v_politica public.documentos_validacao_politicas%rowtype;
  v_status_existente text;
  v_operation_at timestamptz;
begin
  if p_documento = 'diario_classe' then
    raise exception
      'O Diário de Classe usa a emissão canônica por turma e disciplina.'
      using errcode = '22023';
  end if;

  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  begin
    v_operation_at := nullif(
      current_setting('app.document_reissue_at', true),
      ''
    )::timestamptz;
  exception
    when invalid_datetime_format then
      raise exception 'Timestamp interno de reemissão inválido.'
        using errcode = '22007';
  end;
  v_operation_at := coalesce(v_operation_at, now());

  select policy.*
  into v_politica
  from public.documentos_validacao_politicas policy
  where policy.documento = p_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', p_documento
      using errcode = '22023';
  end if;

  select
    enrollment.id,
    enrollment.aluno_id,
    enrollment.status as matricula_status,
    enrollment.data_matricula,
    class.polo_id,
    student.nome as aluno_nome,
    student.cpf_cnpj as aluno_cpf,
    student.data_nascimento as aluno_nascimento,
    student.foto_url as aluno_foto_url,
    class.nome as turma_nome,
    class.codigo as turma_codigo,
    course.nome as curso_nome,
    unit.nome as polo_nome
  into v_matricula
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  left join public.turmas class on class.id = enrollment.turma_id
  left join public.cursos course on course.id = class.curso_id
  left join public.polos unit on unit.id = class.polo_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  v_periodo := nullif(btrim(p_periodo_referencia), '');
  v_referencia := nullif(btrim(p_referencia_externa), '');

  if v_politica.escopo_identidade = 'ANUAL'
    and p_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_politica.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_politica.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_identidade := concat_ws(
    ':',
    p_documento,
    p_matricula_id::text,
    coalesce(v_periodo, '-'),
    coalesce(v_referencia, '-')
  );

  if not p_registrar_reemissao then
    select
      validation.codigo,
      validation.documento,
      validation.emitido_em,
      validation.ultima_emissao_em,
      validation.validade_ate,
      validation.status,
      validation.quantidade_emissoes
    into
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes
    from public.documentos_validacao validation
    where validation.identidade = v_identidade;

    if found then
      if status = 'REVOGADO' then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      if validade_ate is not null and validade_ate < now() then
        raise exception
          'Documento expirado exige uma reemissão administrativa explícita.'
          using errcode = '55000';
      end if;

      reutilizado := true;
      return next;
      return;
    end if;
  else
    select validation.status
    into v_status_existente
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
    for update;

    if found and v_status_existente = 'REVOGADO' then
      raise exception
        'Documento revogado não pode ser reutilizado ou reemitido.'
        using errcode = '55000';
    end if;
  end if;

  v_prefixo := v_politica.prefixo;
  -- Validade informada pelo navegador continua ignorada. Na reemissão comum,
  -- o prazo é renovado pela política vigente. O trigger da carteirinha
  -- substitui esta data pelo término acadêmico da turma.
  v_validade := case
    when v_politica.validade_dias is null then null
    else v_operation_at + make_interval(days => v_politica.validade_dias)
  end;

  select exists (
    select 1
    from public.documentos_validacao validation
    where validation.identidade = v_identidade
  ) into v_existia;

  loop
    v_codigo := v_prefixo
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4))
      || '-' || upper(substring(encode(extensions.gen_random_bytes(9), 'hex') from 1 for 4));

    begin
      codigo := null;

      insert into public.documentos_validacao (
        identidade,
        codigo,
        documento,
        matricula_id,
        aluno_id,
        polo_id,
        periodo_referencia,
        referencia_externa,
        validade_ate,
        emitido_por,
        validacao_publica,
        dados_emissao
      )
      values (
        v_identidade,
        v_codigo,
        p_documento,
        p_matricula_id,
        v_matricula.aluno_id,
        v_matricula.polo_id,
        v_periodo,
        v_referencia,
        v_validade,
        p_emitido_por,
        v_politica.validacao_publica,
        jsonb_build_object(
          'studentName', v_matricula.aluno_nome,
          'studentCpf', v_matricula.aluno_cpf,
          'studentBirthDate', v_matricula.aluno_nascimento,
          'studentPhotoUrl', v_matricula.aluno_foto_url,
          'courseName', v_matricula.curso_nome,
          'className', coalesce(v_matricula.turma_nome, v_matricula.turma_codigo),
          'unitName', v_matricula.polo_nome,
          'enrollmentStatus', upper(coalesce(v_matricula.matricula_status, '')),
          'enrollmentDate', v_matricula.data_matricula,
          'institutionName', 'Universo Cursos e Consultoria',
          'validationPublic', v_politica.validacao_publica,
          'validityDays', v_politica.validade_dias
        )
      )
      on conflict (identidade) do update
      set
        ultima_emissao_em = case
          when p_registrar_reemissao then v_operation_at
          else documentos_validacao.ultima_emissao_em
        end,
        validade_ate = case
          when p_registrar_reemissao then excluded.validade_ate
          else documentos_validacao.validade_ate
        end,
        validacao_publica = case
          when p_registrar_reemissao then excluded.validacao_publica
          else documentos_validacao.validacao_publica
        end,
        emitido_por = coalesce(
          excluded.emitido_por,
          documentos_validacao.emitido_por
        ),
        quantidade_emissoes = documentos_validacao.quantidade_emissoes
          + case when p_registrar_reemissao then 1 else 0 end,
        dados_emissao = case
          when p_registrar_reemissao then
            documentos_validacao.dados_emissao
            || jsonb_build_object(
              'validationPublic', v_politica.validacao_publica,
              'validityDays', v_politica.validade_dias
            )
          else
            (documentos_validacao.dados_emissao
              || jsonb_strip_nulls(excluded.dados_emissao))
            || jsonb_build_object(
              'validationPublic', documentos_validacao.validacao_publica,
              'validityDays', case
                when documentos_validacao.validade_ate is null then null
                else greatest(
                  1,
                  ceil(extract(epoch from (
                    documentos_validacao.validade_ate
                    - documentos_validacao.emitido_em
                  )) / 86400)::integer
                )
              end
            )
        end,
        updated_at = now()
      where not p_registrar_reemissao
        or documentos_validacao.status <> 'REVOGADO'
      returning
        documentos_validacao.codigo,
        documentos_validacao.documento,
        documentos_validacao.emitido_em,
        documentos_validacao.ultima_emissao_em,
        documentos_validacao.validade_ate,
        documentos_validacao.status,
        documentos_validacao.quantidade_emissoes
      into
        codigo,
        documento,
        emitido_em,
        ultima_emissao_em,
        validade_ate,
        status,
        quantidade_emissoes;

      if codigo is null then
        raise exception
          'Documento revogado não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      reutilizado := v_existia or codigo <> v_codigo;
      return next;
      return;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.documentos_validacao validation
          where validation.identidade = v_identidade
        ) then
          continue;
        end if;
    end;
  end loop;
end;
$function$;

revoke all on function public.emitir_documento_validacao_interno(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.emitir_documento_validacao_interno(
  text, uuid, text, text, timestamptz, uuid, boolean
) to service_role;

-- Fecha o bypass legado: reemissão autenticada só pode chegar ao núcleo pela
-- RPC com ledger. Ficha e lote legados convergem neste wrapper e também são
-- bloqueados atomicamente quando tentam encaminhar true.
create or replace function public.emitir_documento_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
)
returns table(
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_enrollment record;
  v_is_owner boolean := false;
  v_can_manage boolean := false;
  v_responsavel uuid;
  v_periodo text := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia_externa, '')), '');
begin
  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  select
    enrollment.aluno_id,
    upper(coalesce(enrollment.status, '')) as matricula_status,
    upper(coalesce(class.status, '')) as turma_status,
    upper(coalesce(course.modalidade, '')) as modalidade,
    class.polo_id
  into v_enrollment
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  v_is_owner := public.current_aluno_id() = v_enrollment.aluno_id;
  v_can_manage := public.can_manage_secretaria_document(
    v_documento,
    v_enrollment.polo_id
  );

  if coalesce((select auth.role()), '') = 'service_role' then
    v_responsavel :=
      internal_academic.resolve_responsavel(p_emitido_por);
  elsif v_can_manage then
    -- A primeira emissão de certificado pertence exclusivamente ao
    -- finalizador acadêmico. Segundas vias usam a RPC idempotente.
    if v_documento like 'certificado\_%' escape '\' then
      raise exception
        'Certificados são emitidos somente pela fila da Secretaria.'
        using errcode = '42501';
    end if;
    v_responsavel := internal_academic.resolve_responsavel(null);
  elsif v_is_owner then
    if v_documento not in (
      'carteirinha',
      'cracha_estagio',
      'declaracao_matricula',
      'declaracao_irpf'
    ) then
      raise exception
        'Este documento não está disponível para emissão direta pelo aluno.'
        using errcode = '42501';
    end if;

    if v_documento in ('carteirinha', 'cracha_estagio')
      and not (
        v_enrollment.matricula_status = 'ATIVO'
        and v_enrollment.turma_status = 'EM_ANDAMENTO'
        and v_enrollment.modalidade in ('TECNICO', 'TÉCNICO')
      )
    then
      raise exception
        'Carteirinha e crachá exigem matrícula técnica ativa em turma em andamento.'
        using errcode = '42501';
    end if;

    if v_documento = 'declaracao_matricula'
      and v_enrollment.matricula_status <> 'ATIVO'
    then
      raise exception 'A declaração de matrícula exige vínculo ativo.'
        using errcode = '42501';
    end if;

    if v_documento = 'declaracao_irpf'
      and not (
        v_enrollment.modalidade in ('TECNICO', 'TÉCNICO')
        and v_enrollment.matricula_status in (
          'ATIVO', 'CONCLUIDO', 'CANCELADO', 'TRANCADO',
          'DESISTENTE', 'TRANSFERIDO'
        )
      )
    then
      raise exception 'A declaração de IRPF exige vínculo técnico válido.'
        using errcode = '42501';
    end if;

    v_referencia := null;
    if v_documento = 'declaracao_irpf' then
      if v_periodo is not null then
        if v_periodo !~ '^[0-9]{4}$' then
          raise exception 'Ano de referência do IRPF inválido.'
            using errcode = '22007';
        end if;
        if v_periodo::integer < 2000
          or v_periodo::integer
            > extract(year from current_date)::integer
        then
          raise exception 'Ano de referência do IRPF inválido.'
            using errcode = '22007';
        end if;
      end if;
    else
      v_periodo := null;
    end if;
    v_responsavel := null;
  else
    raise exception 'Acesso à emissão deste documento não autorizado.'
      using errcode = '42501';
  end if;

  return query
  select issued.*
  from public.emitir_documento_validacao_interno(
    v_documento,
    p_matricula_id,
    v_periodo,
    v_referencia,
    null,
    v_responsavel,
    p_registrar_reemissao
  ) issued;
end;
$function$;

revoke all on function public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon;
grant execute on function public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) to authenticated, service_role;

-- A assinatura histórica sem sufixo continua disponível para leituras de
-- clientes antigos, mas não pode mais transportar a flag mutável diretamente.
-- O gate duplicado aqui evita que a segurança dependa somente do wrapper
-- portal chamado por ela.
create or replace function public.emitir_documento_validacao(
  p_documento text,
  p_matricula_id uuid,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_validade_ate timestamptz default null,
  p_emitido_por uuid default null,
  p_registrar_reemissao boolean default false
)
returns table(
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_registrar_reemissao
    and coalesce(
      current_setting('app.document_reissue_authorized', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Reemissão exige a RPC idempotente com chave explícita.'
      using errcode = '22023';
  end if;

  return query
  select issued.*
  from public.emitir_documento_validacao_portal(
    p_documento,
    p_matricula_id,
    p_periodo_referencia,
    p_referencia_externa,
    p_validade_ate,
    p_emitido_por,
    p_registrar_reemissao
  ) issued;
end;
$function$;

revoke all on function public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) from public, anon;
grant execute on function public.emitir_documento_validacao(
  text, uuid, text, text, timestamptz, uuid, boolean
) to authenticated, service_role;

-- A ficha monta um snapshot cadastral rico depois que o núcleo retorna. Numa
-- segunda via, esse update auxiliar não pode trocar silenciosamente o conteúdo
-- que acabou de ser preparado/capturado; somente os metadados canônicos de
-- reemissão mudam. A primeira emissão continua congelando o snapshot completo.
create or replace function public.preservar_snapshot_documento_reemitido()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(
    current_setting('app.document_reissue_authorized', true),
    ''
  ) = 'on'
    and new.quantidade_emissoes = old.quantidade_emissoes
    and new.quantidade_emissoes > 1
  then
    new.dados_emissao := old.dados_emissao;
  end if;
  return new;
end;
$function$;

revoke all on function public.preservar_snapshot_documento_reemitido()
  from public, anon, authenticated;

drop trigger if exists trg_zy_preservar_snapshot_documento_reemitido
  on public.documentos_validacao;
create trigger trg_zy_preservar_snapshot_documento_reemitido
before update of dados_emissao on public.documentos_validacao
for each row
execute function public.preservar_snapshot_documento_reemitido();

-- Corrige também ambientes que já receberam P1/P2 antes de a policy latente
-- ser removida dos arquivos-base. Sem policy e sem GRANT, o histórico bruto
-- permanece fail-closed em qualquer combinação intermediária de rollout.
drop policy if exists "gestores_consultam_historico_politicas_validacao"
  on public.documentos_validacao_politicas_historico;

create table if not exists
  public.documentos_validacao_reemissoes_idempotencia (
    idempotency_key text primary key,
    request_fingerprint text not null,
    matricula_id uuid not null,
    codigo text not null,
    documento text not null,
    emitido_em timestamptz not null,
    ultima_emissao_em timestamptz not null,
    validade_ate timestamptz,
    status text not null,
    quantidade_emissoes integer not null,
    reutilizado boolean not null,
    estado text not null default 'CONFIRMADA'
      check (estado in ('PREPARADA', 'CONFIRMADA')),
    politica_versao integer,
    validacao_publica boolean,
    preparada_em timestamptz,
    created_at timestamptz not null default now(),
    constraint documentos_validacao_reemissoes_key_check
      check (
        char_length(idempotency_key) between 16 and 128
        and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
      )
  );

alter table public.documentos_validacao_reemissoes_idempotencia
  enable row level security;

revoke all on table public.documentos_validacao_reemissoes_idempotencia
  from public, anon, authenticated, service_role;

comment on table public.documentos_validacao_reemissoes_idempotencia is
  'Ledger privado que garante uma única reemissão por chave explícita, inclusive sob retry.';

create or replace function public.preparar_reemissao_documento_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_idempotency_key text,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_emitido_por uuid default null
)
returns table (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean,
  politica_versao integer,
  validacao_publica boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_periodo text := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia_externa, '')), '');
  v_identidade text;
  v_polo_id uuid;
  v_class_end date;
  v_effective_issuer uuid;
  v_fingerprint text;
  v_policy public.documentos_validacao_politicas%rowtype;
  v_existing public.documentos_validacao%rowtype;
  v_stored public.documentos_validacao_reemissoes_idempotencia%rowtype;
  v_prepared_at timestamptz := clock_timestamp();
  v_prepared_validity timestamptz;
begin
  if char_length(v_key) not between 16 and 128
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception
      'A chave de idempotência deve ter 16 a 128 caracteres seguros.'
      using errcode = '22023';
  end if;

  select class.polo_id, class.data_previsao_termino
  into v_polo_id, v_class_end
  from public.matriculas enrollment
  left join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(v_documento, v_polo_id)
  then
    raise exception 'Acesso à preparação desta reemissão não autorizado.'
      using errcode = '42501';
  end if;

  v_effective_issuer :=
    internal_academic.resolve_responsavel(p_emitido_por);

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = v_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', v_documento
      using errcode = '22023';
  end if;

  if v_policy.escopo_identidade = 'ANUAL'
    and v_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_policy.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_policy.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_identidade := concat_ws(
    ':',
    v_documento,
    p_matricula_id::text,
    coalesce(v_periodo, '-'),
    coalesce(v_referencia, '-')
  );

  select validation.*
  into v_existing
  from public.documentos_validacao validation
  where validation.identidade = v_identidade
  for share;

  if not found then
    raise exception
      'A preparação em duas fases exige um documento previamente emitido.'
      using errcode = '22023';
  end if;

  if v_existing.status = 'REVOGADO' then
    raise exception 'Documento revogado não pode ser reutilizado ou reemitido.'
      using errcode = '55000';
  end if;

  if v_documento = 'carteirinha' then
    if v_class_end is null then
      raise exception
        'Defina o término previsto da turma antes de reemitir a carteirinha.'
        using errcode = '23514';
    end if;
    v_prepared_validity := public.documento_validade_efetiva(
      v_documento,
      null,
      v_class_end
    );
  else
    v_prepared_validity := case
      when v_policy.validade_dias is null then null
      else v_prepared_at + make_interval(days => v_policy.validade_dias)
    end;
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          E'\n',
          v_documento,
          p_matricula_id::text,
          coalesce(v_periodo, '-'),
          coalesce(v_referencia, '-'),
          coalesce(v_effective_issuer::text, '-')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('document-reissue:' || v_key, 0)
  );

  select ledger.*
  into v_stored
  from public.documentos_validacao_reemissoes_idempotencia ledger
  where ledger.idempotency_key = v_key;

  if found and v_stored.request_fingerprint <> v_fingerprint then
    raise exception
      'A chave de idempotência já foi usada em outra solicitação.'
      using errcode = '22023';
  end if;

  if found and v_stored.estado = 'CONFIRMADA' then
    -- A preparação de um retry confirmado também deve respeitar o estado
    -- canônico atual. Sem esta checagem, um ledger antigo poderia voltar a
    -- autorizar a renderização de um documento já revogado ou removido.
    if not exists (
      select 1
      from public.documentos_validacao validation
      where upper(btrim(validation.codigo)) =
        upper(btrim(v_stored.codigo))
        and validation.status <> 'REVOGADO'
    ) then
      raise exception
        'Documento revogado ou removido não pode ser reutilizado ou reemitido.'
        using errcode = '55000';
    end if;

    codigo := v_stored.codigo;
    documento := v_stored.documento;
    emitido_em := v_stored.emitido_em;
    ultima_emissao_em := v_stored.ultima_emissao_em;
    validade_ate := v_stored.validade_ate;
    status := v_stored.status;
    quantidade_emissoes := v_stored.quantidade_emissoes;
    reutilizado := v_stored.reutilizado;
    politica_versao := v_stored.politica_versao;
    validacao_publica := coalesce(
      v_stored.validacao_publica,
      v_policy.validacao_publica
    );
    return next;
    return;
  end if;

  -- A preparação também é idempotente. Um retry ambíguo da mesma ação deve
  -- devolver exatamente o timestamp, validade e contador já apresentados,
  -- sem deslocar silenciosamente o documento que será confirmado.
  if found and v_stored.estado = 'PREPARADA' then
    codigo := v_stored.codigo;
    documento := v_stored.documento;
    emitido_em := v_stored.emitido_em;
    ultima_emissao_em := v_stored.ultima_emissao_em;
    validade_ate := v_stored.validade_ate;
    status := v_stored.status;
    quantidade_emissoes := v_stored.quantidade_emissoes;
    reutilizado := v_stored.reutilizado;
    politica_versao := v_stored.politica_versao;
    validacao_publica := coalesce(
      v_stored.validacao_publica,
      v_policy.validacao_publica
    );
    return next;
    return;
  end if;

  insert into public.documentos_validacao_reemissoes_idempotencia (
    idempotency_key,
    request_fingerprint,
    matricula_id,
    codigo,
    documento,
    emitido_em,
    ultima_emissao_em,
    validade_ate,
    status,
    quantidade_emissoes,
    reutilizado,
    estado,
    politica_versao,
    validacao_publica,
    preparada_em
  )
  values (
    v_key,
    v_fingerprint,
    p_matricula_id,
    v_existing.codigo,
    v_existing.documento,
    v_existing.emitido_em,
    v_prepared_at,
    v_prepared_validity,
    v_existing.status,
    v_existing.quantidade_emissoes + 1,
    true,
    'PREPARADA',
    v_policy.versao,
    v_policy.validacao_publica,
    v_prepared_at
  )
  on conflict (idempotency_key) do update
  set
    codigo = excluded.codigo,
    documento = excluded.documento,
    emitido_em = excluded.emitido_em,
    ultima_emissao_em = excluded.ultima_emissao_em,
    validade_ate = excluded.validade_ate,
    status = excluded.status,
    quantidade_emissoes = excluded.quantidade_emissoes,
    reutilizado = excluded.reutilizado,
    estado = 'PREPARADA',
    politica_versao = excluded.politica_versao,
    validacao_publica = excluded.validacao_publica,
    preparada_em = excluded.preparada_em;

  codigo := v_existing.codigo;
  documento := v_existing.documento;
  emitido_em := v_existing.emitido_em;
  ultima_emissao_em := v_prepared_at;
  validade_ate := v_prepared_validity;
  status := v_existing.status;
  quantidade_emissoes := v_existing.quantidade_emissoes + 1;
  reutilizado := true;
  politica_versao := v_policy.versao;
  validacao_publica := v_policy.validacao_publica;
  return next;
end;
$function$;

revoke all on function public.preparar_reemissao_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.preparar_reemissao_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.reemitir_documento_validacao_portal(
  p_documento text,
  p_matricula_id uuid,
  p_idempotency_key text,
  p_periodo_referencia text default null,
  p_referencia_externa text default null,
  p_emitido_por uuid default null
)
returns table (
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_periodo text := nullif(btrim(coalesce(p_periodo_referencia, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia_externa, '')), '');
  v_polo_id uuid;
  v_effective_issuer uuid;
  v_fingerprint text;
  v_policy public.documentos_validacao_politicas%rowtype;
  v_stored public.documentos_validacao_reemissoes_idempotencia%rowtype;
  v_issue record;
  v_has_stored boolean := false;
begin
  if char_length(v_key) not between 16 and 128
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception
      'A chave de idempotência deve ter 16 a 128 caracteres seguros.'
      using errcode = '22023';
  end if;

  select class.polo_id
  into v_polo_id
  from public.matriculas enrollment
  left join public.turmas class on class.id = enrollment.turma_id
  where enrollment.id = p_matricula_id;

  if not found then
    raise exception 'Matrícula não encontrada.'
      using errcode = '22023';
  end if;

  -- Reemissão é uma ação administrativa. A consulta do aluno permanece na
  -- RPC de emissão sem incremento e nunca passa por este endpoint.
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.can_manage_secretaria_document(v_documento, v_polo_id)
  then
    raise exception 'Acesso à reemissão deste documento não autorizado.'
      using errcode = '42501';
  end if;

  v_effective_issuer :=
    internal_academic.resolve_responsavel(p_emitido_por);

  select policy.*
  into v_policy
  from public.documentos_validacao_politicas policy
  where policy.documento = v_documento
  for share;

  if not found then
    raise exception 'Tipo de documento não permitido: %', v_documento
      using errcode = '22023';
  end if;

  if v_policy.escopo_identidade = 'ANUAL'
    and v_documento = 'declaracao_irpf'
    and v_periodo is null
  then
    v_periodo := (extract(year from current_date)::integer - 1)::text;
  elsif v_policy.escopo_identidade = 'ANUAL' and v_periodo is null then
    v_periodo := extract(year from current_date)::integer::text;
  end if;

  if v_policy.escopo_identidade = 'PROCESSO' and v_referencia is null then
    raise exception 'Este documento exige uma referência de processo ou contrato.'
      using errcode = '22023';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          E'\n',
          v_documento,
          p_matricula_id::text,
          coalesce(v_periodo, '-'),
          coalesce(v_referencia, '-'),
          coalesce(v_effective_issuer::text, '-')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('document-reissue:' || v_key, 0)
  );

  select ledger.*
  into v_stored
  from public.documentos_validacao_reemissoes_idempotencia ledger
  where ledger.idempotency_key = v_key;
  v_has_stored := found;

  if v_has_stored then
    if v_stored.request_fingerprint <> v_fingerprint then
      raise exception
        'A chave de idempotência já foi usada em outra solicitação.'
        using errcode = '22023';
    end if;

    if v_stored.estado = 'CONFIRMADA' then
      -- Idempotência não pode ressuscitar um documento revogado depois da
      -- primeira resposta. O ledger preserva o resultado da operação, mas o
      -- estado de revogação do registro canônico sempre prevalece.
      if not exists (
        select 1
        from public.documentos_validacao validation
        where upper(btrim(validation.codigo)) =
          upper(btrim(v_stored.codigo))
          and validation.status <> 'REVOGADO'
      ) then
        raise exception
          'Documento revogado ou removido não pode ser reutilizado ou reemitido.'
          using errcode = '55000';
      end if;

      codigo := v_stored.codigo;
      documento := v_stored.documento;
      emitido_em := v_stored.emitido_em;
      ultima_emissao_em := v_stored.ultima_emissao_em;
      validade_ate := v_stored.validade_ate;
      status := v_stored.status;
      quantidade_emissoes := v_stored.quantidade_emissoes;
      reutilizado := v_stored.reutilizado;
      return next;
      return;
    end if;

    if v_stored.politica_versao is distinct from v_policy.versao then
      raise exception
        'A política documental mudou após a preparação. Prepare a segunda via novamente.'
        using errcode = '40001';
    end if;

    perform set_config(
      'app.document_reissue_at',
      v_stored.preparada_em::text,
      true
    );
  else
    -- Evita herdar a preparação de outro item quando a função é chamada
    -- repetidamente dentro de uma mesma transação em lote.
    perform set_config('app.document_reissue_at', '', true);
  end if;

  -- O primeiro certificado só pode nascer no finalizador acadêmico. Esta RPC
  -- aceita somente uma segunda via de certificado já existente.
  if v_documento like 'certificado\_%' escape '\'
    and not exists (
      select 1
      from public.documentos_validacao validation
      where validation.documento = v_documento
        and validation.matricula_id = p_matricula_id
    )
  then
    raise exception
      'A primeira emissão do certificado exige o fluxo acadêmico de finalização.'
      using errcode = '42501';
  end if;

  perform set_config('app.document_reissue_authorized', 'on', true);

  if v_documento in ('pasta_identificacao', 'ficha_matricula') then
    select issued.*
    into v_issue
    from public.emitir_ficha_validacao_portal(
      v_documento,
      p_matricula_id,
      v_periodo,
      v_effective_issuer,
      true,
      '{}'::jsonb
    ) issued;
  else
    select issued.*
    into v_issue
    from public.emitir_documento_validacao_interno(
      v_documento,
      p_matricula_id,
      v_periodo,
      v_referencia,
      null,
      v_effective_issuer,
      true
    ) issued;
  end if;

  if v_issue.codigo is null then
    raise exception 'A reemissão não retornou um código de validação.'
      using errcode = '55000';
  end if;

  if v_has_stored then
    if v_issue.codigo is distinct from v_stored.codigo
      or v_issue.ultima_emissao_em is distinct from v_stored.ultima_emissao_em
      or v_issue.validade_ate is distinct from v_stored.validade_ate
      or v_issue.quantidade_emissoes is distinct from v_stored.quantidade_emissoes
    then
      raise exception
        'A matrícula ou turma mudou após a preparação. Prepare a segunda via novamente.'
        using errcode = '40001';
    end if;

    update public.documentos_validacao_reemissoes_idempotencia ledger
    set
      codigo = v_issue.codigo,
      documento = v_issue.documento,
      emitido_em = v_issue.emitido_em,
      ultima_emissao_em = v_issue.ultima_emissao_em,
      validade_ate = v_issue.validade_ate,
      status = v_issue.status,
      quantidade_emissoes = v_issue.quantidade_emissoes,
      reutilizado = v_issue.reutilizado,
      estado = 'CONFIRMADA',
      validacao_publica = v_policy.validacao_publica
    where ledger.idempotency_key = v_key;
  else
    insert into public.documentos_validacao_reemissoes_idempotencia (
      idempotency_key,
      request_fingerprint,
      matricula_id,
      codigo,
      documento,
      emitido_em,
      ultima_emissao_em,
      validade_ate,
      status,
      quantidade_emissoes,
      reutilizado,
      estado,
      politica_versao,
      validacao_publica
    )
    values (
      v_key,
      v_fingerprint,
      p_matricula_id,
      v_issue.codigo,
      v_issue.documento,
      v_issue.emitido_em,
      v_issue.ultima_emissao_em,
      v_issue.validade_ate,
      v_issue.status,
      v_issue.quantidade_emissoes,
      v_issue.reutilizado,
      'CONFIRMADA',
      v_policy.versao,
      v_policy.validacao_publica
    );
  end if;

  codigo := v_issue.codigo;
  documento := v_issue.documento;
  emitido_em := v_issue.emitido_em;
  ultima_emissao_em := v_issue.ultima_emissao_em;
  validade_ate := v_issue.validade_ate;
  status := v_issue.status;
  quantidade_emissoes := v_issue.quantidade_emissoes;
  reutilizado := v_issue.reutilizado;
  return next;
end;
$function$;

revoke all on function public.reemitir_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.reemitir_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.reemitir_fichas_validacao_lote_portal(
  p_documento text,
  p_matricula_ids uuid[],
  p_idempotency_key text,
  p_periodo_referencia text default null,
  p_emitido_por uuid default null
)
returns table (
  matricula_id uuid,
  ordem_solicitacao integer,
  codigo text,
  documento text,
  emitido_em timestamptz,
  ultima_emissao_em timestamptz,
  validade_ate timestamptz,
  status text,
  quantidade_emissoes integer,
  reutilizado boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request record;
  v_issue record;
begin
  if p_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception
      'A reemissão transacional em lote é exclusiva das fichas cadastrais.'
      using errcode = '22023';
  end if;

  if char_length(v_key) not between 16 and 90
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  then
    raise exception
      'A chave do lote deve ter 16 a 90 caracteres seguros.'
      using errcode = '22023';
  end if;

  if coalesce(cardinality(p_matricula_ids), 0) = 0 then
    raise exception 'Informe ao menos uma matrícula para reemissão.'
      using errcode = '22023';
  end if;

  if cardinality(p_matricula_ids) > 500 then
    raise exception 'O lote pode conter no máximo 500 matrículas.'
      using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct requested_id)
    from unnest(p_matricula_ids) requested(requested_id)
  ) then
    raise exception 'O lote contém matrículas duplicadas.'
      using errcode = '22023';
  end if;

  for v_request in
    select requested_id, request_order::integer
    from unnest(p_matricula_ids) with ordinality
      requested(requested_id, request_order)
    order by request_order
  loop
    select issued.*
    into v_issue
    from public.reemitir_documento_validacao_portal(
      p_documento,
      v_request.requested_id,
      v_key || ':' || v_request.requested_id::text,
      p_periodo_referencia,
      null,
      p_emitido_por
    ) issued;

    matricula_id := v_request.requested_id;
    ordem_solicitacao := v_request.request_order;
    codigo := v_issue.codigo;
    documento := v_issue.documento;
    emitido_em := v_issue.emitido_em;
    ultima_emissao_em := v_issue.ultima_emissao_em;
    validade_ate := v_issue.validade_ate;
    status := v_issue.status;
    quantidade_emissoes := v_issue.quantidade_emissoes;
    reutilizado := v_issue.reutilizado;
    return next;
  end loop;
end;
$function$;

revoke all on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) from public, anon;
grant execute on function public.reemitir_fichas_validacao_lote_portal(
  text, uuid[], text, text, uuid
) to authenticated, service_role;

comment on function public.reemitir_documento_validacao_portal(
  text, uuid, text, text, text, uuid
) is
  'Registra uma reemissão administrativa uma única vez por chave explícita; retries retornam o mesmo resultado.';
