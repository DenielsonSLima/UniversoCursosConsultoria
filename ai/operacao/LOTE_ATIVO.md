# Lote ativo

Estado: `PUBLICADO_GITHUB_PR_83_AGUARDANDO_PRODUCAO`

## Lote: 2026-08-23-sincronizacao-completa-4-7-2

- Pedido: verificar completamente todas as alterações válidas do workspace e atualizar o sistema no GitHub.
- Base remota: `main` no commit `0fb2ae07d0dbf4f4443fe09bf34ba8283d9600b3`, árvore `7667d0304dcec269dd44d5c8c2aa6ebfc26bc1d0`.
- Registro: `ai/operacao/registros/alteracoes/2026-08-23-sincronizacao-completa-4-7-2.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-23-sincronizacao-completa-4-7-2.md`.
- Versão: `4.7.2` estável.
- Supabase principal: hotfix de escopo de Parceiros aplicado via MCP sob a versão remota `20260823135522`; nenhum dado operacional ou cobrança foi criado.
- GitHub: branch `release/sincronizacao-completa-4-7-2`, PR `#83`, um commit atômico contra a base auditada.
- Produção: merge na `main` e Vercel Produção não executados sem autorização explícita.

### Critérios de aceite

1. O snapshot deve conter todas as alterações válidas e somente os caminhos do manifesto. `ATENDIDO_LOCALMENTE`.
2. Migrations aplicadas não podem ser alteradas nem excluídas; fonte v5 supersedida fica fora. `ATENDIDO_LOCALMENTE`.
3. Logout automático preserva outros dispositivos, logout voluntário revoga globalmente e falhas de rede não reidratam a sessão. `ATENDIDO_LOCALMENTE`.
4. Seletores de perfil/polo e primeiro acesso preservam contexto, limpam sessão local e não deixam navegação pendurada na rede. `ATENDIDO_LOCALMENTE`.
5. Dashboard oferece Responsável pelo fluxo canônico existente. `ATENDIDO_LOCALMENTE`.
6. Grade técnica mantém rótulos associados e horários coerentes, com arquivos abaixo de 500 linhas. `ATENDIDO_LOCALMENTE`.
7. Reparo eleitoral preserva estruturas externas e recusa estados ambíguos. `ATENDIDO_LOCALMENTE`.
8. Contratos críticos do lote executam no quality gate do GitHub. `ATENDIDO_LOCALMENTE`.
9. Versão, changelog, histórico, limite de linhas e RAG permanecem sincronizados. `ATENDIDO_LOCALMENTE`.

### Validação

- Node focado: 43/43.
- Deno focado: 29/29.
- PDF oficial da Ficha: 19/19, texto selecionável e render A4 íntegro.
- TypeScript, ESLint global/focado, teto de 500 linhas, controle de versão, contrato operacional, RAG e build: aprovados.
- Supabase: ledger 717/717 nomes únicos; helpers de escopo fechados, ACL mínima e advisors no baseline.
- Revisões independentes: Auth, migrations/Supabase e UI/grade sem bloqueador residual.
- Smoke autenticado/visual: pendente porque nenhum navegador está conectado (`[]`).

### Limites e exclusões

1. `FinanceiroAlunosList.legacy.tsx`, as minutas binárias locais e a fonte v5 de tipografia não integram o commit.
2. As 21 migrations restauradas da `main` permanecem byte-idênticas e não aparecem no delta.
3. CI e Preview precisam ficar verdes antes de considerar a PR pronta para merge.
4. Merge/Vercel Produção exigem autorização explícita posterior.

Histórico encerrado: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
