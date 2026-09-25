# Transferências técnicas — 24/09/2026

Estado: VALIDADO — publicação 4.8.84 em andamento.

## Pedido e limite

Após revisão somente leitura com três agentes, usuário autorizou dividir a correção em etapas, implementá-la e revisar ao final. Escopo: transferência recebida/enviada/interna, novo vínculo em turma importada, aproveitamentos e planejamento/continuidade financeira. Não executar transferência, baixa ou cancelamento bancário real para teste.

Base revisada: main `f0f301e154434faa03f501772c3db7d2f8e6b41f`, versão 4.8.83. A análise e as provas sintéticas estão em `tmp/revisao-transferencias-2026-09-24/` (artefatos regeneráveis fora da publicação).

## Etapas e responsáveis

1. `modal_ciclos`: entrada acadêmica, fechamento de disciplinas aproveitadas, isolamento do rascunho e tela de planejamento recebido.
2. `auditoria_publicacao`: admissão regular em turmas importadas, plano de entrada auditado, idempotência e continuidade canônica de ciclos.
3. `eligibilidade_ciclos`: prévia e execução de saída/interna, corte de futuras e acompanhamento de cancelamento/revisão por origem.
4. Coordenador: contratos entre frentes, integração do emissor, testes, revisão cruzada, documentação e eventual entrega remota autorizada.

## Critérios de aceite

- Nova matrícula autorizada não é confundida com matrícula importada; a proteção dos vínculos históricos continua ativa.
- Aproveitamento não exige lançamento de nota/frequência que o próprio sistema proíbe.
- Trocar aluno elimina rascunho anterior; retentativa repete a mesma operação, sem novo movimento.
- Entrada explicita ciclo inicial nesta instituição, quantidade restante e primeiro vencimento. C2 declarado não equivale a prova de pagamento/cobertura de C1.
- Histórico financeiro existente continua impedindo geração duplicada. Planos de transferência não alteram títulos ou vínculos existentes.
- Saída por transferência preserva pagos e vencimentos até a data de corte inclusive; somente vencimentos posteriores entram na ação financeira.
- Banese aguarda confirmação do provedor. Proesc/CNAB/legado sem cancelamento comprovado permanecem em revisão explícita, sem status fictício.
- Transferência interna mantém identidades, recebíveis e pagamentos na origem, com continuidade auditável no destino.
- A tela distingue conclusão acadêmica, cancelamento bancário pendente e revisão externa.
- Nenhum teste toca cobrança real; testes de integração usam dados controlados e reversão.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-24-transferencias-tecnicas.md`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `docs/decisions/transferencias-tecnicas.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/gestao/tecnicos/detalhes/TurmaTecnicoDetalhes.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAcademico.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferFinancialFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-attempt.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-draft.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.client.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TransferFinancialHistory.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TransferFinancialPreview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-state.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTransferFinancialReview.ts`
- `modules/gestor/gestao/tecnicos/detalhes/transfer-finance.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/transfer-finance.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/transfer-finance.service.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/revision.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/revision.ts`
- `supabase/functions/technical-manual-cycle-issuance/transfer-installments.test.ts`
- `supabase/migrations/20260924201000_recognize_transfer_credits_in_period_closing.sql`
- `supabase/migrations/20260924202000_authorize_regular_admission_in_imported_classes.sql`
- `supabase/migrations/20260924202010_plan_external_transfer_finance.sql`
- `supabase/migrations/20260924202020_receive_planned_external_transfer.sql`
- `supabase/migrations/20260924202030_project_transfer_entry_cycles.sql`
- `supabase/migrations/20260924202050_fence_unplanned_external_transfer.sql`
- `supabase/migrations/20260924203000_transfer_financial_review_contract.sql`
- `supabase/migrations/20260924203010_preserve_internal_transfer_obligations.sql`
- `supabase/migrations/20260924203020_apply_external_transfer_cutoff.sql`
- `supabase/migrations/20260924203030_fence_transfer_banese_cancellation.sql`
- `supabase/migrations/20260924203040_confirm_and_follow_transfer_finance.sql`
- `supabase/migrations/20260924204000_project_internal_transfer_cycles.sql`
- `supabase/migrations/20260925014416_validate_transfer_entry_rollback_20260924.sql`
- `supabase/migrations/20260925015247_validate_transfer_combined_rollback_20260924.sql`
- `supabase/migrations/20260925015847_validate_transfer_final_rollback_20260924.sql`
- `supabase/migrations/20260925020037_validate_transfer_local_fee_rollback_20260924.sql`
- `supabase/tests/external_transfer_entry.rollback.sql`
- `supabase/tests/individual_technical_cycles.transaction.sql`
- `supabase/tests/internal_transfer_cycle_proof.transaction.sql`
- `supabase/tests/transfer_credits_period_closing.contract.test.ts`
- `supabase/tests/transfer_credits_period_closing.fixture.mjs`
- `supabase/tests/transfer_entry_plan.transaction.sql`
- `supabase/tests/transfer_exit_current_movement.transaction.sql`
- `supabase/tests/transfer_exit_cutoff.transaction.sql`
- `supabase/tests/transfer_exit_finance.rollback.sql`
- `supabase/tests/transfer_exit_local_fee.rollback.sql`

Total: 69 arquivos.

## Validação

- Revisão cruzada dos três agentes: entrada/UI/DTO, elegibilidade/estado/Edge e saída/permissões/replay; correções incorporadas antes de publicar.
- 22 testes focados de transferência, 74 regressões de ciclos/baixa/worker (9 subcasos) e 42 testes Edge aprovados.
- TypeScript e lint do manifesto aprovados; build completo aprovado (aviso preexistente de chunks grandes).
- Entrada: 11 testes acadêmicos e quatro cenários interativos locais. Troca de aluno, C2 com justificativa, erro de prévia e resposta perdida/mesma chave foram exercitados.
- Emissão: smoke C1/C2 com seis mensalidades, vencimento planejado e revisão final, sem exceções nem chamadas externas.
- Saída: smoke desktop e 390px, erro de consulta, corte externo, interna preservada, duplo clique e recuperação da mesma operação; componentes/hooks reais com serviços sintéticos.
- SQL: 12 migrations novas foram exercitadas juntas com sete testes transacionais, sempre ROLLBACK. Entrada parcial/C2, replay após preparação, autorização, títulos Proesc preservados, corte temporal, movimento atual e regressão de ciclos/LOCAL passaram.
- Projeção interna: corpos reais em pg_temp, sem fabricar identidade bancária em tabela real; C1 sem história, origem TRANSFERIDO+C1 completo→C2, importados/parciais protegidos, cadeia ancestral e limite C2 aprovados.
- Comparação integrada dos 454 estados existentes em 11 turmas: hash canônico inalterado. Recebíveis: 6.837, nominal R$ 1.876.839,27, hash de identidade/status/vencimento `4189ccd6e56e96845ce0fe200f67d49f` inalterado.
- Varredura financeira adicional encontrou três contratos textuais já desatualizados na base remota 4.8.83: denominador do carnê, configuração gerarCobrancasFuturas e texto “títulos emitidos”. Comprovados via MCP no SHA base; não foram tratados como regressões novas nem alterados neste lote. Dois testes React dependem de harness Vite/esbuild; no harness Proesc, sete passaram e apenas a expectativa textual antiga falhou.

- SQL LOCAL real em ROLLBACK: futura cancelada/replay, movimento antigo recusado, paga futura preservada com estorno bloqueado e paga no dia com estorno permitido; nenhum POST bancário.

- RAG consolidado em 13 fontes/80 trechos; contrato operacional e teto aprovados. Decisão curta aponta ao contrato detalhado neste registro para preservar o limite do índice.

## Isolamento e limites

- Manifesto comparado contra main 4.8.83. Registro de manifestos e changelog são publicados a partir da base remota mais a mudança deste lote; três registros operacionais e bloco 4.8.77 locais paralelos permanecem fora da entrega. Caixa e outros arquivos alheios preservados.
- Os testes interativos usaram componentes reais em navegador local e serviços sintéticos. Não houve transferência/cancelamento/emissão de aluno real nem smoke autenticado mutante em produção.
- Continuidade parcial/transitiva sem prova direta e obrigações ancestrais permanecem protegidas/revisão externa. Cancelamento externo não comprovado não altera status. Carnê conserva limite documental preexistente de 30 itens; turmas atuais usam até 13.
- Contrato durável: `docs/decisions/transferencias-tecnicas.md`, ligado ao contrato financeiro já indexado. Sem alteração de AGENTS, skills ou memória de governança.

## Entrega remota

Backend aplicado e conferido; frontend 4.8.84 preparado para GitHub/Preview/produção. A PR deste lote registra a conclusão da entrega web. As operações de validação foram revertidas, mas o MCP registrou marcadores no ledger; fontes no-op auditam esses eventos sem reaplicar fixtures dependentes de produção:

- `20260925014416`: entrada e preparação/replay.
- `20260925015247`: conjunto integrado e preservação dos 454 estados.
- `20260925015847`: prova/projeção de continuidade interna.
- `20260925020037`: saída e estorno da matrícula LOCAL.

Publicação planejada 4.8.84, via MCP Supabase/GitHub, com Edge emissor e worker preservando todos os arquivos remotos alheios; somente revision.ts/orchestrator.ts alterados nos bundles.

## Aplicação do backend e releitura

Migrations aplicadas por MCP, sem alteração dos arquivos-fonte:

| Fonte local | Versão remota |
|---|---|
| 20260924201000 | 20260925020309 |
| 20260924202000 | 20260925020312 |
| 20260924202010 | 20260925020317 |
| 20260924202020 | 20260925020320 |
| 20260924202030 | 20260925020322 |
| 20260924202050 | 20260925020324 |
| 20260924203000 | 20260925020327 |
| 20260924203010 | 20260925020329 |
| 20260924203020 | 20260925020332 |
| 20260924203030 | 20260925020337 |
| 20260924203040 | 20260925020339 |
| 20260924204000 | 20260925020341 |

Edge emissor v7/JWT ligado/70 arquivos e worker v6/JWT preexistente desligado/72 arquivos ativos; releitura confirmou zero diferenças contra os bundles explícitos. Somente revision.ts e orchestrator.ts foram substituídos; dependências remotas alheias preservadas.

Após aplicação: 6.837 recebíveis e 454 estados com hashes idênticos à base; zero planos de entrada e zero operações reais de transferência criadas. Advisors: três tabelas privadas adicionais com RLS sem policy e grants revogados, cinco RPCs authenticated com autorização interna; nenhum novo grant anon, search_path ou categoria de alerta. Avisos anteriores permanecem fora do escopo.

## Contrato detalhado preservado

Este contrato complementa [ciclos técnicos e matrícula local](../../../../docs/decisions/ciclos-tecnicos-cobrancas.md).
Situação acadêmica, obrigação financeira, emissão bancária e pagamento são fatos distintos.
Transferência não apaga histórico, não confirma pagamento e não prova cancelamento bancário.

### Recebimento externo

O recebimento registra instituição de origem, data, motivo e aproveitamentos por
disciplina, com média e frequência. Aproveitamento válido dispensa as exigências de
diário da disciplina correspondente no fechamento; não dispensa componentes não
aproveitados nem permite fabricar notas ou presenças.

O plano financeiro é individual: ciclo inicial (1 ou 2), quantidade de mensalidades
restantes e primeiro vencimento. A quantidade deve ser inteira, positiva e não exceder
a regra efetiva da turma. C2 inicial exige justificativa; isso não cria C1, quitação,
cobertura importada nem título fictício.

A operação exige permissões acadêmicas e financeiras e acesso ao polo. A prévia identifica
a regra por fingerprint; a confirmação persiste o snapshot e mudança exige nova revisão. Histórico financeiro existente
impede usar a entrada para duplicar obrigações. Matrícula, aproveitamentos e plano são
criados atomicamente, sem emitir boleto ou dar baixa. Depois, o usuário abre o financeiro
do aluno e revisa o ciclo pelo emissor existente.

Somente o ciclo inicial usa a quantidade parcial. Depois de C1 parcial, C2
volta à quantidade completa da regra, preservando o snapshot anterior. Entrada em C2
continua limitada ao segundo ciclo, sem criar C3. C1 mantém BOLETO,
REGISTRO_SEM_BOLETO e OMITIR para matrícula. Valores, juros, desconto e multa
continuam derivados da regra e revisáveis por item. A instrução do boleto segue a regra.

Aluno novo cadastrado regularmente em turma importada usa autorização restrita à
criação pelo fluxo oficial, sem origem/vínculo importado e sem emissão automática.
Os bloqueios dos registros históricos da turma permanecem ativos.

### Transferência interna

Recebíveis, pagamentos, identidades Banese/Proesc e ciclos permanecem na matrícula de
origem. Uma ligação auditada permite consultar as origens no financeiro do destino.
Não mover nem excluir cobranças para fazer a tela parecer vazia.

- Sem histórico financeiro anterior: pode iniciar C1, conforme elegibilidade comum.
- C1 canônico completo na origem imediata, com toda a parte bancária emitida: pode seguir
  para C2 no destino; pagamento não é requisito dessa prova.
- Histórico importado, ciclo parcial, outras obrigações ou cadeia de múltiplas
  transferências sem prova direta: geração permanece protegida e o histórico é exibido.

Transferência interna não cancela títulos da origem. Emissão bancária ainda não concluída
na matrícula transferida não ganha autorização apenas pela ligação ao destino.

### Saída externa

A confirmação exige prévia por título. A data da transferência é o corte: vencimento
posterior pode entrar na ação; vencimento no mesmo dia ou anterior e títulos pagos são
preservados. Trancamento, desistência e outros motivos conservam suas regras.

| Origem da obrigação futura | Resultado |
|---|---|
| Local sem boleto, elegível | Cancelamento local auditado |
| Banese com identidade comprovada | Fila existente; aguardar confirmação |
| Proesc, CNAB ou legado sem contrato de cancelamento comprovado | Revisão externa persistente; sem alteração fictícia de status |
| Obrigação em matrícula ancestral | Exibição e revisão externa; a ligação não autoriza cancelamento bancário em outra identidade |

A conclusão acadêmica é mostrada separadamente da situação financeira. O acompanhamento
continua disponível após fechar o modal. Falha bancária não equivale a cancelamento.
Estorno da matrícula LOCAL futura já paga, solicitado após a saída, exige revisão financeira; o fluxo não reabre
a obrigação silenciosamente.

### Repetição, concorrência e limites

Cada confirmação tem chave e payload estáveis. Autorizações são verificadas antes do
replay. Resposta perdida congela o rascunho e permite conferir a mesma operação; não
criar outra chave até esclarecer o resultado. Trocar aluno antes da confirmação limpa
plano, aproveitamentos e dados da origem. Geração e transferência compartilham
serialização por pessoa e validam novamente o estado no servidor.

Replay de estorno LOCAL anterior que já foi seguido por cancelamento exige atualizar
a tela; não reabre o recebível nem repete o lançamento. As regras atuais têm 12 parcelas,
portanto até 13 itens com taxa. O limite preexistente do PDF de carnê permanece 30 itens;
o envelope do emissor não constitui autorização para ampliar o limite documental.

### Evidências e manutenção

O [registro do lote](2026-09-24-transferencias-tecnicas.md)
contém manifesto, testes, limitações, revisão dos três agentes e situação de publicação.
Testes transacionais terminam em ROLLBACK e nunca chamam o banco emissor. Não usar
transferência ou cancelamento de aluno real para validar alteração de software.
