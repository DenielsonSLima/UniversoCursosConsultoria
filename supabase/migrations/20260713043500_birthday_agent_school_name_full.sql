UPDATE public.whatsapp_birthday_settings
SET school_name = 'Universo Cursos e Consultoria',
    updated_at = now()
WHERE id = true
  AND school_name = 'Universo Cursos';
