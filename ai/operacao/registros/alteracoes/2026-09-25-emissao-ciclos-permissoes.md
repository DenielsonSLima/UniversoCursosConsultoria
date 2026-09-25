# Emissão dos ciclos: permissões e origem única — 25/09/2026

Estado: VALIDADO — SQL/Edge aplicados; publicação web em andamento.

## Pedido e causa

Usuário pediu corrigir geração/retomada e remover o envio paralelo no Financeiro; autorizou concluir os boletos do ciclo afetado. Base main ef270b1e, versão 4.8.85. Revisão com três agentes independentes: SQL/papéis, interface financeira e emissão/gateway.

A versão 4.8.82 inseriu helper privado de estorno em expressões dos triggers invoker antes do retorno de service_role. A preparação da expressão falhou com 42501 no primeiro claim bancário. Os testes anteriores simulavam claims de serviço sem trocar o papel SQL efetivo. Logs confirmaram falha anterior ao I/O bancário.

O envio genérico também era indevido: poderia alcançar o banco sem o contrato de persistência atômica exclusivo do ciclo. A geração pela turma já encadeava preparação e emissão; não foi criado um segundo pipeline.

## Aceite e alterações

- Dois triggers conservam INVOKER, ACL e regras; helper LOCAL é avaliado só na transição pertinente.
- Financeiro usa vínculo canônico LOCAL_CREATED e estado de emissão. Não oferece Enviar ao banco para esses ciclos, nem Abrir antes da prova; LOCAL mantém recebimento sem boleto.
- Callback e claim backend bloqueiam rota genérica antes de UPDATE/POST; emissor e worker passam o requestId original.
- Histórico PROTECTED_EXISTING, fontes importadas, pagamentos, valores, datas, identificadores e idempotência permanecem preservados.
- Retomada usa as parcelas e a operação existentes; não recria ciclo.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-25-emissao-ciclos-permissoes.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.receivable-issuance.ts`
- `modules/gestor/financeiro/financeiro.receivable-issuance.test.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/receber/components/ModalidadeReceberTab.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberOperations.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-external-history-actions.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.presentation.contract.test.ts`
- `supabase/functions/gateways/checkout/gateway-creation-fence.ts`
- `supabase/functions/gateways/checkout/gateway-technical-cycle-claim.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-issuance/claim-recovery-integration.test.ts`
- `supabase/migrations/20260925131800_isolate_local_reversal_guard_evaluation.sql`
- `supabase/migrations/20260925132411_validate_cycle_issuance_roles_rollback_20260925.sql`
- `supabase/migrations/20260925133000_project_receivable_cycle_bank_actions.sql`
- `supabase/tests/local_reversal_invoker_roles.rollback.sql`

Total: 24 arquivos.

## Validação

- Regressão SQL executada com SET LOCAL ROLE authenticated/service_role reais, em uma transação com rollback. Fixtures sintéticas de curso/turma/aluno/ciclo/recebíveis/ledger; nenhum boleto real no teste.
- Atualização autenticada comum, primeiro claim de serviço, consumo único da autorização, projeção page/groups, estornos diretos negados, estorno autenticado e replay aprovados. Helper privado continua sem EXECUTE público.
- Candidato integral revertido: helper ausente após rollback e zero cursos/alunos sintéticos persistidos.
- 58 testes Deno do emissor/worker; 18 testes guard/claim/integração e 14 testes frontend aprovados. Novo teste integrado reproduz 42501 na reserva e retoma a mesma operação após reparo; não é prova de POST real.
- TypeScript, lint focado e build aprovados. Testes novos de ações financeiras e guard adicionados ao CI.
- Smoke visual local pendente: Chromium indisponível; download de navegador falhou. Renderização de componentes e callbacks testada sem I/O financeiro. Nenhum navegador remoto usado.
- Suite Proesc adicional mostrou falha preexistente em paymentOriginLabel intacto; não foi alterada a classificação de origem neste lote.

## Aplicação remota

- Validação revertida: ledger 20260925132411, migration local no-op correspondente.
- Trigger patch local 20260925131800 → remoto 20260925132519.
- Projeção local 20260925133000 → remoto 20260925132525.
- asaas-api v98, emissor v8 e worker v8 ativos; autenticação preservada.
- Bundles preservados integralmente, trocando apenas arquivos necessários. asaas-api v97 tinha drift anterior: recebeu somente o novo bloco de bloqueio, sem atualizar dependências ou alterações alheias (101 arquivos). Emissor/worker mantiveram suas dependências remotas (70/72 arquivos).
- Antes/depois das migrations: 6.849 recebíveis, nominal 1.880.198,07, fingerprint financeiro f2833948c90634288e4e59dddc5aee3b inalterado.
- Advisors consultados: nenhuma ampliação de grants/definer nas funções deste lote; avisos preexistentes fora do escopo preservados.

## Emissão solicitada e limites

As 12 parcelas existentes continuam pendentes e sem identidade/transação bancária. Tentativa de acionar o worker canônico pela conexão SQL foi recusada por falta de EXECUTE em get_banese_reconciliation_worker_secret; nenhum HTTP foi enviado por essa tentativa. Não substituir essa restrição por acesso direto ao vault, nova credencial, endpoint auxiliar ou operação bancária escondida em migration. Emissão real permanece pendente de sessão de execução autorizada.

Publicação web 4.8.86 aguarda CI/Preview e conferência final. Dados identificáveis da aluna não integram este registro.
