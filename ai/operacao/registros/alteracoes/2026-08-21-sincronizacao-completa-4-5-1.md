# Manifesto de publicação — 2026-08-21 sincronização completa 4.5.1

Estado: `VALIDADO_LOCAL_PARA_DRAFT_PR`

## Base e estratégia

- Repositório: `DenielsonSLima/UniversoCursosConsultoria`.
- Base remota: `156da8752c8c4513fea86eaf520211e7df039d0c` (`main`, release 4.5.0).
- O `HEAD` local está desatualizado; por isso, os 559 caminhos do status local foram comparados por hash de blob com a árvore remota.
- Resultado da reconciliação inicial: 503 caminhos já publicados, 56 diferenças reais e nenhum arquivo removido.
- Os 16 caminhos alterados local e remotamente foram revisados individualmente; as mudanças locais são incrementais e preservam o conteúdo remoto.
- Publicação planejada em um único commit Git, criado sobre a árvore remota atual e enviado para uma branch isolada por MCP GitHub.

## Resultado funcional

- Gestor valida o e-mail do aluno após confirmação fora do sistema e pode gerar uma senha temporária exibida somente uma vez.
- O aluno troca a senha obrigatoriamente no primeiro login, aceita os termos vigentes e só então acessa o portal.
- O fluxo registra auditoria, impede emissão concorrente, não persiste a senha em texto e envia respostas sem cache.
- Caixa e PDF vetorial recebem os ajustes acumulados de apresentação e reutilização do Blob da prévia.
- A seleção de curso na criação de turma fica acessível e consistente.
- Documentação geral, operacional e de integrações é incorporada; três capas EAD são adicionadas.

## Manifesto explícito — 62 caminhos

- `.github/workflows/quality-gates.yml`
- `README.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-14-selecao-perfil-institucional.md`
- `ai/operacao/registros/alteracoes/2026-08-21-sincronizacao-completa-4-5-1.md`
- `docs/README.md`
- `docs/sistema/README.md`
- `docs/sistema/VISAO_GERAL.md`
- `docs/sistema/integracoes/pagamentos-e-banese.md`
- `docs/sistema/integracoes/supabase.md`
- `docs/sistema/integracoes/whatsapp-push-e-servicos.md`
- `docs/sistema/modulos/academico-e-secretaria.md`
- `docs/sistema/modulos/comunicacao-e-notificacoes.md`
- `docs/sistema/modulos/documentos-e-validacoes.md`
- `docs/sistema/modulos/financeiro-e-caixa.md`
- `docs/sistema/modulos/portais-e-acesso.md`
- `docs/sistema/modulos/site-publico-ead-e-app.md`
- `docs/sistema/operacao/ambiente-local-e-configuracao.md`
- `docs/sistema/operacao/limpeza-segura.md`
- `docs/sistema/operacao/publicacao-e-recuperacao.md`
- `docs/sistema/operacao/testes-e-validacao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/CaixaReportLauncher.tsx`
- `modules/gestor/caixa/report/CaixaReportNonOperationalPositions.tsx`
- `modules/gestor/caixa/report/CaixaReportPreviewModal.tsx`
- `modules/gestor/caixa/report/CaixaReportRecurringAnalysis.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.ts`
- `modules/gestor/cadastros/modelos-documentos/cabecalho-institucional/cabecalho-institucional.contract.test.ts`
- `modules/gestor/gestao/GestaoPage.tsx`
- `modules/gestor/gestao/components/forms/turma-plano-unico/steps/TurmaPlanoUnicoDadosStep.tsx`
- `modules/gestor/gestao/components/forms/turma-tecnico/TurmaTecnicoDadosStep.tsx`
- `modules/gestor/gestao/especializacao/detalhes/TurmaEspecializacaoDetalhes.tsx`
- `modules/gestor/gestao/livres/detalhes/TurmaLivreDetalhes.tsx`
- `modules/gestor/gestao/tecnicos/GestaoTecnicos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/parceiros/components/cards/EmailConfirmationStatus.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/portal-activation.service.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `public/course-covers/ead/merendeira-escolar.webp`
- `public/course-covers/ead/servicos-gerais.webp`
- `public/course-covers/ead/vigia-observacao-patrimonial.webp`
- `scripts/README.md`
- `supabase/functions/portal-user-management/gestor-access.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.test.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/list-partner-email-statuses.ts`
- `supabase/functions/portal-user-management/handlers/student-access-audit.ts`
- `supabase/functions/portal-user-management/handlers/student-access-identity.ts`
- `supabase/functions/portal-user-management/handlers/student-first-access-state.ts`
- `supabase/functions/portal-user-management/index.ts`
- `supabase/functions/portal-user-management/types.ts`
- `supabase/migrations/20260821230000_harden_student_temporary_password_first_access.sql`
- `supabase/tests/manager_document_receipts_and_implantation_ui.contract.test.ts`
- `supabase/tests/student_temporary_password_access.contract.test.ts`

## Exclusões deliberadas

- `supabase/migrations/20260821020000_enable_signature_stamp_safe_typography_v5.sql` e `supabase/tests/assinatura_eletronica_signature_stamp_safe_typography_v5.contract.test.ts`: fontes substituídas pela v6 já versionada e não presentes no `main` remoto.
- Caches, `dist`, resultados de testes, PDFs/PNGs renderizados e demais artefatos regeneráveis.
- `pasta sem título/Acesso/SKILL.md`: mudança de governança já idêntica ao remoto; não integra o delta deste lote.

## Validação

- Versão 4.5.1, TypeScript, ESLint e build Vite com 3.523 módulos aprovados.
- Primeiro acesso: 5 testes Node; fluxo novo: 38 testes Deno; diretório completo `portal-user-management`: 90 testes; `deno check` do entrypoint aprovado.
- Contratos Supabase: 525/525 aprovados após corrigir somente a referência histórica ao ID real de uma migration já existente.
- Caixa: 42/42; PDF financeiro vetorial: 4/4; plano financeiro único/turmas: 10/10; validação documental: 141 verificações; cabeçalho institucional: 9/9.
- Auditoria do delta: nenhum segredo, dump, certificado, executável ou symlink; três WebP válidos em 800×450 e sem metadados incorporados.
- Contrato de operações aprovado: um lote ativo, bootstrap de 10.555 bytes e índice RAG final com 11 fontes/60 trechos.
- Manifesto final reconciliado em 62 caminhos e `git diff --check` aprovado antes do commit.
- Pendente depois do commit: CI e inspeção do Draft PR.

## Riscos preexistentes fora do delta

- O `main` já contém duas fontes executáveis idênticas da migration v7 de acervo (`20260820202142` e `20260820203000`). Elas não são alteradas nem reenviadas neste commit. Antes de qualquer reconstrução ou operação de banco, o ledger remoto deve ser reconciliado por MCP para decidir qual versão é canônica sem reescrever migration aplicada.
- Uma migration histórica de empréstimos usa `search_path public` temporariamente e é endurecida por migration posterior. Nenhuma das duas integra o delta desta publicação.

## Limites de autorização

- Autorizado: branch, commit e Draft PR no GitHub com este manifesto.
- Não autorizado neste lote: aplicar migration, implantar Edge Function, publicar Vercel em produção ou mesclar o PR em `main`.
