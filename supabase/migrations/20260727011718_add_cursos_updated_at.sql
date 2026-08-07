-- Registra a data real da última alteração dos cursos.
ALTER TABLE public.cursos
ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.cursos
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.cursos
ALTER COLUMN updated_at SET DEFAULT now(),
ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_cursos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cursos_touch_updated_at ON public.cursos;

CREATE TRIGGER cursos_touch_updated_at
BEFORE UPDATE ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION public.touch_cursos_updated_at();
