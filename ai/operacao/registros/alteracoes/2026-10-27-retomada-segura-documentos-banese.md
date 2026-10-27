# Retomada segura e disponibilidade documental Banese — 27/10/2026

Estado: PREPARADO PARA REVISÃO. Candidata 4.8.235/revisão 244, base main 22552591fc0e441f7d6ea3b10c0ca71bb26c5456. Nenhuma migration, Edge Function ou publicação em produção aplicada nesta tarefa.

## Objetivo e aceite

Pedido de correção por etapas, com cuidado, para o usuário tentar a emissão manual posteriormente. Aceite: preservar operação, autorização original, conteúdo financeiro, identidade bancária e histórico; permitir retomada por outro gestor com permissão atual quando o fingerprint permanecer igual; diferenciar divergência de identidade/conteúdo; explicar indisponibilidade documental e encaminhar um ou dois títulos válidos ao exportador de boletos existente. Nenhuma emissão, cancelamento ou comunicação bancária automática integra este lote.

## Etapa 1 — Autorização e retomada

- Migration nova substitui somente dois blocos exatos da autorização existente. Drift de corpo/metadados interrompe a migration; owner, ACL, SECURITY DEFINER e search_path permanecem iguais.
- Revalida RBAC/polo com NULL negado, vínculo autorização/run/recebível e request do snapshot. Mesmo request e fingerprint permitem outro gestor autorizado continuar.
- authorized_by/authorized_at, request_id e fingerprint originais permanecem intactos. Auditoria de retomada é idempotente por recebível/operação/gestor.
- Conteúdo ou identidade incompatível retorna diagnóstico tipado. Orquestrador preserva progresso e serviço não recomenda repetição automática para essa rejeição permanente.
- Claim, persistência e recuperação ambígua não são substituídos; nenhum novo POST é introduzido.

## Etapa 2 — Documentos existentes

- Diagnóstico de exclusões existe somente para consulta individual por matrícula; mantém filtro de polo e não retorna IDs ou identidades bancárias dos títulos excluídos.
- Critérios de status, emissão, termos, identidade e agrupamento permanecem iguais; histórico ou título inválido não passa a ser imprimível.
- O botão reutiliza preparação existente para boletos individuais com um ou dois títulos; três ou mais seguem carnê.
- Catálogo vazio diferencia causas contáveis e indica revisão do extrato/vínculos; não presume ausência de dívida nem autoriza gerar outro ciclo.
- Layout, compositor PDF e cálculos financeiros não foram alterados.

## Manifesto explícito
- `.github/workflows/technical-cycle-recovery.yml`
- `scripts/test-technical-cycle-recovery.mjs`
- `supabase/migrations/20261027133000_allow_audited_manual_cycle_authorization_resume.sql`
- `supabase/functions/technical-manual-cycle-issuance/authorization-error.ts`
- `supabase/functions/technical-manual-cycle-issuance/authorization-error.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/tests/manual_cycle_authorization_replay.isolated.test.mjs`
- `supabase/tests/fixtures/manual-cycle-authorization-replay.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-authorization-recovery.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.types.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.contract.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.diagnostics.ts`
- `modules/gestor/secretaria/carnes-alunos/carnes-alunos.diagnostics.test.ts`
- `supabase/functions/secretaria-banese-document-groups/index.ts`
- `supabase/functions/secretaria-banese-document-groups/document-diagnostics.ts`
- `supabase/functions/secretaria-banese-document-groups/document-diagnostics.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-retomada-segura-documentos-banese.md`
Total: 24 arquivos.

## Validação

- Revisão independente de três agentes e cruzamento de histórico, emissão e documentos.
- 56 testes focados aprovados na execução consolidada scripts/test-technical-cycle-recovery.mjs: 8 SQL PostgreSQL isolado, 25 contrato/orquestração/autorização, 14 catálogo/diagnóstico backend e 9 serviço/seleção frontend.
- SQL usa PGlite 0.3.14 com corpos canônicos reais de autorização e trigger de primeiro claim, SET LOCAL ROLE authenticated/anon/service_role. Reproduz PT422 antes, valida handoff depois, nega RBAC NULL/fora de escopo, preserva conteúdo/autorização e estado ambíguo, verifica auditoria única e compatibilidade do primeiro claim.
- Dependências de identidade, polo, snapshot e auditoria são sintéticas; testes isolados não comprovam integração ou concorrência entre conexões na produção.
- Serviço é exercido com transporte Supabase simulado e payload real de erro: preserva código/progresso e envia apenas resume para matrícula/ciclo, sem nova chave ou retry.
- TypeScript focado dos contratos/diagnósticos passou; Action e Edge transpilaram. CI completo/Preview permanecem etapas do PR.
- Controle de versão e conferência direta dos 24 arquivos do manifesto aprovados (todos abaixo de 500 linhas). npm run check:file-lines agregado não concluiu nesta cópia parcial: 360 referências históricas/registries ausentes, fora do lote. Nenhum arquivo histórico foi removido ou alterado; o CI recebe o repositório completo.
- Não houve emissão bancária, cancelamento, baixa ou alteração de registros reais nos testes.

## Etapa 3 — Aplicação e verificação pendentes

O Supabase conectado lista apenas outro projeto. Leitura explícita do projeto Universo kfekgwyqozhicpfuunpo foi recusada por falta de permissão. Não usar outro banco, CLI, credenciais improvisadas ou sessão de usuário fabricada.

Antes de aplicar: obter acesso MCP ao projeto correto; consultar logs, migrations e definição efetiva das funções; resolver matrículas/recebíveis por IDs canônicos e comparar autorizador original, fingerprint e estados sem mutação. Registrar evidências privadas fora deste arquivo. O diagnóstico atual não distingue ainda a causa real entre troca de ator e alteração financeira dos casos reportados.

Ordem de aplicação: migration validada contra definição remota → Edge technical-manual-cycle-issuance e secretaria-banese-document-groups com dependências remotas preservadas → web do mesmo candidato após CI/Preview. Conferir contratos reais sem emissão; smoke autenticado no Safari ainda pendente. Somente depois orientar a tentativa manual do usuário. Divergência financeira continua exigindo revisão, nunca limpar autorização/chave ou forçar reemissão.

A candidata no repositório não comprova correção aplicada em produção. Nenhuma pendência de elegibilidade importada foi artificialmente liberada.

