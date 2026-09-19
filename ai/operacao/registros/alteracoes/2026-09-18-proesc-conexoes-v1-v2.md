# Conexões Proesc V1 e V2 separadas

Estado: BANCO APLICADO E CREDENCIAIS ARMAZENADAS — EM PUBLICAÇÃO 4.8.69

## Pedido e aceite

O usuário pediu manter a API V1 e criar uma conexão V2 independente, com módulos que escolham a versão conforme a operação. Forneceu token V2 e liberação WAF inicialmente para teste; depois autorizou explicitamente aplicar, armazenar e publicar. Em seguida confirmou foco V2 em dados/pessoas, mantendo parcelas pela V1.

- V1 permanece na conexão original usada por conciliação, legado e workers.
- V2 possui armazenamento próprio em Vault, incluindo liberação WAF opcional.
- Gestor global com Configurações pode salvar, remover e testar cada conexão.
- Legado/configuração contábil usam V1; pessoas da V2 usam cliente próprio. Sem fallback após falha.
- Nenhum token real, WAF real, dado pessoal ou resposta bruta integra o lote.

## Reprodução e decisão

- Chave V1 enviada em Bearer à V2 retornou HTTP401 com e sem WAF. Não comprova defeito da chave V1.
- Token V2 fornecido para teste, com WAF do suporte: GET people HTTP200 e primeira página de 20 registros; envelope observado com data, links e meta.
- Essa página não apresentou campos eleitorais. Não é prova de cobertura de todas as pessoas nem autoriza inferir valores.
- GET invoices, setembro/2026, excedeu 25 segundos. Acesso a parcelas permanece não confirmado nessa leitura.
- Artigo oficial enviado descreve Entidade → Integrações → opções avançadas → copiar link; não substitui o contrato Bearer específico V2.

## Implementação

- Ações versionadas passam por autenticação existente; RPC reforça service_role, gestor global e módulo Configurações.
- Tabela privada V2 com RLS e sem grants diretos; getter de credenciais somente por RPC de serviço. Status retorna apenas metadados.
- Salvar V2 sem novo WAF preserva o existente; remover V2 elimina somente os segredos V2 referenciados.
- Chave V1 recusada na conexão V2 e Bearer V2 recusado na V1, inclusive nas ações antigas de gravação/teste.
- Comparação de revisão após leitura invalida resposta se a conexão mudar. GETs em hosts fixos, sem redirecionamentos.
- Parser V2 aceita paginação em meta ou na raiz e rejeita conflito. Links externos não determinam URL seguinte.
- Migration 20260919002500 aplicada via MCP; teste SQL com rollback aprovado e credenciais V2 armazenadas via RPC. V1 comparada antes/depois e preservada. Nenhum cron ou aluno alterado.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescConnectionCard.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `modules/gestor/configuracoes/proesc/proesc.service.test.mjs`
- `supabase/functions/proesc-api/connection-contract.ts`
- `supabase/functions/proesc-api/connections.ts`
- `supabase/functions/proesc-api/operations.ts`
- `supabase/functions/proesc-api/v2-client.ts`
- `supabase/functions/proesc-api/versioned-connections.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/contract.ts`
- `supabase/functions/proesc-api/test-token.ts`
- `supabase/functions/proesc-api/test-token.test.ts`
- `supabase/functions/proesc-api/test-token-v1.test.ts`
- `supabase/migrations/20260919002500_proesc_separate_v2_connection.sql`
- `supabase/tests/proesc_separate_connections.sql`
- `ai/operacao/registros/alteracoes/2026-09-18-proesc-conexoes-v1-v2.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-01-versoes-4-8-23-a-4-8-26.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 24 arquivos.

## Validação

- 37 testes Deno aprovados: autenticação, credenciais cruzadas, versões, WAF ausente/presente, revisão, paginação, falhas sem fallback e regressões do handler.
- Quatro testes do serviço frontend aprovados; smoke Safari com transporte sintético validou salvar/testar/remover V2 preservando V1, limpeza de inputs e histórico.
- Revisão independente encontrou WAF nulo vindo do banco; corrigido e coberto por teste.
- TypeScript, lint focado, build completo e teto de linhas aprovados. Build mantém aviso de chunks grandes.
- Ledger remoto confirmou 20260919002500. Teste SQL transacional com rollback aprovado para permissões, rejeição de token cruzado, WAF ausente/preservado e integridade V1.
- RPC real executada: V1 e V2 configuradas, WAF somente V2; status sem segredos. Probe interno V2 consulta somente people e mantém a guarda do worker.

## Entrega

- Edge proesc-api v17 ativa; probe interno V2 executado pelo servidor às 00:28:21UTC de 19/09 retornou HTTP200, ok=true e acesso confirmado a people. Sem consulta de parcelas nesse teste.

Publicação autorizada: Edge e frontend pelo manifesto 4.8.69/revisão78. CI, Preview e confirmação final serão registrados no PR. O teste de acesso V2 cobre people; invoices não é consultado por esse teste, conforme escopo corrigido pelo usuário.

RAG reindexado uma vez no fechamento local, sem dados pessoais ou credenciais.

O lote anterior de referência temporal da conciliação permanece registrado em `2026-09-16-conciliacao-horario-consulta.md`; seu estado de publicação não foi alterado por este trabalho.
