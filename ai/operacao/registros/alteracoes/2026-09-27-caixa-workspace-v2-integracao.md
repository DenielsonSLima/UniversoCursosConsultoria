# Caixa Workspace v2 — integração segura e cockpit

Estado: RPCs APLICADAS E VALIDADAS — CUTOVER CONTROLADO PRONTO PARA PUBLICAÇÃO

## Objetivo

Continuar o Workspace v2 publicado na versão 4.8.122 com escopo obrigatório de empresa, autorização segura, transporte frontend validado, Realtime mínimo, primeira dobra responsiva e entrada real no módulo Caixa. Nenhuma seção visual pode fabricar dado ausente ou executar cálculo financeiro no navegador.

## Guardas

- Dinheiro, percentuais, séries, geometria de gráficos, classificação e paginação pertencem às RPCs.
- Obrigação aberta permanece comprometido; somente pagamento efetivo integra o realizado.
- O frontend valida, confronta o pedido, formata strings monetárias e apresenta estados canônicos.
- O consolidado é filtrado por `p_company_id`; `allPolos` mantém a semântica vigente de administrador global do sistema.
- Core privado sem execução cliente; wrapper com identidade, gestor, módulo/aba, empresa e polo validados antes da leitura.
- Workspace v2 e análise mensal legada são modos mutuamente exclusivos; nenhum fallback mistura snapshots ou mantém consultas dos dois modos ativas.
- Supabase e GitHub remotos somente pelos MCPs próprios; smoke autenticado somente no Safari.

## Etapas deste lote

1. Core privado company-scoped e wrapper público seguro.
2. Contrato `meta.empresa_id`, serviço, query keys, retry e cancelamento.
3. Invalidação Realtime por empresa, polo e consolidado, sempre relendo o snapshot.
4. Primeira dobra da mesa de tesouraria com urgência, competência, agenda e estados de completude.
5. Drill-down paginado de contas a pagar.
6. Cutover controlado no módulo Caixa com alternância exclusiva entre cockpit e análise mensal.
7. Revisão cruzada, testes locais, aplicação remota, smoke e publicação atômica.

## Critérios de aceite

- Empresa A nunca lê dados da empresa B no core company-scoped.
- Polo precisa pertencer à empresa e ao escopo efetivo do gestor.
- Caixa ou Financeiro com aba Despesas autorizam a leitura; demais perfis recebem `42501`.
- Payload físico e resposta confrontam empresa, polo, competência e histórico solicitados.
- Evento financeiro invalida somente a empresa e os escopos afetados; o cache nunca recebe delta parcial.
- D0, D+1…D+7 e os três KPIs de contas a pagar são renderizados sem recomposição financeira.
- Zero, incompleto e indisponível continuam estados distintos.
- Arquivos manuais do manifesto não ultrapassam 500 linhas.

## Risco explícito

O modelo de autorização atual não possui vínculo gestor ↔ empresa. `allPolos` autoriza todas as empresas do sistema; hoje a produção possui uma única empresa com polos. Se o produto passar a exigir administradores globais limitados por empresa, o vínculo deve ser criado e configurado antes de ativar novas empresas.

## Resultado local

- Core privado passou a exigir `p_company_id` e filtra `contas_pagar`, `despesas_lancamentos` e rateios pela mesma empresa.
- Wrapper público valida identidade, perfil gestor, Caixa ou Financeiro/Despesas, empresa ativa, polo e escopo antes de chamar o core privado.
- Drill-down oferece seis filtros canônicos com paginação, totais, flags de navegação e valores monetários calculados no banco.
- Serviço, contrato, cache e Realtime segregam empresa, polo, competência, histórico, filtro e página; cancelamento é propagado até a requisição Supabase.
- Realtime não injeta deltas financeiros no cache: apenas invalida os escopos atingidos e solicita um snapshot novo.
- Primeira dobra apresenta urgência, competência e agenda D0–D+7; seções ainda não entregues permanecem indisponíveis, sem gráficos ou zeros inventados.
- Modal do drill-down possui loading, erro, vazio, foco inicial/restaurado, Escape, ciclo de Tab e layout móvel.
- O módulo Caixa abre o cockpit v2 por padrão e oferece a análise mensal como modo alternativo; somente o modo ativo monta queries e Realtime.
- Cockpit e análise mensal permanecem presos ao polo explícito selecionado no portal. O consolidado legado foi desabilitado neste cutover para não cruzar empresas.
- Os três KPIs da competência e o bloco de atraso abrem o drill-down canônico com foco, paginação e snapshot consistente.
- `modules/gestor/caixa/CaixaPage.tsx` e suas alterações paralelas permanecem fora do lote; a integração ocorre pelo compositor `CaixaWorkspaceModule.tsx`.

## Validação local

- PostgreSQL/WASM: 10/10 testes de contrato, autorização, isolamento de empresa, rateio, corte histórico, unidade de contagem e paginação.
- Frontend: 41/41 testes em bundles Node, incluindo contrato, serviço, queries, Realtime, protótipo, view, drill-down e cutover exclusivo.
- `npx tsc --noEmit --pretty false`: aprovado.
- `npx eslint modules/gestor/caixa/workspace`: aprovado.
- `npm run build`: aprovado; somente os avisos já existentes de chunks acima de 500 kB.
- Todos os arquivos manuais deste manifesto possuem no máximo 500 linhas.
- O gate global de linhas encontrou 12 referências ausentes no checkout local e fora deste manifesto; nenhuma falha pertence ao lote do Caixa.
- O smoke autenticado final será executado no Safari após a Preview/produção receber a versão, pois a sessão autenticada disponível está no domínio publicado.

## Aplicação e smoke remoto

- Migrations registradas: `20260927231259_create_caixa_workspace_v2_company_core`, `20260927231312_expose_caixa_workspace_v2_secure`, `20260927231325_create_caixa_workspace_v2_payables_drilldown` e `20260927232030_fix_caixa_workspace_v2_quantity_semantics`.
- Smoke service-role confirmou Workspace v2 e drill-down na versão 2, empresa e escopo corretos, agenda com oito dias e snapshot estável entre páginas.
- Correção remota confirmou KPIs e agenda com `TITULO_FISICO_SEM_DUPLICACAO`; a regra `compromissos_abertos_impactam_realizado` permaneceu `false`.
- Core permanece `STABLE`, `SECURITY INVOKER`, `search_path` vazio e sem execução cliente; wrapper e drill-down permanecem `STABLE`, `SECURITY DEFINER`, `search_path` vazio e sem execução anônima.
- Advisors não apontaram alerta novo de performance. Os dois avisos de `SECURITY DEFINER` executável por `authenticated` são esperados e intencionais, pois as RPCs públicas validam identidade, perfil, módulo, empresa e polo antes da leitura.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-27-caixa-workspace-v2-integracao.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `supabase/migrations/20260927221000_create_caixa_workspace_v2_company_core.sql`
- `supabase/migrations/20260927222000_expose_caixa_workspace_v2_secure.sql`
- `supabase/migrations/20260927230000_create_caixa_workspace_v2_payables_drilldown.sql`
- `supabase/migrations/20260927233000_fix_caixa_workspace_v2_quantity_semantics.sql`
- `supabase/tests/caixa_workspace_v2_secure.contract.test.mjs`
- `supabase/tests/caixa_workspace_v2_secure.isolated.test.mjs`
- `supabase/tests/caixa_workspace_v2_payables_drilldown.contract.test.mjs`
- `supabase/tests/caixa_workspace_v2_payables_drilldown.isolated.test.mjs`
- `modules/gestor/caixa/workspace/caixa-workspace.types.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.validation.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.contracts.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.contracts.test.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.service.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.service.test.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.queries.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.queries.test.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.realtime.ts`
- `modules/gestor/caixa/workspace/caixa-workspace.realtime.test.ts`
- `modules/gestor/caixa/workspace/useCaixaWorkspaceRealtime.ts`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePrototype.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePrototype.test.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspaceAgenda.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspaceSectionState.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspaceView.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspaceView.test.tsx`
- `modules/gestor/caixa/workspace/caixa-workspace-payables.types.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-payables.validation.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-payables.service.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-payables.queries.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-payables.test.ts`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePayablesPanel.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePayablesModal.tsx`
- `modules/gestor/caixa/workspace/components/CaixaWorkspacePayablesModal.test.tsx`
- `modules/gestor/caixa/workspace/caixa-workspace-scope.service.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-scope.queries.ts`
- `modules/gestor/caixa/workspace/caixa-workspace-cutover.test.ts`
- `modules/gestor/caixa/CaixaWorkspaceModule.tsx`
- `modules/gestor/components/GestorModuleContent.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 44 arquivos.

O manifesto está congelado para a publicação do cutover controlado. A `CaixaPage.tsx` atual e quaisquer alterações paralelas permanecem fora do lote.
