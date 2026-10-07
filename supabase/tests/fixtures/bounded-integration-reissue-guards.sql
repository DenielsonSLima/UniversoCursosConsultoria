-- Exact current archive triggers; no remote execution.
create table public.banese_ead_title_replacement_archive(environment text,convenio text,canceled_nosso_numero text);
CREATE OR REPLACE FUNCTION internal_academic.guard_banese_canceled_number_archive_global()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'banese-canceled-number:' || new.environment || ':' || new.convenio || ':' ||
      new.canceled_nosso_numero, 0));
  if exists (
    select 1 from public.contas_receber as receivable
    where receivable.id <> new.receivable_id
      and receivable.gateway_provider = 'banese_card'
      and receivable.gateway_environment = new.environment
      and receivable.gateway_payment_method = 'BOLETO'
      and receivable.gateway_boleto_convenio = new.convenio
      and receivable.gateway_boleto_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese pertence a outro recebível.'
      using errcode = '23505';
  elsif tg_table_schema = 'internal_academic' and exists (
    select 1 from public.banese_ead_title_replacement_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo EAD.'
      using errcode = '23505';
  elsif tg_table_schema = 'public' and exists (
    select 1
    from internal_academic.technical_manual_banese_reissue_archive as archive
    where archive.environment = new.environment
      and archive.convenio = new.convenio
      and archive.canceled_nosso_numero = new.canceled_nosso_numero
  ) then
    raise exception 'Nosso Número Banese já arquivado no fluxo técnico.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER guard_technical_banese_canceled_number_archive_global BEFORE INSERT ON internal_academic.technical_manual_banese_reissue_archive FOR EACH ROW EXECUTE FUNCTION internal_academic.guard_banese_canceled_number_archive_global();
CREATE OR REPLACE FUNCTION internal_academic.prevent_technical_manual_banese_reissue_archive_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'O arquivo da reemissão técnica Banese é imutável.'
    using errcode = '55000';
end;
$function$
;
CREATE TRIGGER prevent_technical_manual_banese_reissue_archive_mutation BEFORE DELETE OR UPDATE ON internal_academic.technical_manual_banese_reissue_archive FOR EACH ROW EXECUTE FUNCTION internal_academic.prevent_technical_manual_banese_reissue_archive_mutation();
