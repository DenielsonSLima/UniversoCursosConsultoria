-- Índice de suporte à FK por polo e remoção do índice redundante: `codigo`
-- já possui índice único criado pela constraint da tabela.

create index if not exists documentos_validacao_preceptores_polo_idx
  on public.documentos_validacao_preceptores (polo_id);

drop index if exists public.documentos_validacao_preceptores_codigo_idx;
