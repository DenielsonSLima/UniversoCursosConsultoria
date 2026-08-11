# Alteração — Financeiro operacional 4.2.0-beta.2

- Lote: `2026-08-11-financeiro-operacional-4-2-0-beta-2`
- Estado no fechamento local: `PRONTO_PARA_PUBLICACAO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- Cursos livres e especializações passam a usar plano financeiro único, com quantidade variável de parcelas, snapshot imutável, autorização por escopo e matrícula idempotente.
- Contas a Pagar passa a preservar dados de lançamento e comprovante vetorial, com edição, cancelamento e estorno auditáveis.
- Caixa expõe posições operacional, líquida e total; empréstimos recebem liquidação, ajustes, exportação paisagem e separação do crédito em relação ao resultado operacional.
- A Central de Relatórios recebe extrato, entradas, saídas, receitas e despesas pelo contrato canônico de movimentação financeira.

## Banco e segurança

- Cinco migrations locais foram renomeadas para os IDs já aplicados no projeto remoto; outras cinco já coincidiam com o histórico remoto e não serão reaplicadas.
- As migrations realmente novas receberam IDs posteriores ao histórico remoto: plano único (`20260811123905`), relatórios (`20260811123906`) e endurecimento de RPCs legadas de empréstimos (`20260811123907`).
- A migration de relatórios preserva `outros-creditos` na policy `finance_realtime_events_select`, evitando regressão de acesso Realtime.
- O endurecimento fixa `search_path` vazio e reafirma `EXECUTE` apenas para `service_role` nas duas RPCs legadas. Nenhuma dessas três migrations foi aplicada neste fechamento.

## Validações

- `npm run test:caixa-report`: 42/42.
- Contratos financeiro, patrimônio, relatórios e Gestão: 25/25; Contrato/PDF: 50/50; Contas a Pagar: 4/4; migrations/contratos Supabase focados: 44/44; Edge Functions Banese/EAD: 32/32.
- `tsc --noEmit`, `npm run build` e `git diff --check` aprovados.

## Riscos e publicação

- A PR anterior em `main` teve Preview Vercel limitada pela cota de builds; este lote aguarda sua própria Preview e smoke autenticado.
- Produção e aplicação das três migrations permanecem fora desta publicação GitHub até revisão da PR e autorização explícita para o ambiente produtivo.
