-- Prévia canônica -> revisão completa -> mesma prévia e fingerprints.
-- Configure test.manual_cycle_enrollment_id na transação antes de executar.
-- O alvo deve estar elegível para C1 e sem recebíveis; nenhuma geração é chamada.
do $test$
declare
  v_id uuid := nullif(current_setting('test.manual_cycle_enrollment_id', true), '')::uuid;
  v_mode text;
  v_due date;
  v_preview jsonb;
  v_confirmed jsonb;
  v_revision jsonb;
begin
  if v_id is null or exists (
    select 1 from public.contas_receber where matricula_id = v_id
  ) then
    raise exception 'Informe matrícula de teste elegível e sem recebíveis.';
  end if;
  foreach v_mode in array array['BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR'] loop
    v_due := case when v_mode = 'REGISTRO_SEM_BOLETO'
      then (current_date - interval '1 month')::date
      else current_date end;
    v_preview := internal_academic.technical_manual_cycle_reviewed_preview(
      v_id, 1, v_due,
      jsonb_build_object('modoMatricula', v_mode, 'emitirMatricula', v_mode = 'BOLETO',
        'itens', '[]'::jsonb)
    )->'preview';
    select jsonb_build_object(
      'modoMatricula', v_mode, 'emitirMatricula', v_mode = 'BOLETO',
      'itens', jsonb_agg(jsonb_build_object(
        'chave', item->>'chave', 'valor', item->>'valor',
        'vencimento', item->>'vencimento',
        'descontoPontualidade', coalesce(item#>>'{detalhesBoleto,desconto,valor}', '0'),
        'jurosAtrasoPercentual', coalesce(item#>>'{detalhesBoleto,juros,percentualMes}', '0'),
        'multaAtrasoPercentual', coalesce(item#>>'{detalhesBoleto,multa,percentual}', '0')
      ))) into v_revision
    from jsonb_array_elements((v_preview->'itens') || case
      when jsonb_typeof(v_preview->'matriculaSemBoleto') = 'object'
        then jsonb_build_array(v_preview->'matriculaSemBoleto')
      else '[]'::jsonb end) item;
    v_confirmed := internal_academic.technical_manual_cycle_reviewed_preview(
      v_id, 1, v_due, v_revision
    )->'preview';
    if jsonb_array_length(v_revision->'itens') < 1
      or v_preview->>'cronogramaFingerprint' is distinct from v_confirmed->>'cronogramaFingerprint'
      or v_preview->>'regraEfetivaFingerprint' is distinct from v_confirmed->>'regraEfetivaFingerprint'
      or v_preview->>'politicaFingerprint' is distinct from v_confirmed->>'politicaFingerprint'
      or v_preview->'itens' is distinct from v_confirmed->'itens'
    then raise exception 'Confirmação divergiu da prévia no modo %.', v_mode; end if;
  end loop;
  if exists(select 1 from public.contas_receber where matricula_id = v_id) then
    raise exception 'Validação somente leitura criou recebíveis.';
  end if;
end;
$test$;
