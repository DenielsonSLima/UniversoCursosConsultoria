begin;

-- Contas de controle: não cria movimentações, baixas nem vínculos em recebíveis.
create schema if not exists internal_contas;
revoke all on schema internal_contas from public, anon, authenticated;

create function internal_contas.provision_school_accounts()
returns void language plpgsql set search_path = '' as $$
declare
  v_polo record;
  v_owner public.polos;
  v_account uuid;
  v_owner_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('universo:school-control-accounts', 0));
  for v_polo in select id, nome from public.polos where lower(status) = 'ativo' loop
    insert into public.contas_bancarias (
      polo_id, banco, titular, agencia, conta, tipo, saldo_inicial,
      data_saldo, ativo, codigo_interno, natureza, system_managed
    ) values (
      v_polo.id, 'CAIXA DA UNIDADE', v_polo.nome, 'CAIXA',
      'CX-' || left(replace(v_polo.id::text, '-', ''), 8), 'Caixa', 0, current_date, true,
      'CAIXA:' || v_polo.id::text, 'CAIXA_INTERNO', true
    ) on conflict (polo_id) where natureza = 'CAIXA_INTERNO' do nothing;

    select id into v_account from public.contas_bancarias
      where polo_id = v_polo.id and natureza = 'CAIXA_INTERNO';
    -- Caixa é exclusivo da unidade titular; valores e dados preexistentes ficam preservados.
    delete from public.contas_bancarias_polos
      where conta_bancaria_id = v_account and polo_id <> v_polo.id;
    insert into public.contas_bancarias_polos(conta_bancaria_id, polo_id)
      values (v_account, v_polo.id) on conflict do nothing;
  end loop;

  select count(*) into v_owner_count from public.polos
    where is_matriz and lower(status) = 'ativo';
  if v_owner_count = 0 then return; end if;
  if v_owner_count <> 1 then
    raise exception 'A conta Proesc requer uma única Matriz ativa.';
  end if;
  select * into v_owner from public.polos where is_matriz and lower(status) = 'ativo';

  -- Proesc identifica o controle da integração, sem representar conta bancária real.
  -- Agência e conta vazias respeitam o NOT NULL legado sem inventar identificadores.
  insert into public.contas_bancarias (
    polo_id, banco, titular, agencia, conta, tipo, saldo_inicial,
    data_saldo, ativo, codigo_interno, natureza, system_managed
  ) values (
    v_owner.id, 'PROESC', v_owner.nome, '', '', 'Pagamento', 0,
    null, true, 'INTEGRATION:PROESC:' || v_owner.id::text, 'BANCARIA', true
  ) on conflict (codigo_interno) where codigo_interno is not null do nothing;

  select id into v_account from public.contas_bancarias
    where codigo_interno = 'INTEGRATION:PROESC:' || v_owner.id::text;
  insert into public.contas_bancarias_polos(conta_bancaria_id, polo_id)
    select v_account, id from public.polos where lower(status) = 'ativo'
    on conflict do nothing;
end;
$$;
revoke all on function internal_contas.provision_school_accounts() from public, anon, authenticated;

create function public.provision_polo_accounts_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform internal_contas.provision_school_accounts();
  return new;
end;
$$;
revoke all on function public.provision_polo_accounts_trigger() from public, anon, authenticated;

create trigger provision_polo_accounts_trigger
after insert or update of status, is_matriz on public.polos
for each row execute function public.provision_polo_accounts_trigger();

-- Corrige as unidades anteriores ao trigger sem chamar a sincronização Banese.
select internal_contas.provision_school_accounts();

comment on function internal_contas.provision_school_accounts() is
  'Provisionamento interno de Caixa individual e controle Proesc compartilhado. Não altera recebíveis ou saldos existentes.';
commit;
