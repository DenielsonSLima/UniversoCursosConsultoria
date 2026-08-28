begin;

-- Estas treze identidades bancarias nao possuem prova canonica de POST; doze
-- vieram do SQL direto 172000. O CAS aborta se surgir evidencia remota.
create temporary table banese_quarantine_targets (
  id uuid primary key,
  nosso_numero text unique not null,
  barcode text not null,
  digitable_line text not null,
  issued_at timestamptz not null,
  expected_updated_at timestamptz not null
) on commit drop;
insert into pg_temp.banese_quarantine_targets values
  ('08090770-b1d0-4f43-a885-38d3e9859a78','000000198','04792187300000279903303100649000000019804760','04793303180064900000700198047607218730000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:48.107+00'),
  ('0c5bcdb3-024c-406a-a958-f87260504413','000000163','04791178200000279903303100649000000016304775','04793303180064900000700163047756117820000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:49.55+00'),
  ('0fe770f0-4bcd-4574-a827-9cf6876e6399','000000210','04799193500000279903303100649000000021004704','04793303180064900000700210047049919350000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:36:05.49+00'),
  ('1b47c345-3939-4414-89e5-6ba50fccee91','000000228','04794196500000279903303100649000000022804704','04793303180064900000700228047049419650000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:45.418+00'),
  ('2bae97e2-cf1c-4153-8da3-6bd9cd41903c','000000180','04797184300000279903303100649000000018004760','04793303180064900000700180047607718430000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:39:11.041+00'),
  ('2d5a7b98-ba37-4817-9060-7ab40b6b16d5','000000112','04798163100000279903303100649000000011204799','04793303180064900000700112047998816310000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:46.043+00'),
  ('38eae118-b430-49a1-8c14-2a99d123d85e','000000139','04793169200000279903303100649000000013904798','04793303180064900000700139047989316920000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:30:08.076+00'),
  ('425a9594-cf03-4dd2-a264-fd9ecfc8343f','000000147','04796172300000279903303100649000000014704784','04793303180064900000700147047849617230000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:33:00.008+00'),
  ('5c6e5c87-ce71-4185-80af-6c1a0b1e330f','000000201','04791190400000279903303100649000000020104713','04793303180064900000700201047131119040000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:47.455+00'),
  ('6a9ddb18-d9c7-4b3e-9ed3-c6884d1b4477','000000236','04791160000000100003303100649000000023604770','04793303180064900000700236047707116000000010000','2026-08-27 19:48:01.888813+00','2026-08-28 03:21:50.313+00'),
  ('87d5ac5d-7796-4627-b3a2-6df97efb6f29','000000155','04794175100000279903303100649000000015504770','04793303180064900000700155047707417510000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:46.785+00'),
  ('ddf366cf-a365-4a92-81d2-49499203ef32','000000171','04799181200000279903303100649000000017104788','04793303180064900000700171047889918120000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:44.69+00'),
  ('efe9d997-bf46-4580-83b4-701132d5e815','000000120','04798166100000279903303100649000000012004793','04793303180064900000700120047931816610000027990','2026-08-27 19:43:37.55227+00','2026-08-28 03:21:48.865+00');

do $quarantine$
declare
  v_count integer;
  v_distinct_count integer;
  v_monthly_count integer;
  v_reenrollment_count integer;
begin
  perform 1
  from public.contas_receber as receivable
  join pg_temp.banese_quarantine_targets as target on target.id = receivable.id
  order by receivable.id
  for update;
  get diagnostics v_count = row_count;

  select
    count(distinct receivable.gateway_boleto_nosso_numero),
    count(*) filter (
      where receivable.tipo_lancamento = 'PARCELA'
        and round(receivable.valor::numeric, 2) = 279.90
    ),
    count(*) filter (
      where receivable.tipo_lancamento = 'REMATRICULA'
        and round(receivable.valor::numeric, 2) = 100.00
    )
  into v_distinct_count, v_monthly_count, v_reenrollment_count
  from public.contas_receber as receivable
  join pg_temp.banese_quarantine_targets as target on target.id = receivable.id;

  if v_count <> 13 or v_distinct_count <> 13
    or v_monthly_count <> 12 or v_reenrollment_count <> 1
    or exists (
      select 1
      from public.contas_receber as receivable
      join pg_temp.banese_quarantine_targets as target on target.id = receivable.id
      where receivable.gateway_boleto_nosso_numero is distinct from target.nosso_numero
        or receivable.gateway_boleto_codigo_barras is distinct from target.barcode
        or receivable.gateway_boleto_linha_digitavel is distinct from target.digitable_line
        or receivable.gateway_boleto_issued_at is distinct from target.issued_at
        or receivable.updated_at is distinct from target.expected_updated_at
    )
  then
    raise exception 'O lote Banese nao corresponde aos 13 IDs/NNs/titulos auditados.';
  end if;

  if exists (
    select 1
    from public.contas_receber as receivable
    join pg_temp.banese_quarantine_targets as target on target.id = receivable.id
    where (
        receivable.gateway_provider = 'banese_card'
        and receivable.gateway_environment = 'production'
        and receivable.gateway_payment_method = 'BOLETO'
        and receivable.gateway_boleto_convenio = '15261'
        and receivable.gateway_boleto_agencia = '033'
        and receivable.gateway_submission_channel = 'API'
        and receivable.gateway_submission_status = 'API_REGISTERED'
        and receivable.gateway_cnab_file_id is null
        and (
          (
            receivable.tipo_lancamento = 'PARCELA'
            and round(receivable.valor::numeric, 2) = 279.90
            and receivable.gateway_boleto_issued_at =
              timestamptz '2026-08-27 19:43:37.55227+00'
          )
          or (
            receivable.tipo_lancamento = 'REMATRICULA'
            and round(receivable.valor::numeric, 2) = 100.00
            and receivable.gateway_boleto_issued_at =
              timestamptz '2026-08-27 19:48:01.888813+00'
          )
        )
        and receivable.status in (
          'PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'
        )
        and nullif(btrim(coalesce(receivable.gateway_payment_id, '')), '')
          is null
        and receivable.gateway_payment_link_id is null
        and receivable.gateway_invoice_url is null
        and receivable.gateway_bank_slip_url is null
        and receivable.gateway_transaction_receipt_url is null
        and receivable.gateway_creation_token is null
        and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '')
          is null
        and nullif(btrim(coalesce(
          receivable.gateway_pix_encoded_image, ''
        )), '') is null
        and coalesce(receivable.gateway_boleto_codigo_barras, '')
          ~ '^[0-9]{44}$'
        and coalesce(receivable.gateway_boleto_linha_digitavel, '')
          ~ '^[0-9]{47}$'
        and receivable.data_pagamento is null
        and receivable.valor_pago is null
        and receivable.gateway_settlement_channel is null
        and receivable.gateway_settlement_source is null
        and receivable.gateway_settlement_evidence is null
        and receivable.gateway_settlement_recorded_at is null
      ) is not true
  ) then
    raise exception 'Um dos 13 titulos Banese ganhou evidencia remota ou mudou de estado.';
  end if;

  if exists (
    select 1
    from public.payment_gateway_transactions as transaction
    join pg_temp.banese_quarantine_targets as target
      on target.id = transaction.receivable_id
  ) then
    raise exception 'Um dos 13 titulos Banese ja possui transacao; quarentena abortada.';
  end if;
end;
$quarantine$;

-- O fencing geral e imutavel em operacao normal. A remocao corretiva abaixo
-- desabilita somente seu trigger durante esta transacao, sob lock de tabela;
-- qualquer falha reverte tanto os dados quanto o estado do trigger.
alter table public.contas_receber
  disable trigger enforce_receivable_gateway_submission_fence;

do $quarantine_update$
declare
  v_updated integer;
begin
  update public.contas_receber as receivable
  set gateway_boleto_nosso_numero = null,
      gateway_boleto_codigo_barras = null,
      gateway_boleto_linha_digitavel = null,
      gateway_boleto_issued_at = null,
      gateway_submission_channel = null,
      gateway_submission_status = null,
      gateway_status = null,
      gateway_synced_at = null,
      gateway_financial_terms_confirmed_at = null,
      gateway_last_error =
        'BANESE_IDENTITY_QUARANTINED: Nosso Numero local sem prova de POST bancario.',
      updated_at = pg_catalog.clock_timestamp()
  where exists (
      select 1 from pg_temp.banese_quarantine_targets as target
      where target.id = receivable.id
        and target.nosso_numero = receivable.gateway_boleto_nosso_numero
        and target.barcode = receivable.gateway_boleto_codigo_barras
        and target.digitable_line = receivable.gateway_boleto_linha_digitavel
        and target.issued_at = receivable.gateway_boleto_issued_at
        and target.expected_updated_at = receivable.updated_at
    )
    and receivable.gateway_provider = 'banese_card'
    and receivable.gateway_environment = 'production'
    and receivable.gateway_payment_method = 'BOLETO'
    and receivable.gateway_boleto_convenio = '15261'
    and receivable.gateway_submission_channel = 'API'
    and receivable.gateway_submission_status = 'API_REGISTERED'
    and receivable.gateway_cnab_file_id is null
    and (
      (
        receivable.tipo_lancamento = 'PARCELA'
        and round(receivable.valor::numeric, 2) = 279.90
        and receivable.gateway_boleto_issued_at =
          timestamptz '2026-08-27 19:43:37.55227+00'
      )
      or (
        receivable.tipo_lancamento = 'REMATRICULA'
        and round(receivable.valor::numeric, 2) = 100.00
        and receivable.gateway_boleto_issued_at =
          timestamptz '2026-08-27 19:48:01.888813+00'
      )
    )
    and nullif(btrim(coalesce(receivable.gateway_payment_id, '')), '') is null
    and receivable.gateway_payment_link_id is null
    and receivable.gateway_invoice_url is null
    and receivable.gateway_bank_slip_url is null
    and receivable.gateway_transaction_receipt_url is null
    and receivable.gateway_creation_token is null
    and nullif(btrim(coalesce(receivable.gateway_pix_payload, '')), '') is null
    and nullif(btrim(coalesce(
      receivable.gateway_pix_encoded_image, ''
    )), '') is null
    and receivable.data_pagamento is null
    and receivable.valor_pago is null
    and receivable.gateway_settlement_channel is null
    and receivable.gateway_settlement_source is null
    and receivable.gateway_settlement_evidence is null
    and receivable.gateway_settlement_recorded_at is null
    and not exists (
      select 1
      from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = receivable.id
    );
  get diagnostics v_updated = row_count;

  if v_updated <> 13 then
    raise exception 'CAS da quarentena Banese alterou % de 13 titulos.', v_updated;
  end if;
end;
$quarantine_update$;

alter table public.contas_receber
  enable trigger enforce_receivable_gateway_submission_fence;

insert into public.banese_reconciliation_queue (
  receivable_id, environment, modality, priority, state, next_check_at,
  lease_run_id, lease_until, issued_at, last_result, last_error_class, updated_at
)
select
  receivable.id,
  'production',
  public.banese_reconciliation_resolve_modality(
    receivable.id,
    receivable.turma_id,
    receivable.matricula_id
  ),
  100,
  'DONE',
  null,
  null,
  null,
  coalesce(receivable.created_at, pg_catalog.clock_timestamp()),
  'BANK_IDENTITY_QUARANTINED',
  'BANK_TITLE_COLLISION',
  pg_catalog.clock_timestamp()
from public.contas_receber as receivable
join pg_temp.banese_quarantine_targets as target on target.id = receivable.id
on conflict (receivable_id) do update
set environment = excluded.environment,
    modality = excluded.modality,
    priority = excluded.priority,
    state = 'DONE',
    next_check_at = null,
    lease_run_id = null,
    lease_until = null,
    last_result = excluded.last_result,
    last_error_class = excluded.last_error_class,
    updated_at = excluded.updated_at;

create unique index contas_receber_banese_title_identity_unique_idx
  on public.contas_receber (
    gateway_environment,
    gateway_boleto_convenio,
    gateway_boleto_nosso_numero
  )
  where gateway_provider = 'banese_card'
    and gateway_payment_method = 'BOLETO'
    and gateway_environment is not null
    and gateway_boleto_convenio is not null
    and gateway_boleto_nosso_numero is not null;

alter function public.gerar_rematricula_apos_parcelas(uuid)
  set search_path = '';
alter function public.gerar_ciclo_financeiro_apos_pagamento()
  set search_path = '';

commit;
