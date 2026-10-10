# Transferência com curso de destino e cronograma editável

Data: 10/10/2026. Estado: versão 4.8.199/revisão 208 preparada; backend instalado e validado. Continuação da entrega de recebimento externo publicada em 4.8.198; publicação já autorizada pelo usuário. Três agentes reuniram análise de entrada, interface financeira e contrato RPC, com revisão cruzada de datas, identidade e compatibilidade. CI e publicação final são acompanhados no PR do lote.

## Problema reproduzido e aceite

Reprodução autenticada no Safari confirmou que quantidade e condições eram compartilhadas entre os dois ciclos. Alterar 12 para 5 no primeiro ciclo e selecionar o segundo mantinha 5 e exigia justificativa adicional. O rascunho da sessão foi restaurado, sem confirmar recebimento.

- Selecionar cadastro, nosso curso técnico e turma; informar aproveitamentos nas disciplinas da turma. Remover o campo curso de origem.
- Uma tela financeira apresenta todas as cobranças, com valor, vencimento e encargos editáveis, inclusão, exclusão e reordenação; mensalidade pode ser movida explicitamente entre ciclos.
- Configurações de cada ciclo são independentes e começam pelos padrões canônicos da turma. Digitar 150 apresenta 150,00; valores e percentuais respeitam a precisão do contrato.
- Matrícula e rematrícula são opcionais; não exigir justificativa de continuidade do segundo ciclo. Ausência completa de cobranças é permitida na entrada.
- Cronograma individual explícito e imutável é calculado/validado no servidor. Recebimento não emite boletos nem presume pagamentos; emissão continua manual e sequencial por ciclo.
- Cadastro da reprodução permanece sem matrícula até o próprio usuário confirmar seu teste. Nenhum recebimento ou cobrança real integra o smoke.

## Contrato

Versão 3: itens identificados por UUID com ciclo, tipo, ordem, vencimento, valor, desconto, multa e juros. Até 60 mensalidades e uma taxa por ciclo; matrícula pertence ao primeiro, rematrícula ao segundo. Editar um ciclo não redistribui o outro. A ordem não altera datas silenciosamente. Padrões, totais, calendários e numeração são canônicos no servidor; contratos anteriores permanecem compatíveis.

## Manifesto explícito

Manifesto explícito de 47 arquivos. Migrations da versão anterior são imutáveis. Código, testes e documentos respeitam o teto de 500 linhas.

- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferAcademicFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferCycleConfigurator.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferDecimalInput.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferFinancialFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferReview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferScheduleRow.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.client.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-draft.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-due-schedule.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualSetupFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/ciclo-manual-transfer-setup.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-revision.test.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-destination.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-schedule.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-schedule.test.ts`
- `modules/gestor/secretaria/transferencia/SecretariaTransferenciaPage.tsx`
- `modules/gestor/secretaria/transferencia/TransferenciaDestinoPicker.tsx`
- `modules/gestor/secretaria/transferencia/transferencia-destinos.ts`
- `modules/gestor/secretaria/transferencia/transferencia-destinos.test.ts`
- `supabase/functions/_shared/technical-transfer-schedule.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/transfer-installments.test.ts`
- `supabase/migrations/20261010190000_external_transfer_schedule_contract.sql`
- `supabase/migrations/20261010190010_external_transfer_schedule_adjustments.sql`
- `supabase/migrations/20261010190020_external_transfer_schedule_rpc.sql`
- `supabase/migrations/20261010190030_receive_external_transfer_schedule.sql`
- `supabase/migrations/20261010190040_external_transfer_schedule_projection.sql`
- `supabase/migrations/20261010190050_external_transfer_schedule_emission_preview.sql`
- `supabase/tests/external_transfer_schedule.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-transferencia-cronograma-editavel.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
Total: 47 arquivos.

## Limite do smoke nesta rodada

A seleção do cadastro, nosso curso e a turma foi exercitada no Safari isolado. Outra automação concorrente passou a alternar as abas. O usuário instruiu explicitamente: “Conclua o código; testo a tela depois”. A validação visual restante fica com o usuário; testes de contrato, banco e integração seguem obrigatórios. Nenhuma entrada real foi confirmada.

## Resultado e validação

- Nosso curso técnico precede a turma e determina suas disciplinas; curso de origem foi removido. Seletor anterior permanece disponível no repositório para compatibilidade e não participa deste manifesto.
- Lista única mostra valores, vencimentos e encargos por cobrança. Alterar quantidade do C1 preserva o C2; mover mantém datas e identidades; taxa pode ser removida e mensalidade pode mudar de ciclo explicitamente.
- Valores usam apresentação brasileira sem converter 150 em 1,50. Percentuais conservam até seis casas. Configuração por ciclo envia apenas campos alterados; restaurar relê padrões canônicos da turma.
- Padrões históricos avançam para um vencimento permitido mantendo o dia-base; fevereiro não converte dia 31 em 28 permanentemente. Primeiro vencimento explícito é o da primeira mensalidade, sem deslocar a taxa existente.
- Plano vazio permite entrada acadêmica e bloqueia emissão. Segundo ciclo isolado dispensa justificativa adicional, mantendo baseline zero e sem presumir quitação. Emissão posterior preserva cada item do snapshot, taxas opcionais e matrícula LOCAL comprovada.
- 77 testes Node e 29 testes Deno aprovados; ESLint dos 35 arquivos TypeScript/TSX e `tsc --noEmit` passaram. Build completo local aprovado. Auditoria de linhas com registro remoto acrescido apenas deste manifesto passou; alterações paralelas de outro lote não integram a publicação.
- Seis cenários SQL v3 e seis cenários legados v2 passaram antes e depois da instalação em transação com rollback. Cobertura inclui autorização antes de replay, CAS, imutabilidade, revisão por item, C1 LOCAL seguido de C2 independente e projeção por item sem gateway.
- Consulta final confirmou cadastro da reprodução preservado e zero matrículas. Os testes não criaram entrada nem cobranças reais.

## Instalação remota

Supabase `kfekgwyqozhicpfuunpo`, aplicado via MCP na ordem abaixo. Fontes aplicadas são imutáveis.

| Fonte local | Migration remota |
| --- | --- |
| `20261010190000_external_transfer_schedule_contract.sql` | `20261010141630_external_transfer_schedule_contract` |
| `20261010190010_external_transfer_schedule_adjustments.sql` | `20261010141632_external_transfer_schedule_adjustments` |
| `20261010190020_external_transfer_schedule_rpc.sql` | `20261010141635_external_transfer_schedule_rpc` |
| `20261010190030_receive_external_transfer_schedule.sql` | `20261010141637_receive_external_transfer_schedule` |
| `20261010190040_external_transfer_schedule_projection.sql` | `20261010141639_external_transfer_schedule_projection` |
| `20261010190050_external_transfer_schedule_emission_preview.sql` | `20261010141641_external_transfer_schedule_emission_preview` |

Edge `technical-manual-cycle-issuance` v12, ACTIVE, JWT obrigatório preservado. Bundle anterior de 73 arquivos foi relido; apenas `contract.ts` foi ajustado e o validador compartilhado foi acrescentado, conservando as demais dependências. Novo frontend usa RPC v3 após a instalação; contratos anteriores seguem operantes. Registro de manifestos publicado parte da base remota e acrescenta somente este lote, preservando trabalhos locais concorrentes. Publicação atômica: manifesto de 47 arquivos, sem artefatos temporários, dumps ou dados pessoais.
