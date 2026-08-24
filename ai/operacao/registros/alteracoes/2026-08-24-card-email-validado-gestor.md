# Card de e-mail validado pelo gestor — 2026-08-24

Estado: `EM_REVISAO_GITHUB`

## Diagnóstico

O cadastro detalhado mostrava corretamente que o e-mail do aluno havia sido validado pelo gestor, mas o card da listagem continuava exibindo o ícone laranja de confirmação pendente. A consulta canônica já devolvia dois sinais distintos: `emailConfirmed`, referente ao Supabase Auth, e `emailValidatedByManager`, referente à validação administrativa. A camada de listagem descartava o segundo sinal antes de montar o card.

## Correção

- `parceirosService.getAll` preserva `emailValidatedByManager` no parceiro enriquecido.
- `AlunoCard` encaminha o sinal administrativo ao componente do ícone.
- `EmailConfirmationStatus` mantém a confirmação real do Auth distinta e também apresenta check verde para o canal validado pelo gestor, com rótulo acessível específico.
- Nenhum estado de Auth, dado, migration, RLS ou Edge Function foi alterado.

## Validação

- Consulta Supabase somente leitura confirmou o caso real: `email_validado_gestor_em` presente e `email_confirmed_at` ainda ausente.
- Node focado: `7/7` testes aprovados.
- TypeScript, ESLint focado, `git diff --check`, contrato operacional/RAG e build Vite: aprovados.
- Smoke autenticado no Safari/local: o card afetado exibiu o check verde.
- Revisão independente contra a `main` remota: sem findings `Critical` ou `Important`; `Ready to merge`.
- Todos os arquivos manuais do manifesto permanecem abaixo de 500 linhas.
- Controle de versão local aprovado para `4.7.7`, com changelog correspondente; a Produção continua em `4.7.6` enquanto não houver merge autorizado.
- GitHub Actions `Controle de versão` e `Qualidade do produto`: aprovados; Preview Vercel: `Ready`.

## Publicação

- Escopo autorizado: GitHub e Preview da PR.
- CI e Preview concluíram com sucesso; a PR permanece aberta para revisão e eventual autorização de merge.
- O registro da próxima versão na branch atende ao gate do CI; merge, promoção e Produção não foram solicitados e permanecem fora do lote.

## Manifesto explícito

Total: 10 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-08-24-card-email-validado-gestor.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/components/cards/EmailConfirmationStatus.tsx`
- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`

## Limites

- Nenhuma alteração remota Supabase integra este lote.
- Nenhum merge em `main` ou deploy de Produção está autorizado por implicação.
- Alterações paralelas do workspace e artefatos temporários ficam fora do manifesto.
