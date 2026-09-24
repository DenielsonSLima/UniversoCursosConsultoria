# Revisão dos ciclos técnicos — 24/09/2026

Estado: validado, publicação em andamento. Continuidade da correção financeira autorizada pelo usuário.

## Objetivo e aceite

- Listas de todas as turmas continuam carregando com seus contratos reais.
- Histórico Proesc/Banese e cobranças próprias permanecem protegidos contra duplicação.
- Pagamento posterior preserva a prova de emissão, sem autorizar nova emissão do título pago.
- Vencimentos emitidos correspondem aos itens revisados e congelados.
- Modal permite corrigir uma revisão com erro e reinicia corretamente ao mudar de ciclo.
- Sem emissão bancária real durante validação.

## Achados reproduzidos

1. O reconhecimento de emissão exige título aberto, fazendo o pagamento posterior aparecer como revisão e falhar na retomada.
2. Alterar somente o vencimento após a preparação passa pelo RLS e pela autorização de emissão, divergindo do cronograma revisado.
3. Voltar da revisão fica bloqueado quando a prévia falha; mudança C1 para C2 pode preservar origem de data e revisão do ciclo anterior.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-state-recovery.contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.test.ts`
- `supabase/migrations/20260924170000_freeze_reviewed_manual_cycle_due_dates.sql`
- `supabase/migrations/20260924170100_project_settled_manual_cycle_issuance.sql`
- `supabase/tests/reviewed_manual_cycle_identity.rollback.sql`
- `supabase/tests/settled_manual_cycle_issuance.rollback.sql`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-24-revisao-ciclos-tecnicos.md`

Total: 18 arquivos. Migrations anteriores aplicadas permanecem imutáveis. Fontes documentais e importações não fazem parte do patch.

## Evidências

- Workspaces completos reais das 11 turmas, 454 matrículas, validados pelo parser financeiro e pelo parser de ciclos: zero falhas.
- 40 testes documentais/consulta e 3 cenários adicionais de pagamento/cancelamento passaram sem chamadas bancárias.
- Código documental local corresponde ao GitHub principal e às Edges publicadas (27 fontes).
- Referência financeira: 6.837 recebíveis, soma R$ 1.876.839,27, seis execuções manuais; aluna do caso permanece sem recebíveis.
- Testes SQL com escrita somente dentro de transações encerradas por ROLLBACK.
- Prévia autenticada pendente: Safari voltou à tela de login/verificação; usuário foi avisado.
- Prévia real do caso inicial via RPC e parser aprovada: matrícula e 12 mensalidades. A matrícula configurada em zero exige revisão de valor ou exclusão do boleto.
- Smoke local interativo com componente React real: erro de prévia permite voltar; C1→C2 exige data individual e descarta edições anteriores; emissão em andamento conserva o ciclo até terminar.
- 81 testes finais de UI/Edge aprovados; build completo 4.8.80 aprovado.
- Revisão independente dos patches SQL e UI/Edge sem bloqueador; testes SQL com rollback aprovados.
- Smoke adicional: matrícula em zero impede confirmar; sua exclusão permite revisar as 12 mensalidades e preserva as datas. Recálculo simulado no harness; nenhum envio bancário.
- As respostas completas das 11 turmas após as migrations são idênticas às respostas já validadas pelos parsers.
- Transferência cria matrícula de destino e altera apenas o status da origem, preservando a identidade das cobranças originais.

## Aplicações e testes SQL

- `20260924170000`: aplicada como `20260924222831`; teste de identidade/vencimento e autorização aprovado.
- `20260924170100`: aplicada como `20260924222931`; pago comprovado mantém contadores, bloqueia novo POST e rejeita falta de prova, baixa manual e cancelamento.
- Primeira tentativa de 170100 foi rejeitada atomicamente por alias SQL reservado; funções ausentes e getter original confirmados antes da correção/reaplicação. Nenhum efeito parcial.
- Regressão anterior de geração/replay/autorização repetida com 12 e 13 itens: aprovada, ambas com ROLLBACK.
- Baseline final preservado: 6.837 recebíveis, R$ 1.876.839,27, 395 transações bancárias, seis execuções manuais, zero recebíveis no caso inicial.
- Nenhum POST bancário, baixa, alteração acadêmica ou cobrança de teste persistiu.

## Publicação

- Versão 4.8.80/revisão 89; base remota `297b5dfa2240f86efd491ebcb8dbcf7f2acb4bf5`.
- GitHub somente MCP e manifesto explícito; alterações paralelas do Caixa excluídas do conteúdo remoto.
- Edge preserva os 70 arquivos do bundle remoto e substitui somente contract.ts e orchestrator.ts.
- Edge `technical-manual-cycle-issuance` v5 ativa, JWT habilitado; 70 arquivos conferidos. Uma falha interna transitória de deploy manteve v4; repetição idêntica publicou v5.
- Elegibilidade individual usa o histórico e os vínculos importados; consultas Proesc/Banese mantêm seus fluxos próprios. Ausência de histórico local não é apresentada como consulta bancária ao vivo.
