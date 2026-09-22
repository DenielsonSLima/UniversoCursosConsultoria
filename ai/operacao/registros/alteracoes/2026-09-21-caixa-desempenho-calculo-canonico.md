# Caixa: desempenho e cálculo canônico

Estado: PUBLICADO — 4.8.75, PR #167.

## Objetivo e autorização

Corrigir a lentidão ao abrir o Caixa e mudar polo/competência, conforme pedido explícito do usuário, preservando resultados financeiros e regras de acesso. O usuário liberou a sessão Safari para comparação autenticada.

## Critérios de aceite

- Filtros mensais aplicados antes de classificações desnecessárias; posições bancárias e evidências reaproveitadas.
- JSON financeiro equivalente; campo de previstas a vencer calculado no SQL.
- Polo/competência coerentes, cancelamento de requests obsoletos e filtros visíveis durante carregamento.
- Sem valores zero para representar erro ou dado indisponível.
- Testes financeiros/autorização, reprodução e smoke autenticado, CI e Preview antes da publicação autorizada.

## Manifesto explícito

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/caixa.service.ts`
- `modules/gestor/caixa/caixa-request-orchestration.test.tsx`
- `modules/gestor/caixa/caixa-patrimonio-resumo.test.ts`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/gestor.page.tsx`
- `modules/gestor/hooks/useGestorPoloTransition.tsx`
- `modules/gestor/hooks/useGestorPolos.ts`
- `modules/gestor/hooks/useGestorSearch.tsx`
- `scripts/test-caixa-report.mjs`
- `supabase/migrations/20260922013628_optimize_caixa_monthly_core.sql`
- `supabase/migrations/20260922013637_reuse_caixa_monthly_evidence.sql`
- `supabase/tests/caixa_monthly_optimization.fixture.sql`
- `supabase/tests/caixa_monthly_optimization.isolated.test.mjs`
- `supabase/tests/caixa_monthly_optimization.readonly.sql`
- `supabase/migrations/20260922013646_caixa_linha_corte_previstas_a_vencer.sql`
- `supabase/tests/caixa_linha_corte_previstas.contract.test.mjs`
- `modules/gestor/caixa/caixa-linha-corte.service.ts`
- `modules/gestor/caixa/caixa-linha-corte.test.ts`
- `modules/gestor/caixa/components/CaixaLinhaCorteCard.tsx`
- `modules/gestor/caixa/components/CaixaLinhaCorteCard.test.tsx`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-21-caixa-desempenho-calculo-canonico.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 26 arquivos.

## Validação

- Reprodução autenticada na versão anterior confirmou bloqueio integral do corpo na mudança de mês e polo.
- Testes SQL isolados compararam as definições reais antigas e novas, com dependências sintéticas locais: 48 respostas JSON equivalentes e redução de chamadas repetidas.
- Linha de corte aditiva preserva precisão, histórico, autorização e rejeita drift.
- Testes focados de transporte, cancelamento, escopo, renderização, acesso e revisão independente aprovados.
- Medidas e valores financeiros privados não são publicados neste repositório.
- Migrations aplicadas pelo MCP com versões 20260922013628, 20260922013637 e 20260922013646; hashes e grants conferidos.
- Smoke autenticado após o SQL e na interface publicada confirmou resultados equivalentes na Matriz e em Aquidabã, preservando a competência escolhida.
- Build e limite de linhas aprovados; suíte Caixa 82/82 e acesso do gestor 30/30.
- PR #167 integrado após autorização explícita; árvore publicada idêntica à validada. CI do main e deploy Vercel concluídos com sucesso.
- Safari autenticado confirmou a versão 4.8.75, o mês atual e anterior, troca de polo, posição total e linha de corte. A inspeção visual do fluxo exercitado não identificou regressão.

## Limitações

- A grade de rede do Safari não forneceu durações confiáveis nesta medição; não se declara ganho percentual de latência.
- As consultas ainda precisam de dados históricos para saldos e indicadores; nenhum histórico financeiro é eliminado.
- Retenção de logs em 90 dias é planejamento separado e não integra esta correção.
