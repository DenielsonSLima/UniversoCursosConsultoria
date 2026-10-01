-- Append to the small canonical projection shared by authorized row/group RPCs.
-- The trancamento helper is installed by the preceding cancellation migrations.
begin;
do $projection$
declare
  v_definition text;
  v_anchor text := $anchor$'emissao_gerenciada_turma',v_managed,'emissao_ciclo_status',v_state)$anchor$;
begin
  v_definition:=pg_get_functiondef(
    'internal_academic.receivable_cycle_presentation(public.contas_receber)'::regprocedure);
  if md5(v_definition)<>'02d5770cfd9574c7c68e406b7c832c64'
    or position(v_anchor in v_definition)=0 then
    raise exception 'Receivable presentation changed; review before applying capabilities.';
  end if;
  execute replace(v_definition,v_anchor,$replacement$'emissao_gerenciada_turma',v_managed,'emissao_ciclo_status',v_state,
    'operation_capabilities',internal_academic.receivable_operation_capabilities(p_receivable),
    'banese_cancellation',internal_academic.receivable_trancamento_cancellation(p_receivable))$replacement$);
end;
$projection$;
commit;
