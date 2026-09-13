# Conferência automática dos ciclos Proesc

Estado: VALIDADO — entrega 4.8.64, com conferência real concluída e publicação autorizada.

## Problema e aceite

A versão 4.8.61 exigia uma ação separada para conferir o segundo ciclo. A consulta passa a ocorrer automaticamente ao abrir o financeiro e pelo worker Proesc existente. Todas as 427 matrículas dos 10 escopos confirmados foram conferidas pela API, sem navegador.

- Remover botão, prop e hook da conferência manual.
- Consultar páginas por unidade/janela, compartilhar a fonte entre alunos e retomar lotes interrompidos.
- Manter a classificação exibida enquanto seu manifesto coincidir. Prévia e geração exigem prova recente automaticamente no servidor.
- Preservar ciclos Proesc/Banese já existentes e bloquear trancados, transferidos e demais situações sem elegibilidade acadêmica.
- A conferência não emite títulos nem altera recebíveis, pagamentos ou matrículas. Pedido individual de manter a geração bloqueada enquanto confere o banco preserva o histórico e não presume desistência acadêmica.
- Fonte incompleta permanece bloqueada; CPF ausente no retorno contábil não significa CPF ausente no cadastro.

## Resultado real

Execução 69267, HTTP 200, sem timeout, concluída em 13/09/2026 às 23:17:23 UTC:

| Escopo | Matrículas | Elegíveis | Ciclos protegidos |
| --- | ---: | ---: | ---: |
| T35 | 45 | 0 | 17 |
| T37 | 33 | 0 | 24 |
| T38 | 58 | 0 | 32 |
| T39 | 41 | 0 | 28 |
| T40 | 43 | 0 | 17 |
| T41 | 32 | 0 | 24 |
| T42 | 35 | 15 | 7 |
| T43 | 61 | 44 | 0 |
| T44 | 40 | 32 | 0 |
| T45 | 39 | 31 | 0 |
| Total | 427 | 122 | 149 |

- 60 GETs da fonte; 427 revisões, zero falhas e zero matrículas fora da rodada concluída.
- 122 C1 elegíveis, 142 coberturas completas confirmadas e 7 proteções existentes; outras 156 permanecem sem prova suficiente de elegibilidade, sendo 99 academicamente inativas e 57 ativas/pendentes.
- Zero inativos elegíveis, zero ciclos existentes elegíveis novamente e zero elegíveis sem C1 confirmado.
- A T42 mantém os 7 casos já protegidos; os 2 trancados/transferidos continuam bloqueados. Outros 11 dependem de fonte própria, quantidade/valores das obrigações ou datas coerentes. Os 21 cronogramas C1 da T42 correspondem aos 15 elegíveis e 6 ciclos locais existentes.
- Baseline preservado: 427 matrículas, 6.495 recebíveis, 3.748 pagos, R$ 954.462,36 recebidos e 6 execuções locais de ciclo. Hashes das matrículas, recebíveis e execuções idênticos aos anteriores.
- Rotina habilitada; próxima rodada diária agendada. Abertura de turma e prévia fazem sua verificação automática própria.

## Correções e evidências

- Corrigidos aliases ambíguos de identificadores na RPC que persistia os lotes.
- Grupos de identidade incompleta são mantidos no cache, com bloqueio conservador por possível envolvido.
- Oito cobranças sem turma/CPF no retorno contábil pertencem a três nomes, identificados pela consulta interna de chaves. Não possuem vínculo local. Dados pessoais permanecem fora do código, registro e RAG.
- Grupos inteiramente não identificados só deixam de afetar uma matrícula quando todas as datas observadas são anteriores ao início real da turma e nenhuma chave é da própria matrícula. Grupos mistos, datas incompletas, renegociações, identidade conhecida e chaves próprias continuam bloqueando.
- A prova depende da data real da turma, não de matrícula tardia. Caches antigos sem a prova de grupo completo não são reclassificados silenciosamente.
- Imagens fornecidas pelo usuário confirmaram CPF cadastral apesar da ausência no retorno financeiro. Nenhuma informação de imagem foi usada para criar vínculo financeiro por nome.
- Falha da revisão automática não interrompe a conciliação financeira já existente.

## Validação

- 62 testes Edge passaram com checagem de tipos: autenticação interna, limites de consulta, identidade, fonte, lotes e isolamento da conciliação. Após retirar uma inicialização sem uso apontada pelo lint, os 16 testes de handler/worker afetados passaram novamente.
- 12 testes QueryObserver/SSR passaram: automatismo, deduplicação, troca de turma, ausência de loop, falha parcial, retirada do botão e preservação de carnês/retomadas.
- Sete testes adicionais de parser/SSR validaram cobertura SEGUNDO_CICLO, compatibilidade com CONTRATO_COMPLETO e bloqueio correto da ação de carnê externo.
- TypeScript, lint do manifesto e build completo 4.8.64 passaram; TypeScript/build repetidos após estender o contrato da cobertura individual.
- Ensaios SQL via MCP com ROLLBACK: cobertura persistente, prova vencida recusada na prévia e INSERT inclusive em execução GENERATING, estado fresco com 13 itens, bloqueios acadêmicos, checkpoint/retomada, troca de credencial, fonte ambígua e escopo temporal.
- Auditoria final somente leitura confirmou os totais e invariantes após a rodada real.
- Revisão independente de backend e frontend aprovada. Nenhum clique autenticado foi usado: a consulta real ocorreu pelo worker autorizado e o automatismo da interface foi validado por seus contratos.
- Manifesto de 41 arquivos; nenhum arquivo manual excede 500 linhas. Alterações paralelas foram preservadas.

## Aplicação remota

Projeto Supabase kfekgwyqozhicpfuunpo; operações exclusivamente por MCP.

| Arquivo local | Registro remoto |
| --- | --- |
| 20260913201000_proesc_cycle_persistent_state_and_fresh_generation.sql | 20260913192214 |
| 20260913201100_proesc_automatic_cycle_review_batches.sql | 20260913192221 |
| 20260913202000_proesc_cycle_batch_explicit_identifiers.sql | 20260913224932 |
| 20260913230000_proesc_anonymous_source_before_class.sql | 20260913231533 |
| 20260913233000_proesc_external_second_cycle_only.sql | 20260913234617 |

Migrations aplicadas imutáveis. Edge proesc-api v16 ACTIVE, 17 arquivos conferidos exatamente, SHA256 613ed19e93883738bdd645b931981ddfabc95bad15b51ac4f7f7d6f3ab3c4da2. A autenticação própria existente foi preservada. A rodada real usou v15; v16 apenas remove a inicialização sem uso, sem mudar comportamento. Publicação do frontend por commit atômico, uma Preview e merge após CI, conforme autorização da conversa.

## Segundo ciclo comprovado isoladamente

A conferência individual encontrou um plano Proesc de R$ 100,00 mais 12 mensalidades de R$ 279,90, posterior à última parcela do primeiro ciclo comprovada em documento fornecido pelo usuário. Os 13 vínculos originais coincidem integralmente com a API por identidade, turma, unidade, valores e vencimentos. Ausência de referência Banese local não comprova ausência de boleto emitido fora do sistema; a consulta bancária disponível exige convênio e Nosso Número.

- A capacidade SEGUNDO_CICLO reconhece somente o C2 integral, sem inventar parcelas locais do C1 nem rotular os dois ciclos como contrato completo.
- A prova registra o hash real da coleta API e uma transcrição documental explicitamente identificada. Não apresenta hash de transcrição como hash binário do anexo.
- Preserva autorização, locks, CAS, manifesto e auditoria; 13 evidências referenciam títulos existentes, sem nova emissão/importação.
- Ensaio real em BEGIN/ROLLBACK passou: confirmação e projeção dos 13 itens, replay, 14 provas inválidas, sobreposição com FIRST, prévia, geração, preparar_emissao, autorização bancária e INSERT. Títulos, pagamentos, execuções, situação acadêmica e vínculos permaneceram idênticos. Revisão independente aprovada.
- O estado acadêmico permanece inalterado; desistência não foi confirmada pelo usuário.
- A capacidade do banco pode preceder o frontend, mas a gravação da nova abrangência ocorre somente depois da publicação do parser compatível, evitando falha do resumo financeiro na versão anterior.

## Integração com publicação paralela

Main avançou para 9d1f1a668a223fc7608dc77615fa581ba927e802 (4.8.63, legenda dos diários) antes da criação da branch. Essa publicação foi preservada integralmente como base; somente versão/changelog/índice de manifestos exigiram união. A entrega de ciclos segue como 4.8.64, revisão 73, sem regressão de versão.

## Manifesto explícito

Total: 41 arquivos.

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-13-proesc-ciclos-automaticos.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/automatic-proesc-cycle-review.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useAutomaticProescCycleReview.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-proesc.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.query.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/proesc-cycle-review.test.ts`
- `supabase/functions/proesc-api/cycle-review-batch.test.ts`
- `supabase/functions/proesc-api/cycle-review-batch.ts`
- `supabase/functions/proesc-api/cycle-review.test.ts`
- `supabase/functions/proesc-api/cycle-review.ts`
- `supabase/functions/proesc-api/cycle-schedule-source.ts`
- `supabase/functions/proesc-api/diagnostic-accounting-identity.ts`
- `supabase/functions/proesc-api/diagnostic-readonly.test.ts`
- `supabase/functions/proesc-api/diagnostic-readonly.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/v1-client.test.ts`
- `supabase/functions/proesc-api/v1-client.ts`
- `supabase/migrations/20260913201000_proesc_cycle_persistent_state_and_fresh_generation.sql`
- `supabase/migrations/20260913201100_proesc_automatic_cycle_review_batches.sql`
- `supabase/migrations/20260913202000_proesc_cycle_batch_explicit_identifiers.sql`
- `supabase/migrations/20260913230000_proesc_anonymous_source_before_class.sql`
- `supabase/migrations/20260913233000_proesc_external_second_cycle_only.sql`
- `supabase/tests/proesc_anonymous_source_before_class.transaction.sql`
- `supabase/tests/proesc_automatic_cycle_review.readonly.sql`
- `supabase/tests/proesc_automatic_cycle_review.transaction.sql`
- `supabase/tests/proesc_cycle_batch_record.transaction.sql`
- `supabase/tests/proesc_cycle_source_ambiguity.readonly.sql`
- `supabase/tests/proesc_external_second_cycle_only.transaction.sql`
