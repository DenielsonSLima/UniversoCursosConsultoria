# Card de e-mail validado pelo gestor — 2026-08-24

Estado: `PUBLICADO_PRODUCAO_4_7_7`

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
- Controle de versão `4.7.7`, changelog, CI e build aprovados.
- GitHub Actions `Controle de versão` e `Qualidade do produto`: aprovados; Preview Vercel: `Ready`.

## Publicação

- PR `#89` integrada por squash na `main`, commit `243cb89fe6f11fdf4b8af6f9444e99cf9c8fdd91`.
- GitHub Actions e Vercel Production concluíram com sucesso.
- `https://universocc.com.br/gestor` respondeu HTTP 200 e os bundles públicos contêm `emailValidatedByManager` e o rótulo `E-mail validado pelo gestor`.

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
- Publicação concluída no GitHub e na Vercel Production, limitada ao manifesto acima.
- Alterações paralelas do workspace e artefatos temporários ficam fora do manifesto.
