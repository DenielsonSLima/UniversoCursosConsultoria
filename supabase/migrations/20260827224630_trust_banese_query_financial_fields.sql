begin;

-- O manual e o GET oficial por Nosso Numero definem ValorNominal e
-- DataVencimento como os campos financeiros autoritativos da consulta. O
-- proprio exemplo oficial pode devolver valor/fator internos do codigo de
-- barras diferentes desses campos; por isso a identidade financeira deve ser
-- comprovada pelo snapshot autenticado do GET, sem rejeitar o par bancario
-- oficial e autoconsistente.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.persist_banese_recovered_pix(uuid,text,text,text,text,text,text,numeric,date,text,boolean,jsonb)'::regprocedure
  );
  v_old_encoded_identity constant text := $old$  if substring(p_remote_barcode from 10 for 10)::numeric
      is distinct from round(p_expected_amount * 100)
    or substring(p_remote_barcode from 6 for 4)::integer is distinct from (
      case
        when p_expected_due_date between date '2000-07-03' and date '2025-02-21'
          then p_expected_due_date - date '1997-10-07'
        when p_expected_due_date between date '2025-02-22' and date '2049-10-13'
          then 1000 + (p_expected_due_date - date '2025-02-22')
        else null
      end
    )
  then
    raise exception 'Valor ou vencimento do codigo de barras Banese diverge do titulo.';
  end if;$old$;
  v_new_query_identity constant text := $new$  if jsonb_typeof(coalesce(p_reconciliation, '{}'::jsonb)) <> 'object'
    or coalesce(p_reconciliation ->> 'source', '') <> 'BANESE_QUERY_BY_NOSSO_NUMERO'
    or coalesce(p_reconciliation ->> 'convenio', '') <> p_expected_convenio
    or coalesce(p_reconciliation ->> 'nossoNumero', '') <> p_nosso_numero
    or jsonb_typeof(p_reconciliation -> 'response') <> 'object'
    or regexp_replace(coalesce(
      p_reconciliation #>> '{response,NumeroLinhaDigitavel}',
      p_reconciliation #>> '{response,numeroLinhaDigitavel}',
      ''
    ), '\D', '', 'g') <> p_remote_digitable_line
    or regexp_replace(coalesce(
      p_reconciliation #>> '{response,NumeroCodigoBarras}',
      p_reconciliation #>> '{response,numeroCodigoBarras}',
      ''
    ), '\D', '', 'g') <> p_remote_barcode
  then
    raise exception 'Snapshot da consulta Banese invalido para persistencia Pix.';
  end if;
  if coalesce(
      p_reconciliation #>> '{response,ValorNominal}',
      p_reconciliation #>> '{response,valorNominal}',
      ''
    ) !~ '^[0-9]+([.][0-9]+)?$'
    or round(coalesce(
      p_reconciliation #>> '{response,ValorNominal}',
      p_reconciliation #>> '{response,valorNominal}'
    )::numeric, 2) is distinct from round(p_expected_amount, 2)
    or left(coalesce(
      p_reconciliation #>> '{response,DataVencimento}',
      p_reconciliation #>> '{response,dataVencimento}',
      ''
    ), 10) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or left(coalesce(
      p_reconciliation #>> '{response,DataVencimento}',
      p_reconciliation #>> '{response,dataVencimento}'
    ), 10)::date is distinct from p_expected_due_date
  then
    raise exception 'ValorNominal ou DataVencimento da consulta Banese diverge do titulo.';
  end if;$new$;
begin
  if position(v_old_encoded_identity in v_definition) = 0 then
    raise exception 'Contrato inesperado em persist_banese_recovered_pix.';
  end if;

  v_definition := replace(
    v_definition,
    v_old_encoded_identity,
    v_new_query_identity
  );
  execute v_definition;
end;
$migration$;

alter function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) set search_path = '';

revoke all on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) to service_role;

comment on function public.persist_banese_recovered_pix(
  uuid, text, text, text, text, text, text, numeric, date, text, boolean, jsonb
) is
  'Persiste Pix e numeros oficiais do GET Banese por Nosso Numero com identidade financeira do snapshot, CAS e locks.';

commit;
