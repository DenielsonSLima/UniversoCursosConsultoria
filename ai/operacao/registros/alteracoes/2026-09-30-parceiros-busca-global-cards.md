# Busca global e identificação de parceiros

Estado: EM VALIDAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Permitir que o gestor pesquise pessoas em todos os polos que o servidor autoriza, independentemente do polo selecionado, mostrando nome, documento formatado, cidade/UF e turma e abrindo o cadastro no polo correto. Atualizar o card do aluno para identificação imediata e corrigir filtros que permaneciam ativos sem aparecer na interface.

## Manifesto explícito

- `modules/gestor/gestor.page.tsx`
- `modules/gestor/components/GestorPortalHeader.tsx`
- `modules/gestor/components/GestorPortalShell.tsx`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/global-search/GestorGlobalSearch.tsx`
- `modules/gestor/global-search/gestor-global-search.model.ts`
- `modules/gestor/global-search/gestor-global-search.model.test.ts`
- `modules/gestor/global-search/gestor-global-search.service.ts`
- `modules/gestor/global-search/gestor-global-search.types.ts`
- `modules/gestor/global-search/useGestorGlobalSearchNavigation.ts`
- `modules/gestor/global-search/gestor-global-search.contract.test.ts`
- `modules/gestor/hooks/useGestorSearch.tsx`
- `modules/gestor/hooks/useGestorPoloTransition.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/ParceirosFilters.tsx`
- `modules/gestor/parceiros/components/ParceirosList.tsx`
- `modules/gestor/parceiros/components/cards/AlunoCard.tsx`
- `modules/gestor/parceiros/hooks/useParceirosFilters.ts`
- `modules/gestor/parceiros/parceiros-filters.model.ts`
- `modules/gestor/parceiros/parceiros-filters.model.test.ts`
- `supabase/migrations/20260930011500_create_gestor_global_search.sql`
- `supabase/migrations/20260930012500_fix_gestor_global_search_result_types.sql`
- `supabase/tests/gestor_global_search.contract.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-parceiros-busca-global-cards.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 28 arquivos.

## Contratos preservados

- O cliente envia apenas o termo e o limite; polos autorizados são derivados no servidor por `gestor_allowed_polo_ids()` e conferidos pela guarda canônica de Parceiros.
- Turmas de alunos e professores aparecem somente quando as guardas acadêmicas específicas autorizam a leitura.
- A busca exige o módulo Parceiros, não amplia perfis e não usa o polo atual como escopo de autorização ou de cache.
- Escolher resultado de outro polo aguarda a transição autorizada antes de abrir o cadastro; sair de outro cadastro exige confirmação preventiva.
- Matrículas continuam enriquecendo filtros e detalhes, mas deixam de ocupar o card resumido do aluno.
- O X da lista limpa somente o texto, preserva os demais filtros e devolve foco ao campo.

## Validação

- Reprodução confirmada nas imagens de produção: polo e turma eram repetidos no card; CPF tinha baixo contraste; o controle visual podia zerar enquanto o estado antigo continuava filtrando.
- Reunião com três agentes confirmou a causa dos filtros não controlados, a hierarquia do card e o contrato de busca global por RBAC.
- Doze testes focados aprovados para filtros, apresentação, navegação, RPC e migration; TypeScript e ESLint focado aprovados.
- RPC aplicada via Supabase MCP; chamada sem perfil foi negada, shape/grants foram inspecionados e termo sintético sob serviço retornou zero linhas.
- A migration de correção preserva a primeira já aplicada e converte explicitamente o estado do polo de `varchar(2)` para a saída `text`.
- Advisor Supabase não associou alertas de performance ao lote; o aviso de `SECURITY DEFINER` é intencional e mitigado por guardas internas e grants mínimos.
- Smoke Safari, build, Preview Vercel, GitHub e produção permanecem pendentes nesta etapa de validação.
