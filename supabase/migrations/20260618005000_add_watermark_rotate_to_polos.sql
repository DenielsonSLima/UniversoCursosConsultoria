-- Migração: Adição de coluna watermark_rotate para controle de rotação da marca d'água
ALTER TABLE public.polos ADD COLUMN IF NOT EXISTS watermark_rotate BOOLEAN DEFAULT true;
