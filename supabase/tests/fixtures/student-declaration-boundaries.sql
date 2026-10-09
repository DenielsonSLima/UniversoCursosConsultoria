-- Only dependency boundaries for the student PDF RPC; issuer SQL is copied unchanged below.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
alter table public.parceiros add column auth_user_id uuid;
update public.parceiros set auth_user_id=id, data_nascimento='2000-02-07';
create function public.current_aluno_id() returns uuid language sql stable security definer set search_path='' as $$
  select id from public.parceiros where auth_user_id=auth.uid() $$;
create function public.can_manage_secretaria_document(text,uuid) returns boolean language sql stable as $$ select false $$;
create function internal_academic.resolve_responsavel(uuid) returns uuid language sql stable as $$ select $1 $$;
alter table public.cursos add column modalidade text default 'TECNICO';
alter table public.turmas add column status text default 'EM_ANDAMENTO';
create table public.empresas (
  id uuid primary key, nome_fantasia text, razao_social text, cnpj text, endereco text, numero text,
  complemento text, bairro text, cidade text, uf text, cep text, telefone text, email text, logo_url text
);
alter table public.polos add column company_id uuid;
alter table public.polos add column cnpj text;
alter table public.polos add column cidade text;
alter table public.polos add column estado text;
alter table public.polos add column status text default 'ativo';
alter table public.polos add column is_matriz boolean default false;
alter table public.polos add column logo_url text;
alter table public.polos add column endereco text;
alter table public.polos add column numero text;
alter table public.polos add column complemento text;
alter table public.polos add column bairro text;
alter table public.polos add column cep text;
alter table public.polos add column telefone text;
alter table public.polos add column email text;
alter table public.polos add column created_at timestamptz default now();
alter table public.polos add column watermark_url text;
alter table public.polos add column watermark_opacity numeric;
alter table public.polos add column watermark_scale numeric;
alter table public.polos add column watermark_rotate boolean;
update public.polos set logo_url='data:image/png;base64,LOGO', watermark_url='data:image/png;base64,BACKGROUND',
  watermark_opacity=0, watermark_scale=100, watermark_rotate=false, cidade='Cidade Teste',estado='SE',is_matriz=true;
alter table public.documentos_validacao add column revogado_em timestamptz;
create table public.documentos_templates (id text primary key, conteudo jsonb, updated_at timestamptz default now());
alter table public.documentos_templates enable row level security;
grant usage on schema public,auth to authenticated,anon;
grant select on public.documentos_templates to authenticated;

CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_portal_base(p_documento text, p_matricula_id uuid, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_validade_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emitido_por uuid DEFAULT NULL::uuid, p_registrar_reemissao boolean DEFAULT false)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


CREATE OR REPLACE FUNCTION public.emitir_documento_validacao_portal(p_documento text, p_matricula_id uuid, p_periodo_referencia text DEFAULT NULL::text, p_referencia_externa text DEFAULT NULL::text, p_validade_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emitido_por uuid DEFAULT NULL::uuid, p_registrar_reemissao boolean DEFAULT false)
 RETURNS TABLE(codigo text, documento text, emitido_em timestamp with time zone, ultima_emissao_em timestamp with time zone, validade_ate timestamp with time zone, status text, quantidade_emissoes integer, reutilizado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_issue record;
begin
  if v_documento in ('pasta_identificacao', 'ficha_matricula') then
    if nullif(btrim(coalesce(p_referencia_externa, '')), '') is not null
      or p_validade_ate is not null
    then
      raise exception 'Pasta/Ficha não aceita referência externa ou validade informada pelo cliente.'
        using errcode = '22023';
    end if;

    select issued.*
    into v_issue
    from public.emitir_ficha_validacao_portal(
      v_documento,
      p_matricula_id,
      p_periodo_referencia,
      p_emitido_por,
      p_registrar_reemissao,
      '{}'::jsonb
    ) as issued;

    if v_issue.codigo is null or not exists (
      select 1
      from public.documentos_validacao as validation
      where validation.codigo = v_issue.codigo
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'documentTemplateSnapshot'
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'institutionSnapshot'
        and coalesce(validation.dados_emissao, '{}'::jsonb) ? 'watermarkSnapshot'
    ) then
      raise exception 'A emissão de Pasta/Ficha não produziu o snapshot oficial completo.'
        using errcode = '55000';
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
    return;
  end if;

  return query
  select issued.*
  from public.emitir_documento_validacao_portal_base(
    v_documento,
    p_matricula_id,
    p_periodo_referencia,
    p_referencia_externa,
    p_validade_ate,
    p_emitido_por,
    p_registrar_reemissao
  ) as issued;
end;
$function$;

