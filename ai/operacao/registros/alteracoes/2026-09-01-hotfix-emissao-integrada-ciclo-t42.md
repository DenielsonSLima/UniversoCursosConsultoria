# Hotfix de emissão integrada do ciclo manual da Turma 42

Data: 2026-09-01
Estado: publicação concluída em produção

## Objetivo

Substituir o contrato publicado de geração local seguida por emissão manual por
recebível. A confirmação final do ciclo passa a criar/reutilizar os recebíveis,
emitir todos os BolePix Banese e concluir somente após validar os artefatos
bancários oficiais.

## Diagnóstico confirmado

- A regra efetiva remota da Turma 42 possui juros de 2% e multa percentual de
  0%; a matrícula da Adryelle não possui override ativo.
- A aluna está elegível e ainda não possui recebível do segundo ciclo.
- A prévia atual monta corretamente 1 rematrícula de R$ 100,00 e 12
  mensalidades de R$ 279,90, totalizando R$ 3.458,80.
- O fluxo publicado para após a criação local e exige uma segunda ação no
  Financeiro.
- O trigger de INSERT recompõe o snapshot e remove o contexto `cicloManual`.
- O resolver Banese relê a regra viva em vez de usar o snapshot técnico.
- A persistência genérica atual atualiza o recebível antes de gravar a
  transação, permitindo estado parcial em falha intermediária.

## Contrato substituto

- Uma ação humana inicia uma saga durável e sequencial com 13 itens.
- Reexecução retoma itens incompletos e reutiliza os títulos completos.
- Estado ambíguo é conciliado por consulta; nunca autoriza outro POST.
- Snapshot técnico v2 guarda multa percentual e valor derivado.
- Snapshot v1 permanece compatível como multa fixa congelada.
- A finalização de cada item persiste recebível e transação no mesmo commit.
- O ciclo só fica completo com os 13 BolePix integralmente validados.

## Valores de aceite

- Rematrícula: R$ 100,00, sem desconto, juros de 2% ao mês e multa única de 2%
  (R$ 2,00).
- Mensalidades: R$ 279,90, desconto de R$ 19,90 até o vencimento, juros de 2%
  ao mês e multa única de 2% (R$ 5,60).
- Total nominal: R$ 3.458,80; encargos de atraso não integram o total antes do
  vencimento.

## Limites de segurança

- Nenhum POST bancário será usado em diagnóstico ou teste local.
- Títulos existentes da Adenize permanecem imutáveis.
- Produção, GitHub remoto e deploy foram autorizados em 01/09/2026; o smoke
  técnico não emitirá títulos reais em nome da aluna.

## Manifesto explícito

Total: 48 arquivos

### Interface

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`

### Backend Banese

- `supabase/config.toml`
- `supabase/functions/banese/core/adapter-create-pix.test.ts`
- `supabase/functions/banese/core/adapter/boleto-pix-response.ts`
- `supabase/functions/gateways/api/banese-financial-terms.test.ts`
- `supabase/functions/gateways/api/banese-financial-terms.ts`
- `supabase/functions/gateways/checkout/gateway-creation-fence.test.ts`
- `supabase/functions/gateways/checkout/gateway-creation-fence.ts`
- `supabase/functions/gateways/checkout/remote-title-guard.test.ts`
- `supabase/functions/gateways/checkout/remote-title-guard.ts`
- `supabase/functions/gateways/checkout/remote-title-review.test.ts`
- `supabase/functions/gateways/router-adapter-runtime.ts`
- `supabase/functions/gateways/router.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/financial-terms.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/financial-terms.ts`
- `supabase/functions/technical-manual-cycle-issuance/index.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-state.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-state.ts`
- `supabase/functions/technical-manual-cycle-issuance/recovery-policy.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/recovery-policy.ts`

### Banco

- `supabase/migrations/20260901120600_fix_t42_penalty_and_technical_snapshot_v2.sql`
- `supabase/migrations/20260901120650_prepare_integrated_manual_cycle_banese.sql`
- `supabase/migrations/20260901120675_validate_integrated_manual_cycle_banese_terms.sql`
- `supabase/migrations/20260901120700_persist_integrated_manual_cycle_banese.sql`
- `supabase/migrations/20260901120705_allow_banese_api_review_state.sql`
- `supabase/migrations/20260901120708_add_manual_cycle_banese_settlement_fence.sql`
- `supabase/migrations/20260901120710_resume_and_fail_integrated_manual_cycle_banese.sql`
- `supabase/migrations/20260901120715_distinguish_manual_cycle_banese_review_state.sql`
- `supabase/tests/manual_technical_cycle_banese_atomic.contract.test.ts`

### Operação

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-01-hotfix-emissao-integrada-ciclo-t42.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`

## Validação concluída

- Backend/Banese: 225 testes aprovados.
- Fence e estado terminal `API_REVIEW`: 37 testes aprovados.
- Interface: 35 testes boleto/Pix e 21 testes do ciclo aprovados.
- `deno check`, `npx tsc --noEmit`, ESLint focado e build aprovados.
- Revisão cruzada confirmou termos canônicos antes do único POST, emissor
  Matriz, QR derivado do EMV, persistência atômica e retomada sem reemissão.
- Testes focados confirmaram que `API_REVIEW` exige revisão manual sem CTA/POST,
  enquanto `API_AMBIGUOUS` permanece retomável e não bloqueia outros itens.
- As oito migrations foram aplicadas via MCP; a compilação real do PostgreSQL
  exigiu agrupar uma expressão `CASE` e trocar o alias reservado
  `authorization`, sem alterar a regra financeira.
- O pós-check remoto confirmou a Turma 42 em revisão 3 com multa de 2%, todos
  os objetos/grants válidos e ausência de estados `CREATING` ou duplicidades.
- A Edge `technical-manual-cycle-issuance` está ativa na versão 1 com JWT
  obrigatório e closure local completa.
- A matrícula-alvo permaneceu elegível e intocada: zero run, recebível,
  autorização ou transação do ciclo 2; prévia de 13 itens e R$ 3.458,80.

## Evidência de publicação

- PR #114 integrado por squash em `main` no commit
  `d5f0e5abd6706080c0aeac36ba3c94e883751f1f`.
- Controle de versão `33572042927` e qualidade `33572042926` aprovados no PR.
- Preview Vercel `2JtHczdVAoqtre8n1QH2hNW9Bodh` concluída com sucesso.
- Pipeline da `main` `33572239860`, incluindo regressões BolePix e build,
  concluído com sucesso.
- Produção Vercel `4FWnRv9kZtckssbwX29ZynhQcGm3` pronta; o domínio respondeu
  HTTP 200 após a promoção.
- O runtime não possuía navegador autenticado conectado. O smoke permaneceu
  não destrutivo: pós-check Supabase e HTTP foram executados, sem acionar a
  confirmação final da Adryelle e sem criar cobrança, título ou transação.

## Hotfix complementar de 02/09/2026

- Duas tentativas reais do ciclo técnico falharam no preflight com o escopo
  completo presente, antes da criação de recebíveis e antes de qualquer POST ao
  Banese. O checkout EAD no mesmo período emitiu BolePix completo, confirmando
  que credencial, rota bancária, PDF e Pix estavam operacionais.
- A causa foi a aplicação indevida da regex RFC de IDs novos ao `polo_id`
  legado já aceito pela coluna PostgreSQL `uuid`. A correção separa IDs
  persistidos de `requestId`: banco usa o formato estrutural `8-4-4-4-12`, e o
  token idempotente preserva versão e variante RFC estritas.
- A proteção foi aplicada ao preflight, contexto de retomada, recebíveis e
  emissor retornado pelo Banese para evitar que a falha apenas mudasse de etapa
  depois do primeiro título.
- Os 22 testes focados, `deno check`, teto de 500 linhas e revisão independente
  foram aprovados. Não houve migration nem alteração em valores, juros, multa,
  desconto, payload bancário ou autorização.
- A Edge `technical-manual-cycle-issuance` foi publicada via MCP na versão 2,
  permanece `ACTIVE` e exige JWT. O bundle remoto relido corresponde aos dois
  arquivos de runtime validados.
- O smoke bancário final permanece reservado ao clique explícito do gestor;
  nenhum título real foi emitido durante o hotfix.

## Hotfix pós-criação local de 02/09/2026

- A tentativa real seguinte criou atomicamente o run e os 13 recebíveis, mas
  parou em `0/13` antes do primeiro claim e antes do adapter Banese.
- Os logs Postgres dos três disparos confirmaram SQLSTATE `42703`: o carregador
  técnico consultava `parceiros.estado`, enquanto o cadastro canônico possui
  somente `parceiros.uf`. O EAD não reproduzia a falha porque usa outra projeção
  do pagador e só depois converge no mesmo adapter Banese.
- A projeção técnica agora usa exclusivamente `uf`. A mensagem parcial extrai
  os campos estruturados do PostgREST e possui fallback textual que nunca rende
  `[object Object]`.
- A perícia remota comprovou 13 recebíveis `LOCAL_CREATED`, 13 pendentes, zero
  token de criação, submissão, Nosso Número, identidade remota, linha digitável,
  código de barras, Pix ou transação; a retomada não possui título para duplicar.
- Os 13 snapshots foram reconstruídos pela função canônica: rematrícula de
  R$ 100,00 sem desconto e 12 mensalidades de R$ 279,90 com desconto de
  R$ 19,90, juros de 2% e multa de 2%. Valor e vencimento coincidem em todos os
  itens, e o pagador possui os campos obrigatórios do payload Banese.
- Foram aprovados 24 testes focados, `deno check`, formato, teto de 500 linhas e
  duas revisões independentes sem achados. A Edge foi relida em produção na
  versão 3, `ACTIVE`, com JWT obrigatório e os três arquivos corrigidos.
- O gestor autorizou concluir os títulos já existentes. A execução autenticada
  permanece pendente porque nenhuma sessão de navegador está conectada a este
  agente; não foi criado atalho de serviço nem removida a auditoria do ator.
