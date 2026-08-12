# Alteração — Financeiro operacional 4.2.0-beta.2

- Lote: `2026-08-11-financeiro-operacional-4-2-0-beta-2`
- Estado no fechamento local: `PUBLICACAO_EM_ANDAMENTO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- Cursos livres e especializações passam a usar plano financeiro único, com quantidade variável de parcelas, snapshot imutável, autorização por escopo e matrícula idempotente.
- Contas a Pagar passa a preservar dados de lançamento e comprovante vetorial, com edição, cancelamento e estorno auditáveis.
- Caixa expõe posições operacional, líquida e total; empréstimos recebem liquidação, ajustes, exportação paisagem e separação do crédito em relação ao resultado operacional.
- A Central de Relatórios recebe extrato, entradas, saídas, receitas e despesas pelo contrato canônico de movimentação financeira.

## Banco e segurança

- Cinco migrations locais foram renomeadas para os IDs já aplicados no projeto remoto; outras cinco já coincidiam com o histórico remoto e não serão reaplicadas.
- As migrations novas foram aplicadas pelo MCP Supabase com os IDs remotos `20260812005933` (plano único), `20260812010242` (relatórios) e `20260812010257` (endurecimento de RPCs legadas de empréstimos); as fontes locais foram reconciliadas com esse histórico.
- A migration de relatórios preserva `outros-creditos` na policy `finance_realtime_events_select`, evitando regressão de acesso Realtime.
- O endurecimento fixa `search_path` vazio e reafirma `EXECUTE` apenas para `service_role` nas duas RPCs legadas.
- O primeiro smoke real revelou que o corpo aplicado do relatório acessava `conta.ativa` sem expor o alias. A migration aditiva `20260812010814_fix_financial_report_account_active_alias` recria somente a função com `cb.ativo AS ativa`, reafirma grants/comentário e foi aplicada por MCP; não reescreve migration histórica já aplicada.

## Validações

- `npm run test:caixa-report`: 42/42.
- Contratos financeiro, patrimônio, relatórios e Gestão: 25/25; Contrato/PDF: 50/50; Contas a Pagar: 4/4; migrations/contratos Supabase focados: 44/44; Edge Functions Banese/EAD: 32/32.
- `tsc --noEmit`, `npm run build` e `git diff --check` aprovados.
- Contratos de plano único, relatórios, alias corretivo e hardening de empréstimos: 20/20; `npm run lint` aprovado.
- O smoke remoto de `get_relatorio_movimentacao_financeira_secure(..., 'EXTRATO_CONTA', ...)` com `service_role` retornou o payload canônico dentro de rollback, sem criar dados.

## Riscos e publicação

- A PR [#66](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/66) recebeu autorização explícita para promoção. O commit corretivo com fontes reconciliadas, teste do alias e registro operacional ainda seguirá por CI/Preview antes do merge em `main`.
- A cobertura autenticada de criação do plano único não é executada neste fechamento porque exigiria fabricar turma, matrícula ou cobrança em Produção. A checagem de contrato e o smoke sem escrita do relatório permanecem aprovados.
