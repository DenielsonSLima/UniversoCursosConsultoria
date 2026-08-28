begin;

set local lock_timeout = '5s';

do $migration$
declare
  v_function regprocedure :=
    'public.persist_banese_discount_removal_correction(uuid,timestamp with time zone,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_old_proof constant text := $proof$
    or v_remote_discount is not null and (
      exists (
        select 1 from jsonb_array_elements(v_remote_discount) as discount(item)
        where coalesce(
            (discount.item ->> 'TipoDesconto')::integer,
            (discount.item ->> 'tipoDesconto')::integer, -1
          ) <> 0
          or round(coalesce(
            (discount.item ->> 'Valor')::numeric,
            (discount.item ->> 'valor')::numeric, -1
          ), 2) <> 0::numeric
      )
    )
$proof$;
  v_new_proof constant text := $proof$
    or v_remote_discount is not null and (
      exists (
        select 1 from jsonb_array_elements(v_remote_discount) as discount(item)
        where not (
          coalesce(
            (discount.item ->> 'TipoDesconto')::integer,
            (discount.item ->> 'tipoDesconto')::integer, -1
          ) = 0
          and (
            (
              round(coalesce(
                (discount.item ->> 'Valor')::numeric,
                (discount.item ->> 'valor')::numeric, 0
              ), 2) = 0::numeric
              and left(coalesce(
                discount.item ->> 'Data',
                discount.item ->> 'data', ''
              ), 10) in ('', '0001-01-01')
            )
            or (
              round(coalesce(
                (discount.item ->> 'Valor')::numeric,
                (discount.item ->> 'valor')::numeric, -1
              ), 2) = 0::numeric
              and left(coalesce(
                discount.item ->> 'Data',
                discount.item ->> 'data', ''
              ), 10) = v_receivable.data_vencimento::text
            )
          )
        )
      )
    )
$proof$;
begin
  select pg_catalog.pg_get_functiondef(v_function) into v_definition;

  if pg_catalog.strpos(v_definition, v_new_proof) > 0
    and pg_catalog.strpos(v_definition, v_old_proof) = 0
  then
    return;
  end if;
  if pg_catalog.strpos(v_definition, v_old_proof) = 0
    or pg_catalog.strpos(v_definition, v_new_proof) > 0
  then
    raise exception
      'Prova remota do desconto Banese diverge do estado esperado.'
      using errcode = '23514';
  end if;

  execute pg_catalog.replace(v_definition, v_old_proof, v_new_proof);

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if pg_catalog.strpos(v_definition, v_new_proof) = 0
    or pg_catalog.strpos(v_definition, v_old_proof) > 0
  then
    raise exception
      'Tombstone vazio do desconto Banese não foi aceito pelo contrato.'
      using errcode = '23514';
  end if;
end;
$migration$;

commit;
