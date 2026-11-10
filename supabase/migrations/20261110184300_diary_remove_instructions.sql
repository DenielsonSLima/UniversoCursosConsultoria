begin;

-- Change only current configurable templates; signed snapshots and artifacts
-- retain their original instructions setting and immutable evidence.
update public.documentos_templates
set conteudo = jsonb_set(conteudo, '{imprimirInstrucoes}', 'false'::jsonb, true),
  updated_at = now()
where id in ('diario_TECNICO','diario_LIVRE','diario_ESPECIALIZACAO')
  and conteudo -> 'imprimirInstrucoes' is distinct from 'false'::jsonb;

commit;
