# Retomada segura e disponibilidade documental Banese — 27/10/2026

Estado: BACKEND APLICADO E CONFERIDO; WEB EM VALIDAÇÃO. Candidata 4.8.235/revisão 244, base main 22552591fc0e441f7d6ea3b10c0ca71bb26c5456, PR329. Aplicação em produção explicitamente autorizada pelo usuário nesta conversa. Nenhuma operação bancária executada.

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
- `supabase/migrations/20261027104210_allow_audited_manual_cycle_authorization_resume.sql`
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
- TypeScript, lint, suíte geral, teto de linhas e build completos aprovados no GitHub no head5399ac1; Preview Vercel READY. O nome da migration foi alinhado ao ledger remoto sem alterar SQL aplicado; nova rodada de CI/Preview acompanha o head final.
- Controle de versão e conferência direta dos 24 arquivos do manifesto aprovados (todos abaixo de 500 linhas). npm run check:file-lines agregado não concluiu nesta cópia parcial: 360 referências históricas/registries ausentes, fora do lote. Nenhum arquivo histórico foi removido ou alterado; o CI recebe o repositório completo.
- Não houve emissão bancária, cancelamento, baixa ou alteração de registros reais nos testes.

## Etapa 3 — Aplicação e verificação remotas

A conexão inicialmente recusou o projeto. Após a liberação indicada pelo usuário, nova consulta confirmou UniversoCursoseConsultoria kfekgwyqozhicpfuunpo. Logs, advisors, migrations, tabelas e funções efetivas conferidos por MCP, sem CLI ou credencial improvisada.

- Definição autorizadora e trigger efetivos são iguais às fixtures canônicas usadas nos testes. Migration aplicada: ledger 20261027104210_allow_audited_manual_cycle_authorization_resume; fonte renomeada para esse ID mantendo SQL byte a byte.
- Hash da função autorizadora após aplicação: 3cad6685913547a810e706ea8305d636, igual ao esperado. Owner, ACL, SECURITY DEFINER e search_path preservados; anon e service_role continuam sem EXECUTE e authenticated mantém EXECUTE.
- Emissor technical-manual-cycle-issuance v13 ACTIVE, JWTtrue,75 arquivos: preservado bundle remoto, alterados somente orchestrator e novo authorization-error. Catálogo secretaria-banese-document-groups v8 ACTIVE, JWTtrue,10 arquivos: somente index e novo document-diagnostics.
- Readback dos dois bundles igual a todos os arquivos esperados, incluindo dependências intocadas e import map. Advisors de segurança antes/depois sem mudança nos grupos/contagens observados; avisos anteriores fora deste lote preservados.
- Contagens e total nominal de recebíveis, contagem de runs e hash integral das autorizações inalterados. Zero eventos de retomada por outro gestor antes/depois. Nenhum título foi emitido, cancelado, baixado ou reautorizado durante a aplicação.
- Guarda real de identidade ausente confirmou negação em transação READ ONLY/ROLLBACK, sem identidade fabricada e sem chamar worker ou emissão. Sessão real do gestor ainda exige aceite manual.

Diagnóstico individual confirmado por leitura: o caso de retomada tem fingerprint igual ao autorizado e autoria original diferente da sessão mostrada; também possui endereço e bairro ausentes, que precisam ser completados pelo cadastro legítimo antes de o Banese aceitar. Os dois casos de catálogo vazio são histórico ORIGINAL Proesc sem identidade/termos Banese e sem comprovação durável de cobertura C1/C2. A interface passará a explicar a indisponibilidade; não cria títulos nem libera cobertura desconhecida. Evidências identificáveis ficaram fora do repositório.

Pendente: CI/Preview do head final, integração e publicação web compatível, conferência do domínio e tentativa consciente na sessão do gestor. Smoke autenticado Safari não realizado. Nenhuma pendência de elegibilidade importada foi artificialmente liberada; divergência financeira continua exigindo revisão.

