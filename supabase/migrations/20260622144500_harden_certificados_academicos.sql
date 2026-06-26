CREATE INDEX IF NOT EXISTS certificados_academicos_curso_idx
  ON public.certificados_academicos (curso_id);

REVOKE ALL ON FUNCTION public.sincronizar_certificado_matricula() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finalizar_certificado_academico(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_certificado_academico(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;
