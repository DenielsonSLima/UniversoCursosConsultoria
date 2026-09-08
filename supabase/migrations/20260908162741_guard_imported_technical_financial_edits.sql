begin;

create or replace function internal_academic.guard_imported_technical_class_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
  v_field text;
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
begin
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  where policy.turma_id = new.id and policy.active;
  if not found then return new; end if;
  if v_policy.initial_state = 'IMPORTADA_CONCLUIDA' then
    -- Academic configuration RPCs include unchanged financial flags in UPDATE.
    -- Compare the financial inputs, excluding derived schedule/fingerprints.
    foreach v_field in array array[
      'cobrar_matricula', 'valor_matricula', 'cobrar_rematricula',
      'valor_rematricula', 'qtd_parcelas', 'valor_parcela',
      'desconto_pontualidade', 'juros_atraso', 'multa_atraso_percentual',
      'aplicar_desconto_matricula', 'aplicar_multa_juros_matricula',
      'aplicar_desconto_mensalidade', 'aplicar_multa_juros_mensalidade',
      'aplicar_desconto_rematricula', 'aplicar_multa_juros_rematricula',
      'dia_vencimento_padrao', 'primeiro_vencimento_padrao',
      'instrucao_boleto_carne', 'origem_financeira', 'financeiro_herdado',
      'gerar_cobrancas_futuras', 'sincronizar_asaas_futuro',
      'publicar_no_site', 'permitir_inscricoes_online'
    ] loop
      if v_new -> v_field is distinct from v_old -> v_field then
        raise exception 'Turma com ciclos externos encerrados: a configuração financeira está bloqueada.'
          using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;
  if v_policy.eligibility_rule = 'HISTORICO_EXTERNO' and (
    new.cobrar_matricula or coalesce(new.valor_matricula, 0) <> 0
    or new.aplicar_desconto_matricula or new.aplicar_multa_juros_matricula
    or new.gerar_cobrancas_futuras or new.sincronizar_asaas_futuro
    or new.publicar_no_site or new.permitir_inscricoes_online
    or new.origem_financeira is distinct from 'LEGADO'
    or new.financeiro_herdado is distinct from true
  ) then
    raise exception 'Histórico externo permite somente o 2º ciclo manual, sem matrícula ou inscrições públicas.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_imported_technical_class_finance()
  from public, anon, authenticated, service_role;

-- Runs after the canonical monetary normalization, and protects direct UPDATEs.
create trigger z_guard_imported_technical_class_finance
before update of cobrar_matricula, valor_matricula, cobrar_rematricula,
  valor_rematricula, qtd_parcelas, valor_parcela, desconto_pontualidade,
  juros_atraso, multa_atraso, multa_atraso_percentual,
  aplicar_desconto_matricula, aplicar_multa_juros_matricula,
  aplicar_desconto_mensalidade, aplicar_multa_juros_mensalidade,
  aplicar_desconto_rematricula, aplicar_multa_juros_rematricula,
  dia_vencimento_padrao, primeiro_vencimento_padrao, instrucao_boleto_carne,
  cronograma_financeiro, origem_financeira, financeiro_herdado,
  gerar_cobrancas_futuras, sincronizar_asaas_futuro,
  publicar_no_site, permitir_inscricoes_online
on public.turmas for each row
execute function internal_academic.guard_imported_technical_class_finance();

create or replace function internal_academic.guard_imported_technical_enrollment_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_field text;
begin
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  where policy.turma_id = new.turma_id and policy.active;
  if not found or (
    v_policy.initial_state <> 'IMPORTADA_CONCLUIDA'
    and v_policy.eligibility_rule <> 'HISTORICO_EXTERNO'
  ) then return new; end if;

  if coalesce(new.cobrar_matricula_individual, false)
    or coalesce(new.valor_matricula_individual, 0) <> 0
    or coalesce(new.aplicar_desconto_matricula_individual, false)
    or coalesce(new.aplicar_multa_juros_matricula_individual, false)
    or coalesce(new.gerar_cobranca_inicial, false)
    or coalesce(new.gerar_cobranca_futura, false)
    or coalesce(new.sincronizar_asaas, false)
  then
    raise exception 'Turma importada não permite cobrar matrícula ou ativar cobrança automática.'
      using errcode = '42501';
  end if;

  if v_policy.initial_state = 'IMPORTADA_CONCLUIDA' and tg_op = 'UPDATE'
    and exists (
      select 1 from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = new.id
    ) then
    v_old := to_jsonb(old);
    for v_field in
      select key from jsonb_object_keys(v_new) key
      where key like '%\_individual' escape '\'
        or key = 'data_primeiro_vencimento_financeiro'
    loop
      if v_new -> v_field is distinct from v_old -> v_field then
        raise exception 'Turma sem novas cobranças: condições individuais bloqueadas.'
          using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_imported_technical_enrollment_finance()
  from public, anon, authenticated, service_role;
create trigger z_guard_imported_technical_enrollment_finance
before insert or update on public.matriculas for each row
execute function internal_academic.guard_imported_technical_enrollment_finance();

create or replace function internal_academic.guard_imported_technical_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
begin
  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  where policy.turma_id = new.turma_id and policy.active;
  if not found or (
    v_policy.initial_state <> 'IMPORTADA_CONCLUIDA'
    and v_policy.eligibility_rule <> 'HISTORICO_EXTERNO'
  ) then return new; end if;
  if new.status_financeiro = 'AGENDADA' or new.ativar_em is not null then
    raise exception 'Turma importada não permite ativação financeira agendada.'
      using errcode = '42501';
  end if;
  if v_policy.initial_state = 'IMPORTADA_CONCLUIDA' and new.override_ativo then
    raise exception 'Turma sem novas cobranças não permite condições financeiras individuais.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function internal_academic.guard_imported_technical_activation()
  from public, anon, authenticated, service_role;
create trigger z_guard_imported_technical_activation
before insert or update on public.matriculas_tecnicas_financeiro_config
for each row execute function internal_academic.guard_imported_technical_activation();

notify pgrst, 'reload schema';
commit;
