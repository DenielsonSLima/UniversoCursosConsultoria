CREATE OR REPLACE FUNCTION internal_academic.technical_manual_receivable_issuance_fingerprint(p_receivable contas_receber)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        case
          when coalesce(
            (p_receivable.regra_financeira_tecnica_snapshot
              ->> 'versao')::integer,
            1
          ) >= 2
          then jsonb_build_object(
            'versao', 2,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento,
            'formaPagamento', p_receivable.forma_pagamento,
            'gatewayMetodo', p_receivable.gateway_payment_method,
            'snapshot', p_receivable.regra_financeira_tecnica_snapshot
          )
          else jsonb_build_object(
            'versao', 1,
            'receivableId', p_receivable.id,
            'matriculaId', p_receivable.matricula_id,
            'turmaId', p_receivable.turma_id,
            'poloId', p_receivable.polo_id,
            'clienteId', p_receivable.cliente_id,
            'tipo', p_receivable.tipo_lancamento,
            'parcelaNumero', p_receivable.parcela_numero,
            'origem', p_receivable.origem_cronograma_id,
            'descricao', p_receivable.descricao,
            'valor', pg_catalog.round(p_receivable.valor::numeric, 2),
            'vencimento', p_receivable.data_vencimento
          )
        end::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$
