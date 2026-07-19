-- Exact RBAC wrappers for academic rosters and Secretaria documents.
-- Existing implementations are retained in the internal schema unchanged.

create or replace function public.can_manage_secretaria_document(
  p_documento text,
  p_polo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.role()), '') = 'service_role'
    or (
      case
        when p_documento in ('carteirinha', 'cracha_estagio') then
          public.gestor_has_tab('secretaria', 'carteirinhas')
        -- Parceiros already exposes only matriculation declarations and IRPF
        -- from the student's own workspace. Preserve those two established
        -- actions without granting the remaining Secretaria document family.
        when p_documento in ('declaracao_matricula', 'declaracao_irpf') then
          public.gestor_has_tab('secretaria', 'declaracoes')
          or public.gestor_has_module('parceiros')
        when p_documento in (
          'declaracao_frequencia', 'boletim', 'atestado_conclusao_tecnico'
        ) then public.gestor_has_tab('secretaria', 'declaracoes')
        when p_documento in (
          'historico_escolar', 'certificado_tecnico', 'certificado_ead',
          'certificado_livre', 'certificado_especializacao'
        ) then public.gestor_has_tab('secretaria', 'historico')
        when p_documento in ('rematricula', 'termo_estagio', 'transferencia') then
          public.gestor_has_tab('secretaria', 'solicitacoes')
        else false
      end
      and case
        when p_polo_id is null then public.gestor_has_all_polos()
        else public.is_gestor_for_polo(p_polo_id)
      end
    );
$function$;

revoke all on function public.can_manage_secretaria_document(text, uuid)
  from public, anon;
grant execute on function public.can_manage_secretaria_document(text, uuid)
  to authenticated, service_role;

-- The Parceiros student workspace needs the paid rows only to compose the IRPF
-- declaration. Keep the existing filters and move the annual total authority
-- into Postgres; the frontend receives and formats the same total on every row.
-- add no general Financeiro access: the exception is confined to this IRPF RPC,
-- the requested student/year/class and an allowed polo during the access window.
drop function if exists public.get_pagamentos_irpf_aluno(uuid, integer, uuid);

create function public.get_pagamentos_irpf_aluno(
  p_aluno_id uuid,
  p_ano integer,
  p_turma_id uuid default null
)
returns table(
  turma_id uuid,
  turma_nome text,
  matricula_id uuid,
  parcela_id uuid,
  status text,
  valor numeric,
  valor_pago numeric,
  data_pagamento date,
  data_vencimento date,
  numero_parcela integer,
  total_parcelas integer,
  asaas_invoice text,
  total_anual_pago numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    cr.turma_id,
    t.nome as turma_nome,
    cr.matricula_id,
    cr.id as parcela_id,
    cr.status,
    coalesce(cr.valor, 0) as valor,
    coalesce(cr.valor_pago, cr.valor, 0) as valor_pago,
    cr.data_pagamento::date,
    cr.data_vencimento::date,
    cr.parcela_numero as numero_parcela,
    null::integer as total_parcelas,
    coalesce(cr.asaas_invoice_url, cr.asaas_payment_id) as asaas_invoice,
    sum(coalesce(cr.valor_pago, cr.valor, 0)) over () as total_anual_pago
  from public.contas_receber cr
  left join public.turmas t on t.id = cr.turma_id
  where cr.cliente_id = p_aluno_id
    and (
      coalesce((select auth.role()), '') = 'service_role'
      or p_aluno_id = public.current_aluno_id()
      or public.is_financeiro_for_polo(cr.polo_id)
      or (
        public.gestor_has_module('parceiros')
        and public.is_gestor_for_polo(cr.polo_id)
      )
    )
    and cr.status = 'PAGO'
    and cr.data_pagamento is not null
    and extract(year from cr.data_pagamento::date) = p_ano
    and (p_turma_id is null or cr.turma_id = p_turma_id)
  order by cr.data_pagamento desc nulls last;
$function$;

revoke all on function public.get_pagamentos_irpf_aluno(uuid, integer, uuid)
  from public, anon;
grant execute on function public.get_pagamentos_irpf_aluno(uuid, integer, uuid)
  to authenticated, service_role;

alter function public.get_diario_alunos(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.get_diario_alunos(uuid, uuid)
  rename to p1_get_diario_alunos_20260719;

alter function public.get_diario_resultados(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.get_diario_resultados(uuid, uuid)
  rename to p1_get_diario_resultados_20260719;

alter function public.get_estagio_alunos_contexto(uuid, uuid)
  set schema internal_academic;
alter function internal_academic.get_estagio_alunos_contexto(uuid, uuid)
  rename to p1_get_estagio_alunos_contexto_20260719;

alter function public.get_turma_alunos_academico(uuid)
  set schema internal_academic;
alter function internal_academic.get_turma_alunos_academico(uuid)
  rename to p1_get_turma_alunos_academico_20260719;

alter function public.get_secretaria_carteirinha_workspace_secure(uuid)
  set schema internal_academic;
alter function internal_academic.get_secretaria_carteirinha_workspace_secure(uuid)
  rename to p1_get_secretaria_carteirinha_workspace_20260719;

alter function public.finalizar_certificado_academico(
  uuid, text, text, text, text, text, text, text, uuid
) set schema internal_academic;
alter function internal_academic.finalizar_certificado_academico(
  uuid, text, text, text, text, text, text, text, uuid
) rename to p1_finalizar_certificado_academico_20260719;

alter function public.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) set schema internal_academic;
alter function internal_academic.emitir_documento_validacao_portal(
  text, uuid, text, text, timestamptz, uuid, boolean
) rename to p1_emitir_documento_validacao_portal_20260719;

alter function public.revogar_documento_validacao_portal(text)
  set schema internal_academic;
alter function internal_academic.revogar_documento_validacao_portal(text)
  rename to p1_revogar_documento_validacao_portal_20260719;

do $block$
declare function_oid regprocedure;
begin
  foreach function_oid in array array[
    'internal_academic.p1_get_diario_alunos_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_get_diario_resultados_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_get_estagio_alunos_contexto_20260719(uuid,uuid)'::regprocedure,
    'internal_academic.p1_get_turma_alunos_academico_20260719(uuid)'::regprocedure,
    'internal_academic.p1_get_secretaria_carteirinha_workspace_20260719(uuid)'::regprocedure,
    'internal_academic.p1_finalizar_certificado_academico_20260719(uuid,text,text,text,text,text,text,text,uuid)'::regprocedure,
    'internal_academic.p1_emitir_documento_validacao_portal_20260719(text,uuid,text,text,timestamptz,uuid,boolean)'::regprocedure,
    'internal_academic.p1_revogar_documento_validacao_portal_20260719(text)'::regprocedure
  ] loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      function_oid
    );
  end loop;
end;
$block$;

create or replace function public.get_diario_alunos(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table(
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  data_matricula timestamptz,
  status text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_can_read_diario_results(p_turma_id)
    and not public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id) then
    raise exception 'Acesso ao diário não autorizado.' using errcode = '42501';
  end if;
  return query select *
  from internal_academic.p1_get_diario_alunos_20260719(
    p_turma_id, p_disciplina_id
  );
end;
$function$;

create or replace function public.get_diario_resultados(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table(
  turma_id uuid, disciplina_id uuid, aluno_id uuid,
  nota_p numeric, nota_ti numeric, nota_tg numeric, nota_s numeric,
  nota_cq numeric, nota_o numeric, nota_rec numeric,
  total_aulas bigint, total_faltas bigint, frequencia_percent numeric,
  media_parcial numeric, media_final numeric, resultado_final text
)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_full_access boolean;
  v_student_access boolean;
begin
  v_full_access :=
    coalesce((select auth.role()), '') = 'service_role'
    or public.gestor_can_read_diario_results(p_turma_id)
    or public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id);

  select exists (
    select 1
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.turma_id = p_turma_id
      and m.aluno_id = v_aluno_id
      and upper(coalesce(c.modalidade, '')) in ('TECNICO', 'TÉCNICO')
      and (
        (
          upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          and upper(coalesce(m.status, '')) = 'ATIVO'
        )
        or (
          upper(coalesce(t.status, '')) = 'FINALIZADA'
          and upper(coalesce(m.status, '')) in ('CONCLUIDO', 'REPROVADO')
        )
      )
  ) into v_student_access;

  if not coalesce(v_full_access, false)
    and not coalesce(v_student_access, false) then
    raise exception 'Acesso aos resultados não autorizado.' using errcode = '42501';
  end if;

  if coalesce(v_full_access, false) then
    return query select *
    from internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id, p_disciplina_id
    );
  else
    return query
    select result.*
    from internal_academic.p1_get_diario_resultados_20260719(
      p_turma_id, p_disciplina_id
    ) result
    where result.aluno_id = v_aluno_id;
  end if;
end;
$function$;

create or replace function public.get_estagio_alunos_contexto(
  p_turma_id uuid,
  p_disciplina_id uuid
)
returns table(
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  status_matricula text,
  vacinas_exigidas boolean,
  vacinas_liberadas boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.gestor_can_read_estagio_records(p_turma_id)
    and not public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id) then
    raise exception 'Acesso ao estágio não autorizado.' using errcode = '42501';
  end if;
  return query select *
  from internal_academic.p1_get_estagio_alunos_contexto_20260719(
    p_turma_id, p_disciplina_id
  );
end;
$function$;

create or replace function public.get_turma_alunos_academico(p_turma_id uuid)
returns table(
  matricula_id uuid, aluno_id uuid, nome text, cpf text,
  data_nascimento date, data_matricula timestamptz, status text,
  frequencia_percent numeric, tem_lancamentos_academicos boolean,
  pode_remover boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.can_operate_turma_academics(p_turma_id) then
    raise exception 'Acesso ao cadastro acadêmico não autorizado.' using errcode = '42501';
  end if;
  return query select *
  from internal_academic.p1_get_turma_alunos_academico_20260719(p_turma_id);
end;
$function$;

create or replace function public.get_secretaria_carteirinha_workspace_secure(
  p_polo_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.can_manage_secretaria_document('carteirinha', p_polo_id) then
    raise exception 'Acesso às carteirinhas não autorizado.' using errcode = '42501';
  end if;
  return internal_academic.p1_get_secretaria_carteirinha_workspace_20260719(
    p_polo_id
  );
end;
$function$;

create or replace function public.finalizar_certificado_academico(
  p_certificado_id uuid,
  p_certificado_numero text default null,
  p_pagina_livro text default null,
  p_livro_registro text default null,
  p_validacao_sistec text default null,
  p_ensino_medio_estabelecimento text default null,
  p_ensino_medio_localidade_uf text default null,
  p_ensino_medio_ano_conclusao text default null,
  p_emitido_por uuid default null
)
returns public.certificados_academicos
language plpgsql security definer set search_path = ''
as $function$
declare
  v_polo_id uuid;
  v_modalidade text;
  v_documento text;
begin
  select ca.polo_id, ca.modalidade into v_polo_id, v_modalidade
  from public.certificados_academicos ca where ca.id = p_certificado_id;
  v_documento := case upper(coalesce(v_modalidade, ''))
    when 'TECNICO' then 'certificado_tecnico'
    when 'EAD' then 'certificado_ead'
    when 'LIVRE' then 'certificado_livre'
    else 'certificado_especializacao'
  end;
  if not public.can_manage_secretaria_document(v_documento, v_polo_id) then
    raise exception 'Acesso à emissão de certificados não autorizado.' using errcode = '42501';
  end if;
  return internal_academic.p1_finalizar_certificado_academico_20260719(
    p_certificado_id, p_certificado_numero, p_pagina_livro, p_livro_registro,
    p_validacao_sistec, p_ensino_medio_estabelecimento,
    p_ensino_medio_localidade_uf, p_ensino_medio_ano_conclusao, p_emitido_por
  );
end;
$function$;

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
  codigo text, documento text, emitido_em timestamptz,
  ultima_emissao_em timestamptz, validade_ate timestamptz, status text,
  quantidade_emissoes integer, reutilizado boolean
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_aluno_id uuid;
  v_polo_id uuid;
begin
  select m.aluno_id, t.polo_id into v_aluno_id, v_polo_id
  from public.matriculas m
  left join public.turmas t on t.id = m.turma_id
  where m.id = p_matricula_id;

  if coalesce((select auth.role()), '') <> 'service_role'
    and public.current_aluno_id() is distinct from v_aluno_id
    and not public.can_manage_secretaria_document(p_documento, v_polo_id) then
    raise exception 'Acesso à emissão deste documento não autorizado.' using errcode = '42501';
  end if;

  return query select *
  from internal_academic.p1_emitir_documento_validacao_portal_20260719(
    p_documento, p_matricula_id, p_periodo_referencia,
    p_referencia_externa, p_validade_ate, p_emitido_por,
    p_registrar_reemissao
  );
end;
$function$;

create or replace function public.revogar_documento_validacao_portal(p_codigo text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare
  v_documento text;
  v_polo_id uuid;
begin
  select dv.documento, dv.polo_id into v_documento, v_polo_id
  from public.documentos_validacao dv
  where upper(dv.codigo) = upper(btrim(p_codigo));
  if not public.can_manage_secretaria_document(v_documento, v_polo_id) then
    raise exception 'Acesso à revogação deste documento não autorizado.' using errcode = '42501';
  end if;
  return internal_academic.p1_revogar_documento_validacao_portal_20260719(
    p_codigo
  );
end;
$function$;

do $block$
declare function_oid regprocedure;
begin
  foreach function_oid in array array[
    'public.get_diario_alunos(uuid,uuid)'::regprocedure,
    'public.get_diario_resultados(uuid,uuid)'::regprocedure,
    'public.get_estagio_alunos_contexto(uuid,uuid)'::regprocedure,
    'public.get_turma_alunos_academico(uuid)'::regprocedure,
    'public.get_secretaria_carteirinha_workspace_secure(uuid)'::regprocedure,
    'public.finalizar_certificado_academico(uuid,text,text,text,text,text,text,text,uuid)'::regprocedure,
    'public.emitir_documento_validacao_portal(text,uuid,text,text,timestamptz,uuid,boolean)'::regprocedure,
    'public.revogar_documento_validacao_portal(text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', function_oid);
    execute format('grant execute on function %s to authenticated, service_role', function_oid);
  end loop;
end;
$block$;
