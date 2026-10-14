# Carnê avulso em três etapas

Data: 2026-10-13. Estado: EM_PUBLICACAO_PRODUCAO. Publicação autorizada explicitamente pelo usuário em 13/10/2026. Versão 4.8.217/revisão226.

## Objetivo e aceite

Pedido: reorganizar o carnê de Outros Créditos em dados, financeiro editável e revisão.

- Dados: pagador, categoria e descrição.
- Financeiro: mensal no mesmo dia ou a cada 30 dias corridos; lista com valor e vencimento editáveis por parcela; matrícula/rematrícula com datas próprias; juros/multa/desconto próprios para parcelas, matrícula e rematrícula.
- Revisão: identidade, periodicidade, cobranças e totais canônicos; criar apenas na terceira etapa, com prévia atual.
- Voltar preserva os ajustes. Mudar a base do gerador refaz o cronograma; as taxas são entradas independentes.
- A RPC calcula valores, datas, termos e descontos por cobrança. Replay legado mensal é preservado; a tentativa incerta mantém a chave e o payload.

## Manifesto explícito

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-13-outros-creditos-tres-etapas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanFinancialForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanTermsFields.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanPreview.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanSchedule.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanWizard.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanModal.tsx`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPlan.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.types.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.model.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan-attempt.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.test.tsx`
- `supabase/migrations/20261014010500_other_credit_plans_schedule.sql`
- `supabase/functions/gateways/api/banese-other-credit-financial-terms.ts`
- `supabase/functions/other-credit-carnet-document/document-policy.test.ts`
- `supabase/tests/other_credit_plans.schedule.test.mjs`
- `supabase/tests/other_credit_plans.isolated.test.mjs`
- `supabase/tests/other_credit_plans.banese.test.mjs`

Total: 23 arquivos.

## Validação

- Reprodução antes do patch: sessão autenticada no Safari confirmou o formulário único e apenas cronograma mensal. Leitura MCP do helper remoto reproduziu 22023 ao enviar periodicidade nova.
- Interface: 19 testes focados de dados, etapas, payload personalizado, limites, comparação de replay, recuperação/retomada e condições independentes por tipo de cobrança.
- Banco: três ensaios PostgreSQL/WASM com fixtures sintéticas, sem conexão Supabase ou bancária. Cronograma 30 dias, calendário mensal, parcelas personalizadas, desconto por parcela, termos, autorização, atomicidade e replay passaram.
- Contratos de emissão/documento: 14 testes Deno com typecheck. O texto vetorial do compositor nativo comprova descontos e encargos diferentes nos três tipos, e o adapter continua recusando snapshot/termos confirmados divergentes.
- PDF nativo sintético extraído/renderizado conferido: descontos de matrícula 10% (R$90), rematrícula R$5,01 (R$94,99) e parcela R$20 (R$280); multa/juros próprios presentes. Recursos raster limitados a logos/máscaras isoladas. Artefatos em /tmp, fora do lote.
- TSC sem emissão aprovado. Revisão independente da integração SQL/frontend concluída; comparação incorreta de desconto com base já corrigida.
- Smoke Safari com hook/componentes reais e RPCs PostgreSQL/WASM isoladas: 3 parcelas, matrícula em 20/10 separada de primeira parcela 13/10, parcela 2 alterada para 18/11 e R$150, parcela 3 para R$160. Revisão confirmou nominal R$470. Voltar preservou as edições.
- Smoke móvel 390×926: seleção de pagador, financeiro, edição individual e revisão nominal R$225 com parcelas R$100/R$125. Fieldsets com min-w-0 corrigem overflow externo; tabela mantém rolagem horizontal própria. Indicador e rodapé conferidos visualmente.
- Smoke dos três grupos no Safari concluído em harness com componentes reais e SQL sintético: nominal R$300 e pontualidade R$270. Matrícula R$38 (juros0,5%/multa1%), rematrícula R$52 (3%/4%) e parcelas R$90 cada (1%/2%); prazos 19/01,18/03,28/01 e26/02. Screenshot conferido e voltar/reabrir os grupos preservou todos os valores e total270. Nenhuma cobrança criada/emitida.
- Manifesto inteiro abaixo de 500 linhas físicas por arquivo. Caches/harnesses em tmp não pertencem ao lote.

## Risco e entrega remota

A migration nova estende o helper calculador existente. Taxas com `condicoes` recebem juros, multa e desconto próprios; ausência preserva encargos globais e ausência de desconto do legado. A criação/replay compara payload canônico completo. O adapter remove apenas a proibição de desconto para taxas, usando o snapshot imutável e mantendo guardas de identidade e drift. RPCs, autorização e compositor PDF mantêm o contrato. Migrations aplicadas anteriores são imutáveis.

Histórico remoto consultado por MCP: calculador/RPCs anteriores aplicados; helper permanece sem os campos novos. Aplicar `20261014010500_other_credit_plans_schedule.sql` via MCP e atualizar `asaas-api` e `other-credit-carnet-document` antes de publicar o frontend: ambos os bundles importam o adapter alterado. Usuário autorizou aplicação e atualização do GitHub/produção em 13/10/2026.

Backend aplicado e conferido em produção; pendem publicação do frontend e smoke autenticado da versão nova no domínio oficial, incluindo edição dos encargos próprios. Nenhuma cobrança real criada ou emitida. Versão/changelog preparados para 4.8.217/revisão226. O manifesto incremental preserva também o registro já publicado do contrato financeiro individual.

## Aplicação em produção — 13/10/2026

- Autorização explícita: aplicar e atualizar GitHub/produção deste lote.
- Projeto confirmado: UniversoCursoseConsultoria (`kfekgwyqozhicpfuunpo`), ACTIVE_HEALTHY.
- Migration: fonte local `20261014010500_other_credit_plans_schedule.sql`, ledger remoto `20261014011056`, nome `other_credit_plans_schedule`; readback idêntico e hash do helper `8ba41be6eca1d4ecc6a20b54ab1a6672`.
- `asaas-api` v104 e `other-credit-carnet-document` v2 ACTIVE, JWT obrigatório; readbacks íntegros 111/111 e 26/26 arquivos. Bundles remotos preservados e somente helper autorizado alterado. Dois suplementos exclusivamente de tipos da API, omitidos pelo extrator, foram mantidos no empacotamento.
- Postgres real confirmou mensal, 30 dias, parcelas personalizadas e três condições diferentes. Exemplo sintético: nominal R$556,00 e com desconto R$505,99. Zero planos sintéticos persistidos e nenhum boleto emitido. Prévia sem autenticação recusada com 42501; RPCs/grants preservados.
- Build completo da versão 4.8.217 aprovado. O manifesto atual foi auditado e todos os 23 arquivos estão abaixo de 500 linhas.
- A registry de publicação conserva o manifesto já presente em main do contrato individual. O checker geral local identifica 21 fontes daquela entrega anterior ausentes neste checkout; a validação completa será executada pelo CI sobre a árvore remota, preservada pelo commit deste lote.

## Validação do candidato GitHub

PR311 restrita aos 23 arquivos do manifesto. Preview do candidato READY. O CI confirmou teto/migrations preservadas e TypeScript na árvore remota completa; encontrou somente quatro erros no-undef de tipos/utilitários no lote. Corrigidos por referência React.ComponentRef, clone JSON no teste e import explícito TextDecoder de node:util. Lint focado e regressões novamente executados; candidato final mantém um commit de produto.
