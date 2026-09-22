# Lote ativo

Estado: IMPLEMENTADO — VALIDAÇÃO DE ENTREGA DO CAIXA

## Lote: 2026-09-21-caixa-desempenho-calculo-canonico

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-21-caixa-desempenho-calculo-canonico.md`.

- Usuário autorizou corrigir lentidão e cálculos do Caixa, com três agentes e validação na sessão autenticada.
- Reduzir trabalho repetido das RPCs mensais preservando saldos, escopo, histórico e autorização.
- Manter filtros visíveis e impedir consulta de competência errada ou resultado de polo anterior durante a troca.
- Receitas previstas a vencer vêm do backend; frontend somente formata o resultado canônico.
- Reprodução autenticada confirmou bloqueio de toda a tela ao mudar a competência na versão anterior.
- Validação inclui equivalência SQL isolada, testes de transporte/escopo, smoke autenticado e publicação MCP restrita ao manifesto.
- Arquivamento Proesc já concluído em lote anterior. Nova análise de retenção de logs é planejamento separado; nenhum expurgo novo integra este lote.

- Três migrations aplicadas, hashes e grants conferidos. Smoke autenticado do SQL preservou resultados da Matriz no mês atual e anterior.
- Testes isolados e suites focadas aprovados, com revisão independente. Entrega passa por CI/Preview e conferência final na interface publicada.
