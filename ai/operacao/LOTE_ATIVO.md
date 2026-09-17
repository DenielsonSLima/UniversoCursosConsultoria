# Lote ativo

Estado: BANCO CORRIGIDO — EM PUBLICAÇÃO — TIMEOUT DA CONCILIAÇÃO E LEITURAS FINANCEIRAS (4.8.66)

## Lote: 2026-09-16-timeout-conciliacao

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-16-timeout-conciliacao.md`.

- Usuário solicitou análise e correção com reunião de três agentes, mantendo a validação interna sem navegador.
- Erros reais `57014` por `statement_timeout` confirmados em Dashboard, prestação mensal do Caixa e conciliação.
- Consulta da conciliação sem período ultrapassou 15 segundos; guarda para recebimentos pagos evita avaliação de evidências de vencimento desnecessárias.
- Dashboard e Caixa responderam em reproduções internas de 284 ms e 3.361 ms; essas medições não demonstram eliminação de falhas intermitentes.
- Repetição automática após `57014` removida somente nas três consultas afetadas; outras falhas mantêm uma repetição e o erro não vira resultado zero.
- Preservar autorização, escopo, filtros, classificação, valores e contratos; nenhuma operação bancária ou alteração de recebimentos integra este lote.
- Cinco arquivos frontend, dois arquivos SQL e seis arquivos de operação/CI compõem o manifesto.
- Validação frontend: 13 testes e lint focado aprovados; revisão independente sem achados. Comparação SQL integral de pendentes (1492 registros) idêntica; 32,8s→698ms em clone com rollback.
- TypeScript, build 4.8.66, lint, 13 testes frontend, seis contratos financeiros e teto do manifesto aprovados. Fechamento operacional em andamento.
- Migration aplicada via MCP: 20260917010910. Smoke autenticado sob8s: Conciliação315ms, Dashboard125ms, Caixa2935ms; todos os filtros retornaram.
- Versão4.8.66 / revisão75 validada; GitHub/CI/Preview e publicação final em andamento.
- Entrega anterior preservada: 4.8.65 / PR157, main `f16f623910490991520dd479f0489fd4cc84d517`; registro histórico não alterado.
