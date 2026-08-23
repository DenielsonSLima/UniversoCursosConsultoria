# Sincronização completa e estabilização 4.7.2 — 2026-08-23

Estado: `PUBLICADO_GITHUB_PR_83_AGUARDANDO_PRODUCAO`

## Objetivo

Reconciliar integralmente as alterações válidas do workspace contra a `main`, revisar os domínios críticos, corrigir os bloqueios encontrados e publicar um snapshot atômico no GitHub. O merge na `main` e a publicação Vercel de Produção permanecem fora do escopo porque não foram autorizados explicitamente.

Base remota auditada: commit `0fb2ae07d0dbf4f4443fe09bf34ba8283d9600b3`, árvore `7667d0304dcec269dd44d5c8c2aa6ebfc26bc1d0`.

## Resultado funcional

- Logout automático usa escopo local e preserva outros dispositivos; logout voluntário continua global.
- Falha de rede no sign-out remove diretamente token, verificador PKCE e usuário persistidos, impedindo reidratação após recarga.
- Retorno dos seletores de perfil e de polo encerra a sessão local antes de mostrar novamente o login; primeiro acesso web/app preserva o `contextId` opaco e a rota do papel.
- A guarda de Responsável/Coordenador limita chamadas remotas a oito segundos e navega antes do logout de rede quando a sessão é definitivamente rejeitada.
- O Dashboard oferece cadastro de Responsável e reutiliza o fluxo canônico de Parceiros.
- A grade técnica ganhou rótulos associados, sugestão editável de horário para 4h/8h, limpeza da sugestão ao migrar para outra carga e hover válido no botão de docente.
- O componente de grade foi dividido por responsabilidade; todos os arquivos manuais do lote ficaram abaixo de 500 linhas.
- O reparo da grade eleitoral da Ficha de Matrícula passou a reconhecer estruturas legadas com segurança, preservar wrappers externos e recusar estados ambíguos.
- O contrato de mutações EAD e a reconciliação segura de convite do Responsável foram incorporados ao gate do GitHub.
- `patrimonio.constants.ts`, sem imports ou uso após a adoção do cadastro dinâmico, foi retirado do repositório.

## Supabase e segurança

- Projeto principal confirmado: `kfekgwyqozhicpfuunpo`.
- Migration remota `20260823135522_close_null_partner_polo_gestor_scope` aplicada exclusivamente pelo MCP Supabase e preservada localmente pelo SHA-256 `9800fc9a23b5005ceac9285f945170ca52bf6037156d4accfb41cf00ef0acc99`.
- Os helpers de escopo de Parceiros agora exigem polo primário compatível ou interseção explícita em `polo_ids`; polo nulo não autoriza Gestor local.
- Helpers permanecem `STABLE`, `SECURITY DEFINER`, `search_path = ''` e sem execução por `anon`/`PUBLIC`.
- Ledger final: 717 versões e 717 nomes únicos; última entrada `20260823135522`.
- Advisors permaneceram no baseline documentado: segurança 470 e performance 252.
- As 21 migrations aplicadas que faltavam na cópia local foram restauradas byte a byte a partir da `main`; nenhuma aparece como alteração ou exclusão deste snapshot.

## Exclusões deliberadas

- A migration local `20260821020000_enable_signature_stamp_safe_typography_v5.sql` e seu teste permanecem fora: a fonte foi substituída pela v6, não existe na `main` nem no ledger e publicá-la criaria histórico retroativo.
- `FinanceiroAlunosList.legacy.tsx` permanece como artefato local não referenciado e ausente da `main`; não integra o manifesto nem o commit.
- As minutas binárias em `Documentos/` são materiais locais sem relação com o produto e não foram publicadas.
- O índice RAG foi regenerado uma única vez somente depois do fechamento das fontes operacionais.

## Validação final

- Node focado: 43/43 contratos aprovados.
- Deno focado: 29/29 contratos aprovados.
- PDF oficial da Ficha: 19/19 contratos; texto selecionável, grade 6×2 íntegra, somente marca e QR como imagens isoladas e render A4 sem clipping.
- `npx tsc --noEmit`: aprovado.
- ESLint global e focado: aprovados.
- Teto de 500 linhas, imutabilidade de migrations, controle de versão e contrato operacional: aprovados.
- RAG: índice regenerado e estado atual confirmado.
- Build Vite de produção: aprovado; somente avisos preexistentes de chunks grandes.
- Revisões independentes de Auth, Supabase/migrations e UI/grade: nenhum bloqueador residual.
- Smoke autenticado/visual: pendente porque o runtime não encontrou navegador conectado (`[]`).

## Publicação GitHub

- Branch: `release/sincronizacao-completa-4-7-2`.
- PR: `#83`, direcionada à `main`.
- Um commit atômico contém somente os 45 caminhos do manifesto abaixo.
- CI e Preview são critérios de aceite da PR; merge e Vercel Produção aguardam autorização explícita.

## Manifesto explícito

Total: 45 arquivos

### Operação, qualidade e versão

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-23-hotfix-escopo-parceiros-polo-nulo.md`
- `ai/operacao/registros/alteracoes/2026-08-23-sincronizacao-completa-4-7-2.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-02-parte-2.md`
- `internal/versioning/system-version.json`

### Auth, multiacesso e primeiro acesso

- `lib/supabase.ts`
- `lib/supabase-auth-storage.ts`
- `lib/supabase-auth-storage.test.ts`
- `modules/aluno/login-app/AlunoAppLoginPage.tsx`
- `modules/login/LoginPage.tsx`
- `modules/login/components/ProfessorPoloSelector.tsx`
- `modules/login/login.service.ts`
- `modules/login/logout-scope.contract.test.ts`
- `modules/login/portal-context-access.contract.test.ts`
- `modules/login/portal-logout-flow.ts`
- `modules/login/portal-logout-flow.test.ts`
- `modules/login/profile-selection-session.ts`
- `modules/login/profile-selection-session.test.ts`
- `modules/login/usePortalContextAccess.ts`
- `modules/public/login/AlunoFirstAccessPage.tsx`
- `modules/public/login/aluno-first-access.contract.test.ts`
- `modules/public/login/useAlunoLoginPublicPage.ts`
- `modules/shared/hooks/usePortalLogout.ts`

### Interface, grade e documento

- `modules/gestor/cadastros/ficha-matricula/voter-template-repair.ts`
- `modules/gestor/dashboard/components/DashboardQuickActionsHeader.tsx`
- `modules/gestor/dashboard/components/DashboardQuickActionsModal.tsx`
- `modules/gestor/dashboard/dashboard.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradeDisciplina.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradePlanejamentoForm.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/TurmaGradePlanejamento.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/grade/turma-grade-ui.ts`
- `modules/gestor/secretaria/shared/voter-template-repair.test.ts`

### Supabase e contratos críticos

- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.test-fixture.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access.test.ts`
- `supabase/functions/portal-user-management/handlers/ensure-responsavel-access-reconciliation.test.ts`
- `supabase/migrations/20260822162200_close_null_partner_polo_gestor_scope.sql`
- `supabase/tests/ead_assessment_mutations.contract.test.ts`
- `supabase/tests/partner_gestor_polo_scope_fail_closed.contract.test.ts`

### Retirada

- `modules/gestor/patrimonio/patrimonio.constants.ts`
