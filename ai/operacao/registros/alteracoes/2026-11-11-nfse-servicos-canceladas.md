# NFS-e: separar canceladas da lista de Serviços

## Pedido e causa

As imagens mostram duas NFS-e canceladas repetidas em Serviços, embora exista a
aba Canceladas. A consulta de Serviços preservava todos os estados fiscais e
filtrava apenas exclusões lógicas, sem usar a partição de cancelamento confirmado.

## Correção e aceite

- A RPC de Serviços exclui da projeção somente origens com cancelamento comprovado
  pela mesma view privada usada pela aba Canceladas: estado CANCELLED, resultado
  CONFIRMED, evento 101101 e XML do evento presente.
- Partição ocorre no servidor antes dos filtros, paginação, contagem e soma.
- Chamadas antigas continuam cobertas pelo wrapper existente.
- Cancelamento pendente, rejeitado, incompleto ou outro evento não some da lista.
- Nenhuma alteração em serviços, operações, XML, eventos, contas ou marcas de
  exclusão. A aba Canceladas e a consulta dos documentos permanecem intactas.

## Validação

- Regressão reproduzida: total 9 em vez de 8 antes do patch.
- 10 checks SQL da lista/exclusão e 6 da partição Emitidas/Canceladas aprovados.
- Interação diária aprovada, com serviço em processamento e documento cancelado
  consultável na aba própria, sem segundo envio.
- ESLint focado e teto de 500 linhas verificados. CI completa, build e Preview
  devem passar no candidato. RPC real e hashes serão conferidos antes/depois.
- Smoke Safari autenticado pendente: Mac offline. Não substituído por outro
  navegador nem apresentado como executado.

## Manifesto explícito

Total: 8 arquivos

- `supabase/migrations/20261111114000_nfse_services_cancelled_partition.sql`
- `supabase/tests/nfse_partner_service_removal.isolated.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-servicos-canceladas.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
