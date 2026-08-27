# Carnês dos alunos e baixa rápida

Data: 2026-08-26  
Estado: `PUBLICADO_PARCIAL_BACKEND_BANESE_AGUARDANDO_DEMAIS_ETAPAS`

## Objetivo

Criar, dentro da Secretaria, uma área documental para montar boletos e carnês a partir das cobranças Banese já existentes, nos modos individual, lote e personalizado. Manter os recebimentos separados e acrescentar a baixa canônica ao modal rápido `Financeiro do aluno` do Início.

## Reunião técnica

Três agentes independentes revisaram, antes da implementação, a navegação da Secretaria, o pipeline documental Banese e o modal financeiro do Início. A decisão conjunta foi:

- renomear o card atual para `Recebimentos` e criar `Carnês dos alunos` como submódulo separado;
- preservar integralmente os compositores Banese em produção e selecionar apenas títulos existentes;
- agrupar documentos pela matrícula e pelo escopo bancário completo, nunca apenas por aluno ou curso;
- reutilizar no Início o modal canônico de baixa manual, sem criar uma segunda regra financeira;
- separar consulta, emissão documental e baixa nas permissões.

## Implementação

### Secretaria e documentos Banese

- A pasta interna `modules/gestor/secretaria/carnes-alunos/` concentra página, contrato, seleção, serviço, composição vetorial, controller e componentes.
- Os modos individual, lote e personalizado consultam um catálogo read-only por polo, aluno/CPF, matrícula, curso e turma.
- O catálogo retorna somente CPF mascarado e omite pagador interno, linha digitável, código de barras, Nosso Número e identificadores bancários.
- O agrupamento inclui pagador, matrícula, polo, ambiente, emissor, convênio e agência; `1–2` títulos usam o boleto A4 canônico e `3–30` usam o carnê canônico.
- A geração tem concorrência máxima quatro, cancelamento por `AbortSignal`, limites de 6 carnês, 20 boletos, 80 páginas estimadas e 24 MiB de PDFs vetoriais.
- Prévia, download e impressão reutilizam o mesmo Blob. Nenhum compositor bancário, marca, cálculo ou recurso oficial foi redesenhado.
- O renderizador pagina títulos pagáveis e aplica o predicado de registro bancário antes do teto de 31; históricos pagos ou cancelados não excluem parcelas atuais posteriores.

### Baixa rápida no Início

- A busca segura aceita perfis com a aba efetiva `Financeiro > Resumo` ou `Financeiro > Receber`, sempre no polo autorizado.
- O botão de baixa exige `Financeiro > Receber`, polo específico e título `PARCELA`, `REMATRICULA` ou `DEPENDENCIA`; matrícula e tipo desconhecido falham fechados.
- Contas bancárias são carregadas sob demanda e filtradas pelo polo do título.
- A confirmação reutiliza `ManualSettlementModal` e `financeiroService.markReceivablePaid`.
- O contexto autenticado `DASHBOARD_EXISTING_TITLE_ONLY` participa da normalização, idempotência e auditoria e nunca chama sincronização de parcelas futuras, inclusive em replay.
- Sucesso ou falha invalida os caches financeiros pertinentes e mantém o usuário no modal do Início.

## Guardas de segurança

- Proibido chamar criação, reemissão, sincronização ou registro de cobrança pelo catálogo documental.
- Proibido confirmar uma baixa durante testes ou smoke.
- `carnes-alunos` sozinho permite somente documentos de parcelas e nunca concede baixa.
- Consulta documental, consulta do resumo e recebimento possuem guardas distintas no frontend, na RPC e nas Edge Functions.
- Polo é validado no catálogo e novamente em cada renderizador/baixa.
- O deploy remoto autorizado ficou restrito às três Edge Functions documentais Banese. Migration, `asaas-api`, frontend e baixa real permaneceram fora do escopo publicado.

## Revisão independente

O parecer inicial encontrou dois achados acionáveis:

1. `Crítico`: a RPC usava o helper legado de aba financeira. Foi trocado por `gestor_has_effective_financeiro_tab('resumo'|'receber')`, com teste que proíbe regressão ao helper legado.
2. `Importante`: o renderizador limitava 31 linhas antes de retirar títulos encerrados. Agora pagina até o teto seguro, compartilha a allowlist local e aplica o predicado canônico de registro antes do limite. Um teste cobre 40 títulos históricos encerrados antes de 4 atuais.

A rechecagem confirmou ambos os reparos e emitiu veredito final não bloqueador. Revisões anteriores também resultaram em cancelamento real das requisições, limites conservadores, remoção de `studentId` do contrato público e acessibilidade completa das abas/alertas.

## Manifesto explícito

Total: 54 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-08-26-carnes-alunos-e-baixa-rapida.md`
- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/dashboard/components/DashboardQuickActionsModal.tsx`
- `modules/gestor/dashboard/student-finance/DashboardStudentFinanceResults.tsx`
- `modules/gestor/dashboard/student-finance/dashboard-student-finance.access.ts`
- `modules/gestor/dashboard/student-finance/dashboard-student-finance.contract.test.ts`
- `modules/gestor/dashboard/student-finance/dashboard-student-finance.model.test.ts`
- `modules/gestor/dashboard/student-finance/dashboard-student-finance.model.ts`
- `modules/gestor/dashboard/student-finance/dashboard-student-finance.service.ts`
- `modules/gestor/dashboard/student-finance/useDashboardStudentSettlement.ts`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/consulta-financeira/SecretariaConsultaFinanceiraPage.tsx`
- `modules/gestor/secretaria/secretaria-access.ts`
- `modules/gestor/secretaria/carnes-alunos/SecretariaCarnesAlunosPage.tsx`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.test.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.format.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.pdf.test.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.pdf.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.selection.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.service.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts`
- `modules/gestor/secretaria/carnes-alunos/components/BaneseDocumentGroupCard.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesDocumentPreviewModal.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesModeNavigation.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesSelectionSummary.tsx`
- `modules/gestor/secretaria/carnes-alunos/components/CarnesWorkspace.tsx`
- `modules/gestor/secretaria/carnes-alunos/hooks/useCarnesAlunosController.ts`
- `supabase/config.toml`
- `supabase/functions/_shared/authz.test.ts`
- `supabase/functions/_shared/authz.ts`
- `supabase/functions/_shared/http.ts` (somente normalização mecânica de formato no fechamento)
- `supabase/functions/asaas/api/authz.test.ts`
- `supabase/functions/asaas/api/authz.ts`
- `supabase/functions/asaas/api/manual-settlement-context.test.ts`
- `supabase/functions/asaas/api/manual-settlement-future-sync.ts`
- `supabase/functions/asaas/api/manual-settlement-money.test.ts`
- `supabase/functions/asaas/api/manual-settlement-money.ts`
- `supabase/functions/asaas/api/manual-settlement.repository.ts`
- `supabase/functions/asaas/api/manual-settlement.service.ts`
- `supabase/functions/asaas/api/manual-settlement.types.ts`
- `supabase/functions/banese-boleto-document/index.ts`
- `supabase/functions/banese-carnet-document/document-policy.test.ts`
- `supabase/functions/banese-carnet-document/document-policy.ts`
- `supabase/functions/banese-carnet-document/index.ts`
- `supabase/functions/secretaria-banese-document-groups/document-groups.test.ts`
- `supabase/functions/secretaria-banese-document-groups/document-groups.ts`
- `supabase/functions/secretaria-banese-document-groups/index.ts`
- `supabase/functions/secretaria-banese-document-groups/security-contract.test.ts`
- `supabase/migrations/20260826232000_expand_dashboard_student_finance_search.sql`

Arquivos compartilhados já continham alterações paralelas. Somente os contratos descritos acima pertencem a este lote; a publicação parcial está delimitada na seção própria e nenhuma mudança alheia foi descartada ou atribuída silenciosamente ao lote.

## Validação local

- Carnês UI, seleção, abort, contrato e PDF vetorial: `20/20`.
- Catálogo Banese, políticas documentais e RBAC: `44/44`.
- Modal financeiro do Início e contrato da migration: `9/9`.
- Acesso do gestor: `30/30`.
- Baixa manual, contexto, idempotência, remoto, migration canônica e estorno: `47/47`.
- Compositores PDF Banese e termos financeiros: `20/20`.
- Total focado registrado: `170/170` testes.
- TypeScript global, ESLint focado, `deno fmt --check`, `deno check` dos quatro pontos de entrada, controle de versão e `git diff --check`: aprovados.
- Build Vite de produção concluído em pasta temporária, com 3.926 módulos.
- Fixtures canônicas: boleto com 1 página A4 e carnê de 4 parcelas com 2 páginas A4; primeiras páginas renderizadas e inspecionadas visualmente.
- Todos os arquivos manuais do manifesto permanecem com até 500 linhas.
- Revisão independente final: não bloqueadora.

## Publicação remota parcial

Autorização explícita recebida em 2026-08-26 somente para o catálogo e os renderizadores documentais Banese. A operação foi realizada exclusivamente pelo MCP Supabase no projeto `kfekgwyqozhicpfuunpo`.

- `banese-boleto-document`: versão 13 → 14, `ACTIVE`, `verify_jwt=true`, SHA remoto `b467b57f74774441f0c5ab8b3a0af283f38c908fa9581b55307902516475e803`.
- `banese-carnet-document`: versão 11 → 12, `ACTIVE`, `verify_jwt=true`, SHA remoto `d94fb54fde796b9f8e4135684a944c2ddfce7d09b1e8c1f9502cdc7e62ef868f`.
- `secretaria-banese-document-groups`: criada na versão 1, `ACTIVE`, `verify_jwt=true`, SHA remoto `1b121f73b74de0580bd2eec68256b28968059a7f471ec9e41fc4d07c2dd7c0cf`.

Os bundles remotos anteriores dos dois renderizadores foram capturados antes do deploy. Para impedir que mudanças paralelas do worktree alterassem os PDFs oficiais, cada renderizador preservou 15 arquivos remotos byte a byte: no boleto foram substituídos somente o entrypoint e `_shared/authz.ts`; no carnê, somente o entrypoint, a política documental e `_shared/authz.ts`. A releitura pós-deploy confirmou zero divergência nos arquivos preservados e ausência da guarda de escrita nos três entrypoints.

O catálogo foi publicado com oito arquivos auditados e permanece estruturalmente somente leitura. Não foram aplicadas migrations, não houve deploy de `asaas-api` ou frontend e nenhum request autenticado com aluno, cobrança ou UUID real foi executado. Os logs consultados após a publicação continham apenas os `OPTIONS 404` anteriores ao deploy; o smoke autenticado permanece pendente para a sessão do gestor.

## Limites e próxima operação

- O navegador interno não estava disponível e não havia sessão autenticada de gestor reutilizável; o smoke interativo em 375/428/768/1280/1536 px e o fluxo autenticado sem confirmação de baixa continuam pendentes.
- Houve somente a publicação remota das três Edge Functions documentais descritas acima; nenhuma cobrança, baixa, cancelamento ou sincronização real foi executada.
- A publicação restante exige autorização explícita e ordem backend-first: aplicar a migration, publicar `asaas-api`, validar seus contratos remotos e só então publicar o frontend.
