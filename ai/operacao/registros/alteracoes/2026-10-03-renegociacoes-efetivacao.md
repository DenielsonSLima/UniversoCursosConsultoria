# Renegociações — condições e efetivação Banese

## Escopo e autorização

Em 03/10/2026 o usuário pediu implementar, com três agentes, o cancelamento das
cobranças selecionadas no Banese e a emissão dos boletos substitutos conforme o
acordo. Inclui os ajustes já solicitados de total, periodicidade e revisão.
Mudança crítica financeira. O lote global Proesc permanece intacto.

Implementação e publicação deste lote foram autorizadas explicitamente em
03/10/2026. A autorização não inclui emitir ou cancelar cobranças reais durante
testes, nem contornar uma revisão de segurança do provedor.
O usuário definiu a alçada das condições personalizadas: somente quem já possui
acesso ao Financeiro. A implementação preserva polo, horário e aba Receber
existentes; não exige administrador/global nem inclui usuários somente do Caixa.

## Contrato de aceite

- Mesmos aluno, matrícula, turma e polo; nenhuma fonte fora da seleção.
- Total-alvo e desconto comercial são entradas mutuamente exclusivas. O backend
  calcula abatimentos e preserva entrada + saldo parcelado = total do acordo.
- Mês-calendário permanece distinto de intervalo fixo de 1 a 365 dias.
- Desconto, juros, multa e prazo de recebimento dos títulos novos são congelados
  antes da confirmação. Concessões antigas não são reaplicadas aos novos boletos.
- Operação idempotente e retomável; autorização reaplicada antes de replay.
- Consulta de pagamento e confirmação bancária de baixa precedem substituição.
- Nenhuma emissão nova antes da confirmação de todos os cancelamentos exigidos.
- Resposta ambígua de emissão não autoriza novo POST. Histórico é preservado.
- Sucesso somente com emissão confirmada de todos os títulos; progresso/falha
  parcial não podem ser exibidos como acordo efetivado.
- Exceções financeiras exigem acesso efetivo ao Financeiro no polo, justificativa
  e consentimento explícito separado da confirmação de substituição bancária.
- Ator, data, motivo e fingerprint da aprovação são persistidos no snapshot
  imutável e evento. Retomada mantém a aprovação original e revalida o acesso.

## Manifesto explícito

Total: 81 arquivos.

- `supabase/migrations/20261003153539_receivable_renegotiation_schedule_v2.sql`
- `supabase/migrations/20261003153612_receivable_renegotiation_terms_v2.sql`
- `supabase/migrations/20261003154119_receivable_renegotiation_activation_reads.sql`
- `supabase/migrations/20261003154125_receivable_renegotiation_operational_ui.sql`
- `supabase/tests/receivable_renegotiation_activation_reads.behavior.mjs`
- `supabase/tests/receivable_renegotiation_activation_approval.behavior.mjs`
- `scripts/test-renegociacao-termos-v2.mjs`
- `supabase/functions/banese/internal/renegotiation-billing-instructions.ts`
- `supabase/functions/banese/internal/renegotiation-billing-instructions.test.ts`
- `supabase/functions/banese-boleto-document/index.ts`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-efetivacao.md`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/financeiro-sections.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ActivationConfirmation.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ActivationPanel.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ActivationPanel.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalCards.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalDetail.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoFilters.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoTermsStep.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoActivation.ts`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoTermsForm.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.types.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.model.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.model.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.presentation.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.contract.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.terms-form.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.terms-form.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation.service.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation.service.test.mjs`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation-sequence.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.activation-sequence.test.ts`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.test.mjs`
- `supabase/migrations/20261003153620_receivable_renegotiation_activation_schema.sql`
- `supabase/migrations/20261003153628_receivable_renegotiation_activation_fences.sql`
- `supabase/migrations/20261003153635_receivable_renegotiation_activation_helpers.sql`
- `supabase/migrations/20261003153953_receivable_renegotiation_activation_start.sql`
- `supabase/migrations/20261003154011_receivable_renegotiation_activation_claim.sql`
- `supabase/migrations/20261003154021_receivable_renegotiation_activation_sources.sql`
- `supabase/migrations/20261003154029_receivable_renegotiation_activation_prepare.sql`
- `supabase/migrations/20261003154035_receivable_renegotiation_activation_issuance.sql`
- `supabase/migrations/20261003154110_receivable_renegotiation_activation_finish.sql`
- `supabase/tests/receivable_renegotiation_activation.fixture.sql`
- `scripts/test-renegociacao-activation-sql.mjs`
- `supabase/functions/receivable-renegotiation-activate/cancellation.test.ts`
- `supabase/functions/receivable-renegotiation-activate/cancellation.ts`
- `supabase/functions/receivable-renegotiation-activate/contract.ts`
- `supabase/functions/receivable-renegotiation-activate/dependencies.test.ts`
- `supabase/functions/receivable-renegotiation-activate/dependencies.ts`
- `supabase/functions/receivable-renegotiation-activate/handler.test.ts`
- `supabase/functions/receivable-renegotiation-activate/handler.ts`
- `supabase/functions/receivable-renegotiation-activate/index.ts`
- `supabase/functions/receivable-renegotiation-activate/issuance.test.ts`
- `supabase/functions/receivable-renegotiation-activate/issuance.ts`
- `supabase/functions/receivable-renegotiation-activate/orchestrator.test.ts`
- `supabase/functions/receivable-renegotiation-activate/orchestrator.ts`
- `supabase/functions/receivable-renegotiation-activate/runtime.test.ts`
- `supabase/functions/receivable-renegotiation-activate/runtime.ts`
- `supabase/functions/receivable-renegotiation-activate/test-fixtures.ts`
- `supabase/functions/banese/internal/renegotiation-billing.ts`
- `supabase/functions/banese/internal/renegotiation-billing.test.ts`
- `supabase/functions/banese/core/adapter-creation-capture.test.ts`
- `supabase/functions/banese/core/adapter/boleto-payload.ts`
- `supabase/functions/banese/core/adapter/types.ts`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/banese/core/adapter/boleto-financial-terms.ts`
- `supabase/functions/gateways/router-adapter-runtime.ts`
- `supabase/functions/gateways/boleto/banese.ts`
- `supabase/tests/receivable_renegotiation_activation_edge.behavior.mjs`

Somente estes caminhos pertencem ao lote; artefatos de teste e build ficam fora.

## Validação local concluída

- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`.
- As 13 migrations foram aplicadas via MCP na ordem registrada no ledger. Os SQLs
  locais foram apenas reconciliados aos timestamps remotos, com hashes idênticos;
  nenhuma cobrança foi consultada, cancelada, emitida ou baixada nessa aplicação.
- Smoke pós-DDL somente leitura/rollback confirmou `dependenciesReady=true`, RLS
  ativa, ausência de JWT negada com `42501`, `anon` sem acesso ao start,
  `authenticated` com start e sem claim. Operações de ativação e títulos
  substitutos permaneceram em zero.
- PGlite descartável reproduz campos rejeitados antes do patch e valida termos
  v2, rateio, calendário, entrada integral, fingerprints, save/replay e ausência
  de mutação dos títulos originais durante simulação/salvamento.
- Suíte bancária/adaptador/Edge: 112 testes passaram, incluindo emissão com
  captura durável, consulta após resposta ambígua e preservação do Pix original.
- PGlite aplicou as migrations reais e executou simulação → salvamento → início
  → cancelamento Banese/local simulado → emissão → ACTIVE → pagamento tardio
  → REVIEW_REQUIRED, com os readers públicos e ACLs verificados em cada etapa.
- O bridge executou o orquestrador Edge real contra RPCs reais em PGlite; somente
  banco e preflight foram simulados. POST capturado seguido de falha retomou por
  GET, sem novo POST; replay de ACTIVE não acessou o banco.
- Negativas cobrem fingerprint/ator/lease, aprovação indevida, cronograma vencido
  antes de criar operação, imutabilidade e ausência de novas parcelas antes da
  confirmação de todas as baixas. Pix incompleto não permite ACTIVE; cooldown de
  1 minuto/5 minutos/1 hora e expiração em 7 dias foram exercitados.
- Os três agentes dividiram interface, protocolo SQL e integração bancária.
  Revisão independente apontou imutabilidade pós-emissão e inversão de locks;
  ambos corrigidos e reavaliados sem Critical/Important remanescente nesse escopo.
  NOWAIT faz o worker interromper a tentativa em disputa com pagamento. PGlite
  não substitui ensaio concorrente com múltiplas sessões PostgreSQL.
- Frente UI: 34 testes focados passaram, além de TypeScript e ESLint. A
  coordenação repetiu os 5 testes DOM/serviço de confirmação, reabertura, resumo
  acessível, seleção e transporte; todos passaram.
- Dezoito testes de integração das instruções, compositor nativo e segurança do
  reader passaram. PDF sintético de uma página renderizado e inspecionado;
  aviso de 60 dias, desconto, juros e multa legíveis nas duas vias. Texto extraído
  corretamente; `pdfimages` encontrou somente os logos isolados e suas máscaras.
  Artefatos de ensaio ficam em `/private/tmp`, fora do manifesto.
- `npx tsc --noEmit --pretty false`, `deno check` da Edge/documento e build
  completo passaram. Avisos existentes de chunks grandes/imports mistos não
  foram ampliados para outra frente.
- Manifesto explícito: 81 arquivos, todos com até 500 linhas físicas.
- `npm run check:file-lines` global continuou falhando pelas mesmas 14 referências
  a manifestos/arquivos ausentes de lotes anteriores. Não houve alteração dessa
  governança nem inclusão de arquivos alheios para esconder a pendência.
- Ativação foi validada com banco simulado, não com títulos de alunos reais.
- Smoke visual autenticado não autorizado nesta etapa; dispensa anterior do
  usuário permanece respeitada. Testes DOM não serão descritos como smoke visual.

## Alçada Financeiro — validação incremental

- Regra definida pelo usuário, sem novo cargo: identidade ativa, acesso ao módulo
  Financeiro/Receber e polo autorizado, respeitando o horário existente.
- Aprovação humana exige JWT autenticado. Credencial de serviço não aprova,
  mesmo com sub preenchido; as etapas internas usam as RPCs de lease existentes.
- Backend é autoridade. Um booleano enviado pelo cliente representa consentimento,
  não permissão; ausência significa false e valores não booleanos são rejeitados.
- GET retorna somente o indicador aprovado, sem snapshot bancário/credenciais.
  Ao reabrir, a retomada usa o indicador, a chave e o CAS originais.
- Coordenação repetiu 28 testes UI/modelo/serviço/contrato e 36 testes Edge;
  todos passaram, assim como TypeScript, ESLint focado e `deno check` da Edge.
  Sem alterar cálculos nem executar operação bancária real.
- PGlite repetido pela coordenação e revisão independente: PASS. Acesso local ao
  Financeiro autoriza sem cargo global/admin; Caixa-only, ausência de módulo,
  polo divergente, identidade/horário negados, Receber revogado, uid ausente e
  service_role (inclusive com sub válido) bloqueiam início e replay sem mutação.
  Identidade/horário são mocks da função efetiva; não é ensaio do scheduler real.
- Consentimento falso não consome a chave; alterar true para false após iniciar
  falha por hash divergente. Auditoria, hash do snapshot, indicador no GET e
  ausência de grants diretos do helper foram conferidos. Revisão dos três agentes
  concluída sem Critical/Important remanescente no ajuste da alçada.
- `git diff --check` do escopo passou. Nova auditoria do manifesto: 81 arquivos
  dentro do teto. Checagem global mantém somente as 14 ausências já registradas.

## Limites e próxima etapa

- Não houve alteração de fontes do corpus RAG neste lote; caches não pertencem
  ao manifesto. LOTE_ATIVO, memória, AGENTS e mudanças paralelas foram preservados.
- A publicação foi autorizada e o DDL está aplicado. Depois de novo pedido
  explícito do usuário para produção, o mesmo payload foi reenviado e o Guardian
  voltou a negar o envio da ativação pelo limite de 200.000 bytes. O reader não
  foi reenviado. O limite não foi liberado; a ativação segue ausente e o reader na
  v21 anterior. Nenhuma função foi implantada e o bloqueio não será contornado.
- O código será preservado em branch/PR de revisão, sem merge em produção até
  liberar e conferir as funções. Não promover frontend isolado nem confundir DDL
  aplicado com fluxo bancário disponível.
- Pacotes Edge verificados preservam o fence de criação da main remota
  `2560f4b70567687ad62baddcc9b97ba7490ea273`, sem sobrescrever a divergência local.
  Supabase JS fixado em 2.95.3 nos dois entrypoints; 122 testes passaram no pacote.
- Ordem das abas: Resumo, A Receber, A Pagar, Renegociações; Conciliação permanece
  ao final. Cinco testes de navegação e 36 do fluxo passaram, além do build local
  4.8.160/revisão 169. A CI deve validar o manifesto sobre a base remota, pois o
  build local também vê alterações paralelas preservadas.
- A primeira CI remota do PR 249 passou teto, preservação de migrations,
  contrato operacional e TypeScript, mas parou no lint antes dos testes/build:
  seis `no-undef` em cinco arquivos (`structuredClone` e `HeadersInit`). A correção
  apenas qualificou APIs do runtime/tipos, sem alterar semântica ou configuração.
- Validação exata da correção: ESLint focado nos cinco arquivos com a configuração
  byte a byte igual à main remota (blob `29e8781da9ee96dbea6c9bd5e638ee2d7b59f94f`),
  `deno check` dos mesmos cinco e `deno test --allow-read --allow-env` dos quatro
  testes afetados: 20 passaram, zero falhou. A CI remota ainda precisa repetir o
  manifesto; não houve novo build global local.

Estado: implementação e validação local concluídas; 13 migrations aplicadas com
conteúdo imutável. A correção do lint aguarda nova CI remota; Edge e publicação de
produção aguardam revisão de segurança.
Sem deploy de função, cancelamento, emissão ou baixa real neste lote.
