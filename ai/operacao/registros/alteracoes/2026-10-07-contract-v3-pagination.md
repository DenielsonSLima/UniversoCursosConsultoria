# Paginação segura do contrato técnico

## Objetivo e aceite

Impedir transbordamento de páginas V3 no compositor oficial. Preservar conteúdo, revisão aprovada, identidade, QR, marca configurada e registros congelados. Recuperar a prévia já preparada sem criar outra emissão. Alteração somente de apresentação/paginação, sem interpretação jurídica.

## Implementação

- Paginação privada no servidor considera largura conservadora Times normal/negrito, linhas explícitas, primeira página e encerramento.
- Normalização de espaços/quebras acompanha o compositor; tokens impossíveis e rodapés incompatíveis continuam falhando explicitamente.
- Replays autorizados e leituras limitadas do histórico projetam páginas seguras a partir dos registros congelados, sem consultar o modelo atual ou alterar o ledger.
- Assinaturas e permissões das RPCs existentes permanecem iguais; funções auxiliares não são executáveis por clientes.
- Documentos V1/V2 não são repaginados. Arquivos assinados/armazenados não são modificados.

## Manifesto explícito

- `supabase/migrations/20261007142216_fix_contract_v3_line_aware_pagination.sql`
- `supabase/migrations/20261007142245_project_safe_contract_render_on_existing_reads.sql`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `supabase/tests/contract_v3_pagination.isolated.test.mjs`
- `supabase/tests/contract_v3_pagination.test-support.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-07-contract-v3-pagination.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 11 arquivos.

## Validação

- Regressão reproduz o bloqueio anterior e gera PDF com o mesmo compositor após a correção.
- Corpos instalados conferidos contra o patch, ACL preservadas e registros anteriores intactos; sem novos alertas de segurança.
- Oito grupos sintéticos cobrem limites físicos, conteúdo integral, marca/QR, idempotência, ACL, isolamento por polo, ledger intacto e documento inválido fora da página solicitada.
- Inspeção de páginas inicial/interna/assinaturas, extração de texto e recursos isolados concluída; nenhum documento real foi emitido ou assinado nos testes.
- Verificações completas de integração dependem de CI e Preview do commit publicado.
- Smoke autenticado Safari pendente por indisponibilidade de sessão; essa limitação não equivale a teste aprovado.

## Operação

Duas migrations aplicadas e conferidas; preservar a ordem indicada ao reconstruir ambientes, sem modificar migrations históricas. Conferir funções/ACL e validar leitura do conteúdo congelado. Publicação web exige CI e Preview do commit exato. Recuperação do registro já preparado ocorre pela prévia/histórico, sem necessidade de nova aprovação jurídica.
