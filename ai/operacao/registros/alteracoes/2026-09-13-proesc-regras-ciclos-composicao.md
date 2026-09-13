# Regras financeiras, cobertura Proesc e composição de recebimentos

Estado: revisão, testes e build aprovados; publicação 4.8.61 autorizada em execução.

## Pedido e aceite

Conferir todas as turmas técnicas importadas, corrigir configuração financeira ausente e erro do resumo, distinguir cobertura Proesc por turma/matrícula e permitir segundo ciclo Banese quando elegível e não emitido externamente. Discriminar recebimentos Proesc no Caixa/PDF, Financeiro, Contas a Receber, conciliação, extrato do aluno e Outros Créditos. Usar a API e o histórico importado, conforme pedido expresso de não usar navegador.

- Referência informada: matrícula R$200,00 sem desconto +12 mensalidades no primeiro ciclo; rematrícula R$100,00 sem desconto +12 no segundo. Mensalidade R$279,90, pontualidade R$19,90, multa2% única e juros2%a.m proporcionais como T42.
- T42 e posteriores: segundo ciclo local quando não emitido Proesc. Turmas anteriores predominantemente externas, exceções individuais verificadas. Não inferir cobertura pelo número da turma ou quantidade de parcelas isoladamente.
- Valores emitidos e exceções comprovadas permanecem imutáveis; configuração prospectiva não comprova composição histórica. Usuário autorizou expressamente calcular os componentes ausentes: distinguir o cálculo dos dados explícitos, conservar o recebido e apresentar diferenças. Radiologia tem regra distinta existente e será preservada.
- Não executar criação, cancelamento ou reemissão bancária durante a correção.

## Etapas

1. Reproduzir erro e inventariar turmas, políticas, matrículas, vínculos e API; preparar matriz por turma sem dados pessoais.
2. Corrigir apresentação da configuração pendente e preparar regras/políticas por escopo. Validar casos com e sem cobertura externa, matrículas inativas e títulos existentes.
3. Priorizar composição explícita Proesc e completar componentes elegíveis pelas regras informadas. Resolução central compartilhada, recebido real preservado e diferença a conferir quando o cálculo não fecha.
4. Aplicar somente operações concretas autorizadas, conferir invariantes antes/depois, smoke e publicação no escopo aprovado.

## Diagnóstico inicial

- Nove turmas T35/37/38/39/40/41/43/44/45 possuem valores/parcelas zero, revisão0 e regra ausente:392 matrículas e6.071 obrigações com ciclo não resolvido. Ausência de classificação não prova ausência de emissão.
- RPC real T38/T43 falha SQLSTATE22023 em validate_technical_financial_rule_input antes de retornar workspace. T42 responde com os totais exibidos pelo usuário.
- Composição anterior admitia apenas prova PORTAL_CONFIRMED. API contábil de setembro2026 respondeu HTTP200:1.005 linhas. Blocos3/4 identificam juros/multa; bloco10482 é desconto comprovado na unidade3145. Tarifa7 não integra juros, acréscimo ou recebido.
- A apresentação de Contas a Receber também exigia identificação Banese para mostrar desconto Proesc; agora utiliza os componentes da RPC canônica.
- Extrato e Outros Créditos não projetavam todos os componentes; as RPCs recebem somente a projeção adicional, com autorização e filtros originais preservados.

## Configuração aplicada e invariantes

- Inicialização de nove regras: matrícula200/rematrícula100 sem desconto, 12 parcelas por ciclo, mensalidade279,90, desconto19,90 até vencimento, multa2% única, juros2% ao mês proporcionais; vencimento15 e instrução da referênciaT42. Exceções existentes e Radiologia preservadas.
- Políticas manuais configuradas somente nos escopos importados confirmados. Criadas392 configurações PENDENTE, sem data, ativação, override ou título. Configuração não comprova cobertura externa individual.
- Ensaios transacionais e replay confirmaram os mesmos hashes de contas a receber, matrículas e execuções. Nenhuma emissão ou chamada bancária de criação/cancelamento.
- Após aplicação, dez workspaces responderam e fecharam com contas a receber: T43 lançado185.163,90/recebido73.855,39/vencido18.523,40; T42 permaneceu117.088,30/53.813,57/30.279,20.
- Registros remotos Supabase: 20260913181610 (regras), 20260913181619 (continuação individual), 20260913181627 (configuração importada). Os arquivos aplicados permanecem imutáveis.

## Composição e validação

- API/portal explícitos têm precedência; fallback calculado restringe-se aos dez códigos de turmas confirmados na unidade3145, valores nominais autorizados, sem negociação/override/conflito conhecido.
- Mensalidade279,90 paga até vencimento: desconto19,90, recebido260,00. Em30 dias: juros5,60 + multa5,60 =291,10. Matrícula200/rematrícula100 não recebem desconto.
- Nos3.748 recebimentos auditados:2.897 calculados,817 API+cálculo,10 API parcial,2 conferidos e22 fora do padrão sem detalhe suficiente. Distribuição e recebido permaneceram idênticos após retirar UUIDs fixos do escopo.
- Existem1.683 diferenças nos registros calculados/mistos. Elas são exibidas e não redistribuídas artificialmente entre juros, multa ou desconto. Os quatro casos das imagens fecharam com desconto19,90 e diferença zero.
- Ensaios MCP com ROLLBACK validaram composição e consumidores, extrato/Outros Créditos, autorização, filtros e valores antigos. Anônimo permanece sem acesso.
-61 testes Caixa,42 testes Deno da API,74 testes de consumidores/ciclos/PDF e2 testes SSR de Outros Créditos aprovados. Tipagem global aprovada durante integração; build4.8.61, lint do manifesto e teto de500 linhas também aprovados. Revisão independente do preflight aprovada; agrupamentos de turma ambíguos bloqueados antes do filtro.
- PDFs vetoriais de Caixa e Contas a Receber gerados e renderizados. Caixa6 páginas, página de recebimentos inspecionada com casos calculado/API+regra/parcial; somente logo e marca institucional como imagens. Modelos configurados preservados.
- Smoke de navegador não executado por pedido do usuário; validação usa API/RPC, SSR e renderização dos PDFs. Conferência autenticada do novo preflight após deploy ainda pendente.
- Publicação usa override de useModalidadeReceberReport.tsx com somente composição; dois hunks paralelos de filtros/cards permanecem no workspace e ficam fora do commit.

## Conferência dos ciclos

- Replay da fonte real pelo parser e avaliador publicados:427 matrículas,133 cronogramas C1,143 FULL e151 UNKNOWN. Isso descreve o cronograma, não autoriza emissão nem substitui os bloqueios acadêmicos/títulos existentes.
- Fonte completa disponível:60 meses2024–2028; T42 usou48 meses2024–2027, respeitando sua janela. Ensaio com ROLLBACK, sem gravar prova real antiga como recente.

| Turma | C1 | FULL | UNKNOWN |
| --- | ---: | ---: | ---: |
| T35 | 0 | 17 | 28 |
| T37 | 0 | 24 | 9 |
| T38 | 0 | 32 | 26 |
| T39 | 1 | 28 | 12 |
| T40 | 2 | 17 | 24 |
| T41 | 2 | 24 | 6 |
| T42 | 21 | 1 | 13 |
| T43 | 44 | 0 | 17 |
| T44 | 32 | 0 | 8 |
| T45 | 31 | 0 | 8 |

- Preflight novo coleta API por unidade/janela, quatro GETs simultâneos no máximo, cache de5 minutos e lease de2 minutos. Novas obrigações externas, fonte incompleta, vencimento, revisão do token e alteração local invalidam a prova.
- Evidência API_SCHEDULE_REVIEW identifica derivação pelas condições informadas; não é rotulada como contrato original da fonte. FULL permanece protegido; C1 permite somente segundo ciclo quando as demais regras permitem.
- T42 usa a reconciliação existente, sem criar fontes acadêmicas fictícias; preserva ATIVO/PENDENTE já admitidos. Novas turmas exigem matrícula ATIVO e situação CURSANDO verificada.
- Prévia e confirmação conferem a origem novamente; replay do mesmo cache preserva fingerprints. Cinco testes Edge, deno check e ensaio SQL integrado aprovados. Nenhuma cobrança emitida nesta validação.
- Ordem de publicação: frontend compatível primeiro; depois projeções/composição SQL, cache/guardas de ciclos e Edge proesc-api. Isso evita o frontend antigo rejeitar os novos estados de composição.

## Manifesto explícito

Total: 78 arquivos.

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-13-proesc-regras-ciclos-composicao.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/caixa/report/CaixaReportDocument.tsx`
- `modules/gestor/caixa/report/CaixaReportRecurringAnalysis.tsx`
- `modules/gestor/caixa/report/CaixaReportTables.tsx`
- `modules/gestor/caixa/report/caixa-report.mapper.test.ts`
- `modules/gestor/caixa/report/caixa-report.types.ts`
- `modules/gestor/caixa/report/caixa-report.validation.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.shared.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.tables.ts`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/financeiro.composition-presentation.ts`
- `modules/gestor/financeiro/financeiro.receivables-page.service.ts`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditCreateModal.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/outros-creditos.presentation.ts`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableAmountSummary.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/modalidade-receber.utils.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-boleto-discount.contract.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-composition.pdf.test.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-composition.test.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/useModalidadeReceberReport.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigSummary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/AlunoFinanceiroExtrato.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/extrato/alunoExtrato.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-config-readonly.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financial-workspace-error.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financial-workspace-error.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.test.ts`
- `supabase/functions/proesc-api/cycle-review.test.ts`
- `supabase/functions/proesc-api/cycle-review.ts`
- `supabase/functions/proesc-api/cycle-schedule-source.ts`
- `supabase/functions/proesc-api/diagnostic-readonly.test.ts`
- `supabase/functions/proesc-api/diagnostic-readonly.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/sync-observation.test.ts`
- `supabase/functions/proesc-api/sync-observation.ts`
- `supabase/migrations/20260913184000_proesc_explicit_payment_components.sql`
- `supabase/migrations/20260913184001_proesc_partial_composition_projections.sql`
- `supabase/migrations/20260913191000_proesc_confirmed_individual_cycle_continuation.sql`
- `supabase/migrations/20260913191100_proesc_initialize_confirmed_class_financial_rules.sql`
- `supabase/migrations/20260913191200_proesc_imported_cycle_configuration.sql`
- `supabase/migrations/20260913192000_proesc_cycle_review_cache.sql`
- `supabase/migrations/20260913192100_proesc_api_schedule_cycle_evidence.sql`
- `supabase/migrations/20260913194000_proesc_extra_statement_composition.sql`
- `supabase/tests/proesc_api_cycle_review.transaction.sql`
- `supabase/tests/proesc_explicit_payment_components.readonly.sql`
- `supabase/tests/proesc_extra_statement_composition.transaction.sql`
- `supabase/tests/proesc_imported_cycle_configuration.transaction.sql`
- `supabase/tests/proesc_individual_cycle_continuation.transaction.sql`
- `supabase/tests/proesc_initialize_class_rules.transaction.sql`
- `supabase/tests/proesc_user_rule_composition.transaction.sql`
- `supabase/tests/proesc_verified_composition.transaction.sql`
