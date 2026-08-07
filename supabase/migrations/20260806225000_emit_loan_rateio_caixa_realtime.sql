-- Cada rateio afeta o Caixa do polo e o consolidado. Mantemos o evento
-- escopado para invalidar somente os caches necessários no cliente.

DROP TRIGGER IF EXISTS emprestimo_parcela_rateios_emit_caixa_event
  ON public.emprestimo_parcela_rateios;

CREATE TRIGGER emprestimo_parcela_rateios_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.emprestimo_parcela_rateios
FOR EACH ROW
EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');

COMMENT ON TRIGGER emprestimo_parcela_rateios_emit_caixa_event
  ON public.emprestimo_parcela_rateios IS
  'Invalida o Caixa do polo rateado e o consolidado sem varrer os demais polos.';
