# Prévia detalhada do boleto no ciclo técnico manual

Data: 2026-09-01
Estado: backend aplicado; frontend autorizado para produção; smoke visual delegado

## Objetivo

Permitir que o gestor confira, antes da emissão, a mesma composição financeira
visível no boleto Banese. Cada cobrança será apresentada em duas faixas nas
etapas Composição e Revisão.

## Diagnóstico da reunião técnica

- A prévia atual entrega valor nominal, vencimento, desconto fixo, juros e
  multa percentuais, instrução e flags de aplicação.
- O payload não entrega por item o valor em dia, a multa monetária, o juro
  diário nem as datas de aplicação.
- Calcular esses valores no React violaria a política financeira e poderia
  divergir do PDF.
- O backend já possui `internal_academic.technical_financial_simulation`, que
  produz os valores monetários com a regra canônica.

## Solução

- Uma migration futura estende a prévia por item com `detalhesBoleto` antes do
  cálculo de `cronogramaFingerprint`.
- Cada detalhe inclui as três linhas acadêmicas do boleto: descrição,
  identificação da turma e instrução integral normalizada.
- O parser puro do frontend falha fechado quando o objeto está ausente,
  inválido ou financeiramente incoerente.
- Um componente compartilhado renderiza a faixa principal e a faixa de termos
  nas etapas Composição e Revisão.
- O React só formata moedas, percentuais e datas recebidos; não contém fórmula
  de desconto, multa ou juros.
- A migration executa uma autoverificação SQL transacional da mensalidade T42,
  rematrícula e flags de encargos desligadas antes de concluir.

## Valores de referência

- Mensalidade: nominal R$ 279,90; desconto R$ 19,90; em dia R$ 260,00; multa
  de 2% = R$ 5,60; juros de 2% ao mês = R$ 0,19 ao dia.
- Rematrícula: nominal/em dia R$ 100,00; sem desconto; multa de 2% = R$ 2,00;
  juros de 2% ao mês = R$ 0,07 ao dia.

## Limites

- A aplicação remota e a publicação foram autorizadas explicitamente pelo
  usuário em 2026-09-01; a conferência visual autenticada será feita por ele.
- O ajuste não cria, emite, altera ou concilia títulos Banese.
- O PDF oficial permanece inalterado e serve como referência de apresentação.

## Validação local

- 61 testes focados aprovados: modal e wizard, parser da prévia, contrato SQL,
  termos financeiros Banese/PDF e instruções do boleto técnico.
- TypeScript global, ESLint focado e formatação Deno aprovados.
- Build Vite isolado aprovado com 3.958 módulos transformados.
- `npm run check:file-lines` aprovado; todos os arquivos deste lote permanecem
  abaixo de 500 linhas.
- Revisão independente final aprovada sem achados críticos ou importantes.
- O smoke visual autenticado nas etapas 2 e 3 permanece pendente porque não há
  sessão de gestor conectada ao navegador de teste; o usuário assumiu essa
  conferência manual depois da publicação.

## Validação remota

- Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`.
- Migration registrada como `20260902013930` com o nome
  `expose_manual_cycle_boleto_preview_details`.
- Checagem sintética pós-aplicação confirmou mensalidade nominal de R$ 279,90,
  valor em dia de R$ 260,00, desconto de R$ 19,90, multa de R$ 5,60 e juros de
  R$ 0,19 ao dia.
- A mesma checagem confirmou rematrícula de R$ 100,00 sem desconto, multa de
  R$ 2,00 e juros de R$ 0,07 ao dia, com três mensagens de boleto por item.
- A função auxiliar permanece sem permissão de execução para `anon`,
  `authenticated` e `service_role`.

## Manifesto explícito

Total: 15 arquivos

- `ai/operacao/registros/alteracoes/2026-09-01-previa-detalhada-boletos-ciclo-tecnico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-08-22-a-2026-08-23.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualChargeRows.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-modal-ux.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `supabase/migrations/20260902013930_expose_manual_cycle_boleto_preview_details.sql`
- `supabase/tests/manual_technical_cycle_boleto_preview_details.contract.test.ts`
