-- Migration: Add polo_ids UUID[] column to public.parceiros for multi-polo support
ALTER TABLE public.parceiros ADD COLUMN IF NOT EXISTS polo_ids UUID[] DEFAULT '{}';
