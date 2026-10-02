# Proesc V2 — conferência, abertura e publicação 4.8.149

Estado: BACKEND APLICADO; FRONTEND VALIDADO PARA PUBLICAÇÃO AUTORIZADA.
Base GitHub conferida: `22d563b3c5e61becc1e5ba78b878ec2c337b93d1` (4.8.148).
PR240 contém este manifesto; produção somente após CI e Preview aprovados.
O status final de build/deploy deve ser conferido no GitHub/Vercel; este registro
não transforma preparação local em publicação comprovada.

## Escopo e aceite

- Publicar a migração V2 e as correções anteriores ainda locais, preservando o
  lote independente de layout Caixa já publicado.
- Abertura zero nos quatro polos em 01/10; histórico e ajustes antigos intactos.
- Japoatã: recebido 1.300,00, desconto identificado 79,60, uma diferença -19,90.
  Porto: recebido 260,00, desconto 19,90; Aquidabã/Propriá sem recebimentos.
- Subtotal conhecido aparece mesmo com componente desconhecido em outro
  movimento. Parcial não vira completo e desconhecido não vira zero.
- Identificação calculada automática somente para pagamentos pontuais desde
  01/10 nas três regras T43/T44/T45 homologadas, com identidade V2 e fechamento
  exato. Preservar cinco aprovações, nove candidatos de setembro e atraso excluído.
- Não criar receita, despesa, tarifa, cancelamento ou saldo residual por inferência.

## Investigação real e limites

32 GETs V2 HTTP200: 27 pessoa/período para pendências, quatro pessoas e uma
parcela atrasada. As 25 ausentes continuam vazias com paginação completa; duas
continuam PAGAMENTO PARCIAL, sem saldo residual comprovado. Todas são Proesc:
Japoatã 11, Aquidabã 9, Porto 7. As três mensais estão dentro dessas 27.
Treze possuem flag de cancelamento histórico por parcela, sem data efetiva
homologada; as outras 12 ausentes não possuem essa prova.

Seis GETs dirigidos a `/enrollment-financials` retornaram HTTP401, acesso não
permitido, embora Pessoas/Parcelas respondam com o mesmo token. Não foi
reativada V1. A lista individual ficou fora do GitHub/RAG, sem nomes/CPF.

Atrasado de setembro pago em outubro: V2 confirma 260,00, nominal279,90,
desconto fixo19,90 e pontualidade19,90 configurados; descontos específicos zero.
Não há composição aplicada nem dispensa de juros/multa; regra homologada
retornaria288,30. Permanece conferência da composição, não da quitação.

Extratos enviados pelo usuário mostram tarifaProesc3,97 sobre bruto260,00 e
líquido256,03. A V2 consultada não trouxe essa tarifa aplicada nem foi localizado
endpoint público V2 de extrato/tarifas. Não criar despesa fixa indiscriminada.
Data de liberação/saque é distinta da data de pagamento.
Foram removidas somente as38respostas temporárias pg_net desta conferência,
após extração minimizada; fatos financeiros e evidências duráveis permanecem.

## Alterações atuais e auditoria

- Migration11200 aplicada MCP como `20261002023538`: três políticas privadas
  por turma/origem/revisão/fingerprint, helper limitado e ramo calculado existente.
- Migration11300 aplicada MCP como `20261002023541`: somar somente juros,
  multa, acréscimo e desconto conhecidos; null quando todos desconhecidos.
  Preservar zero sem movimentos, autorização e conciliação incondicional de
  total/quantidade. Equação de componentes completa permanece estrita.
- RPC real de outubro confirma Japo1300/79,60, Porto260/19,90 e
  consolidado1560/99,50; diferença global-19,90 e um movimento parcial.
- Setembro: saldo operacional zero nos quatro polos e consolidado;
  outubro1300/260/0/0. Nenhum pagamento/data/principal alterado.
- Fingerprints iguais antes/depois: 6.958recebíveis, 6contas, 4despesas e
  471matrículas. RLS/ACL privados; owners/search_path da RPC preservados.
- Advisors: mesma família de cinco avisos; um item informativo adicional de RLS
  sem política corresponde à nova tabela privada, sem grants a clientes/serviço.
  Não foram abertas permissões para eliminar esse aviso.

## Validação

- Build4.8.149 e TypeScript completos aprovados; avisos preexistentes de chunks.
- Caixa: 134testes,132passaram,2ignorados já condicionais; inclui regressões de
  fechamento operacional e subtotais parciais no contrato/compositor nativo.
- Configuração/console V2:24testes aprovados em revisão independente.
- SQLPGlite112:22guardas e chegada futura de novo pagamento compatível,
  preservação das cinco aprovações/nove históricos e bloqueio do atraso.
- SQLPGlite113: componentes conhecidos/desconhecidos, mais300movimentos,
  totals/counts, guarda completa, escopo/ACL e fatos intactos.
- PDFfixture nativo: recursos isolados, texto extraível e páginas de resumo/
  implantação/parcialidade renderizadas sem sobreposição. Não é exportação
  institucional real autenticada. Sem abrir navegador no fluxo Proesc, conforme
  preferência do usuário; smoke autenticado final permanece pendente.
- Verificador global local encontra14referências ausentes anteriores; o checkout
  completo do CI aprovou o teto de linhas e a imutabilidade das migrations.
- Migrations aplicadas anteriores são imutáveis; nenhuma reescrita.
- Primeiro CI do PR240 bloqueou bootstrap21942bytes e RAG164trechos; Preview
  aprovada. Corrigido o roteamento documental, sem alterar limites/testes:
  memória histórica resume e aponta registros intactos; decisão V2 aponta skill
  e referências completas fora do corpus padrão. Novo índice de fechamento:
  15fontes/79trechos, bootstrap15084bytes, busca41ms sem escrita. A correção
  documental exige nova execução CI/Preview antes de incorporar o PR.
- Reconferência remota: runtimes V1 de sincronização/ciclos desabilitados, V2
  habilitada; execução RECENT concluída às23h52 BRT. Controlador:19testes
  aprovados, incluindo HTTP410 das ações V1 sem chamada ao fornecedor.

## Manifesto explícito

Total: 93 arquivos.

- `supabase/functions/proesc-api/contract.ts`
- `supabase/functions/proesc-api/contract.test.ts`
- `supabase/functions/proesc-api/diagnostic-invoices.test.ts`
- `supabase/functions/proesc-api/v2-invoices.ts`
- `supabase/functions/proesc-api/v2-invoices.test.ts`
- `supabase/functions/proesc-api/v2-people.ts`
- `supabase/functions/proesc-api/v2-sync-worker.ts`
- `supabase/functions/proesc-api/v2-sync-worker.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/handler-sync-coordination.test.ts`
- `supabase/functions/proesc-api/connections.ts`
- `supabase/functions/proesc-api/operations.ts`
- `supabase/functions/proesc-api/versioned-connections.test.ts`
- `supabase/migrations/20261002010000_proesc_v2_ingestion_schema.sql`
- `supabase/migrations/20261002010100_proesc_v2_observation_validation.sql`
- `supabase/migrations/20261002010200_proesc_v2_financial_projection.sql`
- `supabase/migrations/20261002010300_proesc_v2_persistent_runtime.sql`
- `supabase/migrations/20261002010400_proesc_v2_worker_and_cycle_readers.sql`
- `supabase/migrations/20261002010500_proesc_v2_monitor_runtime.sql`
- `supabase/tests/proesc_v2_runtime.isolated.test.mjs`
- `supabase/migrations/20261002010600_proesc_v2_cycle_payload_compat.sql`
- `supabase/tests/proesc_v2_cycle_payload.isolated.test.mjs`
- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescConnectionCard.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `modules/gestor/configuracoes/proesc/proesc.service.test.mjs`
- `modules/gestor/configuracoes/proesc/ProescConfig.test.mjs`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescConsoleOverview.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ConsultaApiProescConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescOperationsFeed.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.types.ts`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.test.tsx`
- `ai/operacao/integracoes/proesc/SKILL.md`
- `ai/operacao/integracoes/proesc/INDEX.md`
- `ai/operacao/integracoes/proesc/agents/openai.yaml`
- `ai/operacao/integracoes/proesc/references/guia-v1-v2.md`
- `ai/operacao/integracoes/proesc/references/contratos.md`
- `ai/operacao/integracoes/proesc/references/diagnostico-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/conferencia-t42-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/conciliacao-t42.md`
- `ai/operacao/integracoes/proesc/references/historicos/guia-v1-v2.md`
- `ai/operacao/integracoes/proesc/references/historicos/contratos.md`
- `ai/operacao/integracoes/proesc/references/historicos/diagnostico-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/historicos/conferencia-t42-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/historicos/conciliacao-t42.md`
- `ai/operacao/integracoes/proesc/references/v2-operacional.md`
- `ai/operacao/integracoes/proesc/references/v2-fontes-2026-10-01.md`
- `ai/operacao/integracoes/proesc/references/v2-evidencia-setembro-2026.md`
- `ai/operacao/integracoes/proesc/references/v2-mapa-migracao.md`
- `docs/decisions/proesc-v2-operacional.md`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-operacional.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/rag/manifesto.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `supabase/migrations/20261002010700_proesc_opening_cutover.sql`
- `supabase/migrations/20261002010800_proesc_v2_calculated_composition.sql`
- `supabase/tests/proesc_opening_cutover.isolated.test.mjs`
- `supabase/tests/proesc_v2_calculated_composition.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-virada-composicao.md`
- `supabase/migrations/20261002010900_proesc_all_polos_opening.sql`
- `supabase/migrations/20261002011000_proesc_porto_composition_approval.sql`
- `supabase/migrations/20261002011100_proesc_operational_closing_presentation.sql`
- `supabase/tests/proesc_all_polos_opening.isolated.test.mjs`
- `supabase/tests/proesc_porto_composition_approval.isolated.test.mjs`
- `supabase/tests/proesc_operational_closing_presentation.isolated.test.mjs`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/caixa.contracts.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/caixa-fechamento-implantacao.presentation.ts`
- `modules/gestor/caixa/components/CaixaStructuralOverview.tsx`
- `modules/gestor/caixa/components/CaixaFlowHero.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.ts`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/caixa-report.pagination.ts`
- `modules/gestor/caixa/report/caixa-report.fixture.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/caixa/report/caixa-report.fechamento-implantacao.test.tsx`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-todos-polos-encerramento.md`
- `supabase/migrations/20261002011200_proesc_v2_automatic_early_composition.sql`
- `supabase/migrations/20261002011300_caixa_composition_known_subtotals.sql`
- `supabase/tests/proesc_v2_automatic_early_composition.isolated.test.mjs`
- `supabase/tests/caixa_composicao_mensal.isolated.test.mjs`
- `modules/gestor/caixa/caixa-composicao.presentation.ts`
- `modules/gestor/caixa/components/CaixaCompositionCards.tsx`
- `modules/gestor/caixa/components/CaixaCompositionCards.test.tsx`
- `modules/gestor/caixa/report/caixa-report.composicao-parcial.test.tsx`
- `scripts/test-caixa-report.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md`

## Registros anteriores

- [Migração V2](2026-10-01-proesc-v2-operacional.md).
- [Abertura inicial/composição](2026-10-01-proesc-v2-virada-composicao.md).
- [Abertura dos demais polos e PDF](2026-10-01-proesc-todos-polos-encerramento.md).
