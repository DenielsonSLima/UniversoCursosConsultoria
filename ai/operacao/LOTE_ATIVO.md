# Lote ativo

Estado: VALIDADO — GITHUB/PREVIEW; PRODUÇÃO PENDENTE — BAIXA MANUAL APÓS REVISÃO (4.8.65)

## Lote: 2026-09-16-baixa-manual-revisao

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-16-baixa-manual-revisao.md`.

- Corrigir conflito indevido entre o contexto auditável da baixa e o snapshot financeiro.
- Preservar identidade, composição, conta, idempotência e histórico de tentativas.
- Encerrar tentativa errada somente mediante revisão delimitada e auditada; nova baixa usa nova chave.
- Três agentes solicitados: interface, backend e revisão financeira independente.
- Usuário determinou validação exclusivamente interna, sem navegador.
- GitHub autorizado. Aplicação em produção e saneamento do registro real dependem da confirmação final do procedimento concreto.
- Entrega anterior: 4.8.64 / PR 156, main `0945ca1bea60253915bdfe49d4fa1fa426f1b801`.

- Validação: 43 testes Deno, 27 cenários SQL com rollback/clones temporários, harness real de mutation, TypeScript, lint focado, build e teto de linhas aprovados.
- Ordem remota preparada: duas migrations, Edge, encerramento auditado e nova baixa pelo fluxo canônico.
