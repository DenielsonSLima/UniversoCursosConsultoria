-- Integra Pasta de Identificação e Ficha de Matrícula ao catálogo visual,
-- à emissão segura da Secretaria e ao histórico de documentos.

alter table public.modelos_fichas
  add column if not exists template_config jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.modelos_fichas
set
  status = upper(coalesce(nullif(btrim(status), ''), 'ATIVO')),
  updated_at = now()
where status is distinct from upper(coalesce(nullif(btrim(status), ''), 'ATIVO'));

alter table public.modelos_fichas
  drop constraint if exists modelos_fichas_status_check;

alter table public.modelos_fichas
  add constraint modelos_fichas_status_check
  check (status in ('ATIVO', 'INATIVO'));

insert into public.modelos_fichas (
  nome,
  tipo_curso,
  status,
  requer_assinatura,
  texto_contrato,
  campos_customizados,
  template_config,
  created_at,
  updated_at
)
select
  'Ficha de Matrícula Geral',
  'TODOS',
  'ATIVO',
  true,
  'Solicito minha matrícula e declaro verdadeiros os dados informados.',
  '[]'::jsonb,
  null,
  now(),
  now()
where not exists (
  select 1
  from public.modelos_fichas
  where lower(btrim(nome)) = lower('Ficha de Matrícula Geral')
);

alter table public.documentos_validacao
  drop constraint if exists documentos_validacao_documento_check;

alter table public.documentos_validacao
  add constraint documentos_validacao_documento_check
  check (documento in (
    'carteirinha',
    'cracha_estagio',
    'declaracao_matricula',
    'declaracao_frequencia',
    'declaracao_irpf',
    'boletim',
    'atestado_conclusao_tecnico',
    'historico_escolar',
    'transferencia',
    'rematricula',
    'termo_estagio',
    'pasta_identificacao',
    'ficha_matricula',
    'certificado_tecnico',
    'certificado_livre',
    'certificado_ead',
    'certificado_especializacao'
  ));

insert into public.documentos_validacao_politicas (
  documento,
  prefixo,
  escopo_identidade,
  validade_dias,
  exige_vinculo_ativo
)
values
  ('pasta_identificacao', 'PASTA', 'MATRICULA', null, false),
  ('ficha_matricula', 'FICHA-MAT', 'MATRICULA', null, false)
on conflict (documento) do update set
  prefixo = excluded.prefixo,
  escopo_identidade = excluded.escopo_identidade,
  validade_dias = excluded.validade_dias,
  exige_vinculo_ativo = excluded.exige_vinculo_ativo,
  updated_at = now();

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
        when p_documento in ('pasta_identificacao', 'ficha_matricula') then
          public.gestor_has_tab('secretaria', 'fichas')
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

create or replace function public.atualizar_snapshot_ficha_portal(
  p_codigo text,
  p_dados jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_documento text;
  v_polo_id uuid;
begin
  select documento, polo_id
  into v_documento, v_polo_id
  from public.documentos_validacao
  where codigo = p_codigo
  for update;

  if v_documento is null then
    raise exception 'Documento de validação não localizado.';
  end if;

  if v_documento not in ('pasta_identificacao', 'ficha_matricula') then
    raise exception 'Este documento não aceita o snapshot de ficha cadastral.';
  end if;

  if not public.can_manage_secretaria_document(v_documento, v_polo_id) then
    raise exception 'Usuário sem permissão para atualizar o snapshot desta ficha.';
  end if;

  update public.documentos_validacao
  set dados_emissao = coalesce(dados_emissao, '{}'::jsonb) || coalesce(p_dados, '{}'::jsonb)
  where codigo = p_codigo;

  return found;
end;
$function$;

revoke all on function public.atualizar_snapshot_ficha_portal(text, jsonb)
  from public, anon;
grant execute on function public.atualizar_snapshot_ficha_portal(text, jsonb)
  to authenticated, service_role;

update public.perfis_acesso
set permissoes = jsonb_set(
  permissoes,
  '{tabs,secretaria}',
  coalesce(permissoes #> '{tabs,secretaria}', '[]'::jsonb) || '"fichas"'::jsonb,
  true
)
where coalesce(permissoes -> 'modules', '[]'::jsonb) ? 'secretaria'
  and not (coalesce(permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'fichas');

update public.usuarios_sistema
set permissoes = jsonb_set(
  permissoes,
  '{tabs,secretaria}',
  coalesce(permissoes #> '{tabs,secretaria}', '[]'::jsonb) || '"fichas"'::jsonb,
  true
)
where perfil_acesso_id is null
  and coalesce(permissoes -> 'modules', '[]'::jsonb) ? 'secretaria'
  and not (coalesce(permissoes #> '{tabs,secretaria}', '[]'::jsonb) ? 'fichas');
