UPDATE public.whatsapp_birthday_settings
SET enabled = false,
    updated_at = now()
WHERE id = true;
