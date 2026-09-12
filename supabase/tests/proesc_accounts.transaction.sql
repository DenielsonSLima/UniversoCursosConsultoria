-- Executar por MCP em transação após a migration, ou em banco contratual local.
-- O polo fictício aciona também os triggers já existentes. Nenhum dado é confirmado.
begin;
set local request.jwt.claims = '{"role":"service_role"}';

create function pg_temp.financial_fingerprint()
returns text language sql set search_path = '' as $$
  select md5(concat_ws('|',
    (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), '')) from public.contas_receber r),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), '')) from public.contas_pagar r),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), '')) from public.despesas_lancamentos r),
    (select md5(coalesce(string_agg(to_jsonb(r)::text, '' order by id), '')) from public.transferencias_contas r)
  ));
$$;

do $$
declare
  v_before text := pg_temp.financial_fingerprint();
  v_accounts_before text;
  v_accounts_after text;
  v_matriz public.polos;
  v_proesc uuid;
  v_polo uuid := gen_random_uuid();
  v_caixa uuid;
  v_caixa_count integer;
begin
  if has_schema_privilege('authenticated', 'internal_contas', 'usage')
     or has_function_privilege('authenticated', 'internal_contas.provision_school_accounts()', 'execute')
     or has_function_privilege('anon', 'public.provision_polo_accounts_trigger()', 'execute') then
    raise exception 'Provisionamento exposto fora do serviço interno';
  end if;
  if exists(select 1 from pg_class where oid in (
    'public.contas_bancarias'::regclass, 'public.contas_bancarias_polos'::regclass
  ) and not relrowsecurity) then raise exception 'RLS das contas desabilitada'; end if;

  select * into strict v_matriz from public.polos where is_matriz and lower(status) = 'ativo';
  select id into strict v_proesc from public.contas_bancarias
    where codigo_interno = 'INTEGRATION:PROESC:' || v_matriz.id::text
      and system_managed and natureza = 'BANCARIA' and banco = 'PROESC';
  if exists(select 1 from public.polos p where lower(p.status) = 'ativo' and (
    not exists(select 1 from public.contas_bancarias c where c.polo_id = p.id and natureza = 'CAIXA_INTERNO')
    or not exists(select 1 from public.contas_bancarias_polos a where a.conta_bancaria_id = v_proesc and a.polo_id = p.id)
  )) then raise exception 'Polo ativo sem contas operacionais'; end if;

  select md5(string_agg(to_jsonb(c)::text, '' order by id)) into v_accounts_before
    from public.contas_bancarias c;
  perform internal_contas.provision_school_accounts();
  perform internal_contas.provision_school_accounts();
  select md5(string_agg(to_jsonb(c)::text, '' order by id)) into v_accounts_after
    from public.contas_bancarias c;
  if v_accounts_before is distinct from v_accounts_after then
    raise exception 'Repetição alterou contas preexistentes';
  end if;

  insert into public.polos(id, company_id, nome, cnpj, cidade, estado, status, is_matriz)
    values(v_polo, v_matriz.company_id, 'Polo contratual fictício', '00.000.000/0000-00',
      'Cidade fictícia', 'SE', 'inativo', false);
  if exists(select 1 from public.contas_bancarias where polo_id = v_polo) then
    raise exception 'Polo ainda inativo recebeu Caixa operacional';
  end if;
  update public.polos set status = 'ativo' where id = v_polo;
  select id into strict v_caixa from public.contas_bancarias
    where polo_id = v_polo and natureza = 'CAIXA_INTERNO' and system_managed;
  if (select count(*) from public.contas_bancarias_polos where conta_bancaria_id = v_caixa) <> 1
     or not exists(select 1 from public.contas_bancarias_polos where conta_bancaria_id = v_caixa and polo_id = v_polo)
     or not exists(select 1 from public.contas_bancarias_polos where conta_bancaria_id = v_proesc and polo_id = v_polo) then
    raise exception 'Caixa não exclusivo ou Proesc não compartilhado no novo polo';
  end if;
  if not public.conta_bancaria_disponivel_no_polo(v_caixa, v_polo)
     or public.conta_bancaria_disponivel_no_polo(v_caixa, v_matriz.id) then
    raise exception 'Escopo do Caixa individual inválido';
  end if;

  update public.polos set status = 'inativo' where id = v_polo;
  if public.conta_bancaria_disponivel_no_polo(v_proesc, v_polo) then
    raise exception 'Polo inativo manteve disponibilidade operacional';
  end if;
  update public.polos set status = 'ativo' where id = v_polo;
  select count(*) into v_caixa_count from public.contas_bancarias
    where polo_id = v_polo and natureza = 'CAIXA_INTERNO' and id = v_caixa;
  if v_caixa_count <> 1 then raise exception 'Reativação duplicou ou trocou o Caixa'; end if;
  if v_before is distinct from pg_temp.financial_fingerprint() then
    raise exception 'Provisionamento ou trigger associado alterou movimentação financeira';
  end if;
end;
$$;
rollback;
