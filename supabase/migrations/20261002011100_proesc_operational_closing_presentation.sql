BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- Presentation-only closure at the exact day before an authorized opening.
-- Keep historical movements intact and expose their excluded contribution in
-- the same authorized snapshot. No other account, date or financial fact changes.
DO $closing$
DECLARE
  v_ddl text := pg_get_functiondef('public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure);
  v_before text[];
  v_after text[];
  v_index integer;
  v_metadata jsonb;
BEGIN
  SELECT to_jsonb(proc)-'prosrc' INTO v_metadata FROM pg_proc proc
  WHERE proc.oid='public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure;
  v_before:=ARRAY[
    '  v_saldo_caixa_registrado numeric := 0;',
    $old_sum$  select coalesce(sum(
    case
      when p_polo_id is null or movimento.polo_movimento_id = p_polo_id
        then movimento.entrada - movimento.saida
      else 0
    end
  ), 0)
  into v_saldo_caixa_registrado
  from movimentos movimento;$old_sum$,
    E'    )\n  );\nend;',
    $old_note$'observacao', 'Posição total registrada = saldo de caixa registrado mais patrimônio a custo menos empréstimos a pagar no corte. Preserva o histórico; desde a abertura operacional autorizada, o saldo do respectivo polo considera somente movimentos a partir desse marco. Controle Proesc não representa saldo bancário disponível. Não é patrimônio líquido contábil e não inclui contas a receber ou pagar, tributos, depreciação ou valor de mercado.'$old_note$
  ];
  v_after:=ARRAY[
    E'  v_saldo_caixa_registrado numeric := 0;\n  v_saldo_caixa_historico numeric := 0;\n  v_fechamento_implantacao jsonb;',
    $new_sum$  select coalesce(sum(
    case
      when p_polo_id is null or movimento.polo_movimento_id = p_polo_id
        then movimento.entrada - movimento.saida
      else 0
    end
  ), 0), coalesce(sum(
    case
      when (p_polo_id is null or movimento.polo_movimento_id = p_polo_id)
        and not exists (
          select 1 from internal_contas.proesc_operational_openings opening
          where opening.account_id=movimento.conta_id
            and opening.polo_id=movimento.polo_movimento_id
            and opening.account_id=any(v_contas_controle_ids)
            and opening.polo_id=any(v_allowed_polo_ids)
            and opening.opening_date=v_data_corte+1
        ) then movimento.entrada - movimento.saida
      else 0
    end
  ), 0)
  into v_saldo_caixa_historico,v_saldo_caixa_registrado
  from movimentos movimento;

  if exists (
    select 1 from internal_contas.proesc_operational_openings opening
    where opening.account_id=any(v_contas_controle_ids)
      and opening.polo_id=any(v_allowed_polo_ids)
      and (p_polo_id is null or opening.polo_id=p_polo_id)
      and opening.opening_date=v_data_corte+1
  ) then
    v_fechamento_implantacao:=jsonb_build_object(
      'data_encerramento',to_char(v_data_corte,'YYYY-MM-DD'),
      'data_abertura',to_char(v_data_corte+1,'YYYY-MM-DD'),
      'saldo_historico_controle_proesc',round(v_saldo_caixa_historico-v_saldo_caixa_registrado,2)::text,
      'ajuste_encerramento_operacional',round(v_saldo_caixa_registrado-v_saldo_caixa_historico,2)::text,
      'saldo_encerramento_proesc','0.00',
      'saldo_abertura_proesc','0.00'
    );
  end if;$new_sum$,
    $new_result$    ) || case when v_fechamento_implantacao is not null
      then jsonb_build_object('fechamento_implantacao',v_fechamento_implantacao)
      else '{}'::jsonb end
  );
end;$new_result$,
    $new_note$'observacao', case when v_fechamento_implantacao is not null
        then 'Encerramento operacional de implantação do Controle Proesc; o histórico permanece preservado e separado. '
        else '' end || 'Posição total registrada = saldo de caixa registrado mais patrimônio a custo menos empréstimos a pagar no corte. Preserva o histórico; desde a abertura operacional autorizada, o saldo do respectivo polo considera somente movimentos a partir desse marco. Controle Proesc não representa saldo bancário disponível. Não é patrimônio líquido contábil e não inclui contas a receber ou pagar, tributos, depreciação ou valor de mercado.'$new_note$
  ];
  FOR v_index IN 1..cardinality(v_before) LOOP
    IF (length(v_ddl)-length(replace(v_ddl,v_before[v_index],'')))/length(v_before[v_index])<>1 THEN
      RAISE EXCEPTION 'Unexpected Proesc closing presentation anchor %',v_index;
    END IF;
    v_ddl:=replace(v_ddl,v_before[v_index],v_after[v_index]);
  END LOOP;
  -- CREATE OR REPLACE retains owner, identity, ACL, SECURITY DEFINER and all
  -- authorization / insufficient-history guards in the unchanged function.
  EXECUTE v_ddl;
  IF EXISTS(SELECT 1 FROM pg_proc proc
    WHERE proc.oid='public.get_caixa_posicao_total_resumo_secure(uuid,date)'::regprocedure
      AND to_jsonb(proc)-'prosrc' IS DISTINCT FROM v_metadata) THEN
    RAISE EXCEPTION 'Proesc closing patch changed function metadata outside its body';
  END IF;
END;
$closing$;

COMMIT;
