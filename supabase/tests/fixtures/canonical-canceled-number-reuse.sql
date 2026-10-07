CREATE OR REPLACE FUNCTION internal_academic.guard_technical_manual_banese_canceled_number_reuse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.gateway_boleto_nosso_numero is null
    or new.gateway_provider is distinct from 'banese_card'
    or new.gateway_payment_method is distinct from 'BOLETO'
  then
    return new;
  end if;
  if new.gateway_environment is null
    or new.gateway_boleto_convenio is null
  then
    raise exception 'Ambiente e convênio Banese são obrigatórios.'
      using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.gateway_environment || ':' ||
      new.gateway_boleto_convenio || ':' ||
      new.gateway_boleto_nosso_numero, 0));
  if exists (
      select 1
      from internal_academic.technical_manual_banese_reissue_archive as archive
      where archive.environment = new.gateway_environment
        and archive.convenio = new.gateway_boleto_convenio
        and archive.canceled_nosso_numero = new.gateway_boleto_nosso_numero
      union all
      select 1
      from public.banese_ead_title_replacement_archive as archive
      where archive.environment = new.gateway_environment
        and archive.convenio = new.gateway_boleto_convenio
        and archive.canceled_nosso_numero = new.gateway_boleto_nosso_numero
    )
  then
    raise exception 'Nosso Número Banese cancelado não pode ser reutilizado.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER guard_technical_manual_banese_canceled_number_reuse BEFORE INSERT OR UPDATE OF gateway_boleto_nosso_numero, gateway_environment, gateway_boleto_convenio, gateway_provider, gateway_payment_method ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_technical_manual_banese_canceled_number_reuse();
