# Lote ativo

Estado: `PUBLICAÇÃO CONCLUÍDA — PR #108 MERGEADO`

## Lote: 2026-09-01-gate-regressao-bolepix-banese

- Pedido: conferir as últimas alterações e atualizar o projeto no GitHub e em
  produção.
- Autorização: GitHub e produção explícitas pelo usuário em 01/09/2026.
- Risco: publicação crítica, porém sem alteração funcional de runtime, banco,
  cobrança, Edge Function ou PDF; versão 4.8.21 exigida pelo gate.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-09-01-gate-regressao-bolepix-banese.md`.

### Contrato do lote

1. O fixture de emissão confirma a intenção durável antes de qualquer POST.
2. O CI executa os contratos do adapter BolePix e a guarda da recuperação dos
   13 recebíveis auditados.
3. Dados de importação, artefatos de planilha, migrations sem lote e lockfile
   gerado permanecem fora da publicação.
4. O lote não faz operação Supabase nem altera o fluxo Técnico ou EAD.
5. A versão 4.8.21 registra somente o reforço de testes e CI.

### Aceite para encerramento

- 71 testes focados Banese aprovados no workspace, no PR e no `push` de `main`.
- Manifesto, teto de 500 linhas, versão 4.8.21 e build aprovados.
- PR #108 integrado por squash no commit `6649a14` e publicado em produção
  pela Vercel, sem mudança funcional do fluxo financeiro.
- Nenhuma migration, Edge Function ou operação Supabase executada neste lote.
