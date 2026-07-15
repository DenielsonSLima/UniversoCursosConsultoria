-- Helper imutável usado apenas pelos fluxos EAD autoritativos.
ALTER FUNCTION public.ead_config_required_video_count(jsonb)
  SET search_path = '';
