-- Ledger remoto: 20260728051617.
-- O validador público usa exclusivamente a RPC validar_documento_por_codigo.
-- Registros validation_* antigos permanecem armazenados para auditoria, mas
-- deixam de ser legíveis diretamente pelo papel anon.

alter table public.documentos_templates enable row level security;

drop policy if exists "documentos_templates_public_validation_select"
  on public.documentos_templates;

-- SELECT em nível de tabela precisa permanecer concedido ao papel anon para o
-- ticker público. A RLS abaixo limita esse acesso ao único registro necessário.
drop policy if exists "documentos_templates_public_site_ticker_select"
  on public.documentos_templates;

create policy "documentos_templates_public_site_ticker_select"
  on public.documentos_templates
  for select
  to anon
  using (id = 'site_publico_ticker_config');

comment on policy "documentos_templates_public_site_ticker_select"
  on public.documentos_templates is
  'Permite ao site público ler somente a configuração do ticker; validações documentais são expostas exclusivamente pela RPC canônica.';

-- Defesa para ambientes que tenham recebido uma versão intermediária da
-- compatibilidade legada. Somente registros canônicos comprovados permanecem
-- consultáveis publicamente.
drop function if exists public.validar_carteirinha_legada_por_codigo(text);
