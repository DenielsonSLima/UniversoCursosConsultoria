-- Pure calculator: preserve implementation, privileges and financial results.
ALTER FUNCTION public.build_gestao_financial_schedule(
  date, numeric, numeric, numeric, integer, integer
) SET search_path TO '';
