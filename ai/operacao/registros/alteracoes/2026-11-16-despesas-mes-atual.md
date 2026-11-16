# Despesas — mês atual por vencimento, situação e ordem

Data: 16/11/2026. Mudança crítica de leitura financeira, interface e entrega.
Status: implementação pronta, backend aplicado e contratos aprovados; versão 4.8.352 em fechamento. Escopo aprovado pelo gestor após reunião de três agentes, com autorização de publicação mantida nesta tarefa.
Base de produção: 4.8.351, PR #439, commit 03c443d7e41ff3a8fb5c6d0573061fe8dff1c4cf.

## Objetivo e aceite

- Ao entrar em Fixas ou Variáveis, abrir Mês atual em tabela, sem agrupamento e por vencimento crescente.
- Situação Todas/Pagas/Em aberto/Vencidas independente do período em Mês atual e Todos. Atalhos históricos Em aberto/Vencidos fixam sua situação sem reduzir o período ao mês.
- Mês é o vencimento em America/Maceio, independentemente de lançamento ou pagamento. Datas manuais continuam filtros explícitos, sem receber automaticamente os limites mensais.
- Principal, saldo, rateio, situação e totais pertencem ao backend. Lista, cartões, grupos e PDF apresentam o mesmo conjunto e a ordem canônica.
- Parcial permanece aberto e pode estar vencido; estimativa sem fatura fica a confirmar; sem cobrança aparece no histórico com compromisso zero.
- Agrupamento continua opcional e respeita a escolha explícita ao trocar de aba. Ordem mensal dos grupos acompanha a resposta do backend.
- Nenhuma criação, baixa, estorno, alteração de principal ou mudança em lançamentos existentes.

## Conferência Serasa

Após a dúvida do gestor, consulta direta confirmou as 13 previsões já criadas no lote anterior: DESPESA_VARIAVEL, SOFTWARE variável, R$ 117,60 estimados por mês, todas pendentes e ativas, de 10/12/2026 a 10/12/2027. Mês atual de novembro não as inclui por vencimento; Todos/Em aberto incluem. Fonte paga de novembro preservada.

## Validação e riscos

- Causa reproduzida pelo código das duas abas e contrato efetivo no banco: agrupamento inicial por categoria e troca de aba impondo agrupamento. Leitura mensal já usava vencimento, com fronteira do mês em UTC no caminho antigo.
- Nova RPC de leitura reutiliza o leitor econômico autorizado e retorna um snapshot de itens, resumo e grupos. Sem filtragem financeira nem busca duplicada no cliente.
- Testes focados de serviço e React Query aprovados: uma consulta por snapshot, parâmetros independentes e invalidação existente atualizando lista/totais/grupos juntos.
- Interação independente nas duas abas reais: 9 testes aprovados. Serviço/React Query: 4; apresentação/período/grupos: 8; regressões de leitura/estimativas: 10. Lint focado, TypeScript completo e build em Node 24.22.1 aprovados.
- PGlite aprovado com leitores e ledger reais: legado pago sem evento, parcial com encargos e saldo principal, estimativas, sem cobrança, rateio autorizado, calendário de Maceió, busca/filtros, ordem estável, metadados em lotes e 5.001 registros. Snapshots comprovam leitura sem mutações.
- Migration aplicada via MCP sob 20261116091311; arquivo renomeado para o ledger, sem alterar bytes. SHA-256: 24cdc5abf3e3af38d689aa4dff8382973c830bedbc515a2483858092c92cdbd6. Fonte aplicada imutável.
- Probe remoto READ ONLY de calendário/grants aprovado. RPC real retorna as 13 previsões Serasa em Todos/Em aberto, nenhuma em Mês atual/Vencidos; total R$ 1.528,80 e hashes das fontes preservados.
- Advisor de segurança registrou o [aviso de execução autenticada de SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Exposição autenticada é intencional: identidade/polo/módulo validados antes da leitura econômica, search_path vazio, testes de autorização/derivados e revogação de anon/service_role e helper privado aprovados. Nenhuma permissão nova de escrita.
- Quatro PDFs nativos de Fixas/Variáveis × Todas decrescente/Vencidas crescente aprovados em texto, ordem, filtros, valores e recursos isolados; páginas relevantes renderizadas sem cortes novos ou sobreposição. Compositor, cabeçalho e marcas preservados.
- Safari confirmou abertura desktop em Mês atual, tabela sem agrupamento, Todas e vencimento crescente, com os novos controles e os cenários sintéticos. Continuação retornou noWindowsAvailable; smoke completo de interação e móvel permanece pendente. Testes React DOM das duas abas aprovados.
- Revisão independente do backend real: 12 cenários em ascendente/descendente coincidiram com leitor econômico e resumo canônico direto. Incluiu pagamentos legados sem evento, metadados físicos ocultos na cota e negação de anônimo/polo inválido, em transação READ ONLY. Casos positivos de parcial/vencida não existem nesse conjunto real; cobertos no PGlite sem criar lançamentos para teste.
- Revisão de integração aprovada: Outros Débitos preservado, invalidação do bundle existente, ordenação dos grupos e erro explícito sem fallback sem filtros. Lote ativo local e cupons EAD em edição paralela ficam fora desta entrega.
- Os 27 arquivos do manifesto respeitam 500 linhas. A checagem global do checkout tem 14 referências históricas ausentes fora do lote; registry remoto será construído da base main mais este registro, sem apontamentos paralelos locais.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/despesas.queryKeys.ts`
- `modules/gestor/financeiro/despesas/despesas-workspace.service.ts`
- `modules/gestor/financeiro/despesas/despesas-workspace.test.mjs`
- `modules/gestor/financeiro/despesas/hooks/useDespesasQueries.ts`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.ts`
- `modules/gestor/financeiro/despesas/components/despesa-grouping.model.test.ts`
- `modules/gestor/financeiro/despesas/components/DespesaListWorkspace.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaPeriodControls.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-periodo-apresentacao.ts`
- `modules/gestor/financeiro/despesas/components/despesa-periodo-apresentacao.test.ts`
- `modules/gestor/financeiro/despesas/components/despesas-workspace.qa-fixtures.mjs`
- `modules/gestor/financeiro/despesas/components/despesas-workspace.interaction.test.mjs`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/useDespesasFixasReport.tsx`
- `modules/gestor/financeiro/despesas/hooks/useDespesasReport.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `supabase/migrations/20261116091311_expense_workspace.sql`
- `supabase/tests/expense_workspace.fixture.sql`
- `supabase/tests/expense_workspace.setup.mjs`
- `supabase/tests/expense_workspace.isolated.test.mjs`
- `supabase/tests/expense_workspace.rollback.sql`
- `.github/workflows/despesas-estimadas.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-11-16-despesas-mes-atual.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 27 arquivos.
