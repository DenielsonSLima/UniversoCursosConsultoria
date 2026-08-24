# Lote ativo

Estado: `EM_REVISAO_GITHUB`

## Lote: 2026-08-24-card-email-validado-gestor

- Pedido: corrigir o ícone pendente no card do aluno quando o e-mail já foi validado administrativamente e atualizar o projeto no GitHub.
- Causa confirmada: o backend devolvia separadamente a confirmação real do Auth e a validação administrativa, mas a listagem descartava `emailValidatedByManager`; o card recebia apenas o `status` pendente do Auth.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-card-email-validado-gestor.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-card-email-validado-gestor.md`.
- Próxima versão registrada na branch: `4.7.7`; a Produção permanece em `4.7.6` até eventual merge explicitamente autorizado.

### Critérios de aceite

1. E-mail confirmado no Auth continua exibindo check verde com o rótulo `E-mail confirmado`. `ATENDIDO`.
2. E-mail pendente no Auth, mas validado pelo gestor, exibe check verde com o rótulo `E-mail validado pelo gestor`. `ATENDIDO`.
3. O card não mascara nem altera o estado real do Supabase Auth. `ATENDIDO`.
4. Nenhuma migration, dado, Auth user, RLS ou Edge Function é alterado. `ATENDIDO`.
5. Teste focado, lint, limite de linhas, revisão independente e smoke autenticado devem aprovar antes da publicação. `ATENDIDO`.
6. CI e Preview do GitHub devem concluir antes de qualquer merge futuro. `ATENDIDO`.

### Evidências e validação

- Consulta remota somente leitura confirmou o caso real: validação administrativa presente e confirmação do Auth ainda ausente.
- Node focado: `7/7` testes aprovados.
- ESLint focado e `git diff --check`: aprovados.
- Smoke visual autenticado no localhost: check verde exibido no card do aluno afetado.
- Revisão independente contra a `main` remota sem findings `Critical` ou `Important`; único apontamento `Minor` foi o teste contratual por fonte, compensado pelo smoke visual real.
- Controle de versão corrigido na branch com o avanço proposto para `4.7.7` e a entrada correspondente no changelog.
- GitHub Actions `Controle de versão` e `Qualidade do produto`: aprovados no commit final da PR.
- Preview Vercel da PR: `Ready`.

### Publicação GitHub

1. Branch e PR dedicadas somente a este manifesto.
2. Merge e Vercel Production não integram a autorização atual.
3. CI e Preview concluíram com sucesso; a PR permanece aberta aguardando autorização explícita para eventual merge.

### Limites e exclusões

1. Nenhuma operação remota Supabase integra este lote.
2. O registro da próxima versão na branch não autoriza merge, promoção nem publicação em Produção.
3. Alterações paralelas do workspace não integram a branch nem o commit remoto.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
