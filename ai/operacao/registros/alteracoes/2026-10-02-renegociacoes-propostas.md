# Renegociações — primeiro incremento de propostas

## Objetivo e autorização

Em 02/10/2026, o usuário autorizou iniciar a implementação com três agentes após a reunião de produto. Em 03/10/2026, autorizou a revisão com três agentes, modais em tela cheia, aplicação e publicação; depois confirmou seguir sem teste no navegador. Classificação: mudança crítica financeira.

O submódulo possui destino próprio no Financeiro, acessível pela própria aba. A pedido expresso, as abas permanecem lado a lado, com rolagem horizontal visível e Conciliação por último; o atalho duplicado em A Receber foi removido. Nesta etapa, acesso às propostas herda a permissão existente de A Receber; aprovação, aceite, ativação, rescisão e emissão não são implicitamente autorizados.

O lote ativo global foi atualizado em paralelo durante esta execução; fica preservado. Este registro mantém o manifesto e o aceite próprios da frente de renegociações.

## Contrato deste incremento

- Candidatos por aluno/matrícula; seleção livre de uma ou várias mensalidades vencidas, vencendo hoje ou futuras.
- Mesma matrícula/turma/polo; fonte local ou Banese canônico, com regra e identidade comprovadas.
- Proesc, conflitos, pagamentos parciais, títulos em operação e políticas incompletas ficam bloqueados.
- Valor original segue snapshot; novos padrões seguem condição individual e turma com unidades explícitas.
- Backend calcula principal, encargos, concessões, entrada, cronograma e total em centavos.
- Simular e salvar proposta não cancela, reserva economicamente, emite, baixa ou altera contas originais.
- Snapshot recalculado ao salvar, comparação de fingerprint, autorização antes de replay e eventos auditáveis.
- Nenhum pagamento/estado acadêmico é inferido pela proposta.

### Limites deliberados

- Primeiro escopo: mensalidades técnicas e de plano único (livres/especialização), com identidade e snapshot comprovados. EAD, Proesc, pagamentos parciais e outros tipos de lançamento não são incluídos silenciosamente.
- Juros/multa existentes usam a regra congelada dos títulos originais. Os padrões atuais da matrícula/turma preenchem as condições das futuras parcelas; alterar esses padrões não reescreve a dívida original.
- Total é calculado pelo servidor, com perdão de encargos e desconto comercial explícitos. Entrada não é contabilizada como recebida ao salvar.
- Uma parcela participa de no máximo uma proposta não descartada. Isso evita propostas conflitantes, mas não suspende a cobrança nem representa reserva/baixa econômica do título.
- Visões: A negociar, Em andamento, Em atraso e Encerrados. Atraso de acordos permanece indisponível; Encerrados mostra propostas descartadas, não acordos quitados.
- O navegador guarda o mesmo payload e identificador em tentativas repetidas. Divergência de condição exige nova simulação; o banco revalida a autorização antes do replay.

## Divisão de trabalho

- UX: workspace, abas, formulários em tela cheia, serviço, cache, acessibilidade e apresentação.
- Regras: elegibilidade, políticas, cálculos, cronograma e prévia.
- Dados: tabelas, autorização, persistência, idempotência, histórico e testes SQL.
- Coordenação: integração com Financeiro/A Receber, URL, revisão cruzada, testes e registro.

## Manifesto explícito

- `ai/operacao/registros/alteracoes/2026-10-02-renegociacoes-propostas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/gestor.page.tsx`
- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/financeiro/receber/ReceberTab.tsx`
- `modules/gestor/financeiro/financeiro-sections.ts`
- `modules/gestor/financeiro/financeiro-sections.test.ts`
- `modules/gestor/financeiro/hooks/useFinancialSection.ts`
- `modules/gestor/financeiro/components/FinancialUnderlineTabs.tsx`
- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CanonicalSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/DiscardProposalDialog.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalCards.tsx`
- `modules/gestor/financeiro/renegociacoes/components/ProposalDetail.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoPanels.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/WizardSteps.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacoesQueries.ts`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacoesRealtime.ts`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoDialogFocus.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.model.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.model.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.contract.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.payloads.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.presentation.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.queryKeys.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.service.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.types.ts`
- `supabase/migrations/20261003040301_receivable_renegotiation_proposal_schema.sql`
- `supabase/migrations/20261003040303_receivable_renegotiation_proposal_reads.sql`
- `supabase/migrations/20261003040307_receivable_renegotiation_proposal_mutations.sql`
- `supabase/migrations/20261003040309_receivable_renegotiation_policy_helpers.sql`
- `supabase/migrations/20261003040312_receivable_renegotiation_eligibility.sql`
- `supabase/migrations/20261003040314_receivable_renegotiation_calculation_helpers.sql`
- `supabase/migrations/20261003040317_receivable_renegotiation_preview.sql`
- `supabase/migrations/20261003040319_receivable_renegotiation_candidate_rpcs.sql`
- `supabase/tests/receivable_renegotiation_pglite_base.sql`
- `supabase/tests/receivable_renegotiation_pglite_rules.sql`
- `supabase/tests/receivable_renegotiation_rules.transaction.sql`
- `supabase/migrations/20261003040737_receivable_renegotiation_rls_guard.sql`
- `supabase/tests/receivable_renegotiation_release_readonly.sql`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoDialogFocus.test.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `scripts/test-renegociacao-sql.mjs`

Total: 47 arquivos. Arquivos compartilhados preservam mudanças paralelas e não devem ser publicados integralmente sem conciliar o lote correspondente.

## Validação e limites

Projeto confirmado: Supabase `kfekgwyqozhicpfuunpo`. Nove migrations aplicadas via MCP e renomeadas localmente com os mesmos prefixos do ledger. Conteúdo aplicado imutável. Não foram emitidas/canceladas cobranças nem gravadas propostas reais durante a validação.

Verificações executadas:

- TypeScript completo e ESLint focado aprovados.
- Navegação, normalização, payloads e apresentação: 18 testes aprovados após a correção final de rolagem/atalho.
- Teste ReactDOM/jsdom do hook real de foco aprovado: diálogo filho, Escape somente no topo, bloqueio durante processamento, restauração de foco e scroll.
- `npm run test:gestor-access`: 34 testes aprovados.
- PGlite 0.5.8: persistência isolada e regras reais aprovadas após as nove migrations. Save/list/detail/discard/replay, RLS/grants e normalizers reais cobertos; títulos originais idênticos antes/depois.
- Regras puras também executadas no PostgreSQL real em transação com rollback.
- Teste remoto READ ONLY/ROLLBACK aprovado: catálogo, pgcrypto SHA-256, ACL/RLS, readiness e recusa dos oito RPCs sem identidade/autorização.
- A primeira checagem real identificou RLS chamando helper privado sem grant. A nona migration corrige por predicado SECURITY DEFINER restrito; não torna o helper granular público nem amplia direitos globais.
- Replay de save agora é validado antes da exigência de data atual, mantendo autorização antes do replay e permitindo repetição idempotente após a meia-noite.
- Parser exige aprovação explícita e proveniência conhecida; dados malformados não são tratados como condições herdadas.
- Build integrado aprovado; warnings preexistentes de chunks/importação permanecem.
- Auditoria de segurança: os RPCs públicos autenticados e o predicado RLS são SECURITY DEFINER intencionais, com `search_path=''`, guardas de identidade/escopo e execução anônima revogada. Avisos globais preexistentes não foram alterados. [Referência do advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- A checagem global local encontra 14 referências antigas ausentes fora deste manifesto; não foram removidas nem reconstruídas. Arquivos manuais desta entrega respeitam 500 linhas; o snapshot remoto completo será validado pelo CI.

As skills de operação/publicação mantiveram manifesto isolado, migrations imutáveis e gates proporcionais. A revisão conjunta separou cálculo canônico, persistência e UX. O seletor pesquisável foi retirado por decisão posterior do usuário; os três arquivos novos removidos possuem cópia recuperável em tmp, fora do lote.

Comandos reprodutíveis (dependências temporárias, sem alteração do package/lockfile):

```sh
PGLITE_MODULE_PATH=/caminho/pglite/dist/index.js node scripts/test-renegociacao-sql.mjs
PGLITE_MODULE_PATH=/caminho/pglite/dist/index.js RENEGOTIATION_RULES_MODE=real node scripts/test-renegociacao-sql.mjs
RENEGOCIACAO_JSDOM_PATH=/caminho/jsdom node --test modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoDialogFocus.test.mjs
```

Limites: fixtures usam identidade sintética; PGlite não comprova autenticação positiva real nem concorrência entre conexões. A checagem PostgreSQL real comprova pgcrypto/ACL/RLS/negação sem identidade, não um fluxo autenticado completo de gravação. A chamada de candidatos no banco real foi executada somente para leitura, sem retornar dados pessoais nesta documentação. Integração Banese/ativação permanece fora do incremento.

Smoke visual no Safari: **não executado, por escolha explícita do usuário (“Continuar sem teste no navegador”)**. Capturas enviadas pelo usuário confirmaram a navegação e orientaram o retorno às abas, a rolagem visível e a retirada do atalho duplicado; não substituem o smoke final das correções.

## Publicação

Autorizada pelo usuário, condicionada à validação do snapshot restrito. Branch/PR e resultado do deploy serão informados no fechamento. Alterações paralelas de Proesc/Caixa não integram este manifesto; arquivos compartilhados partem do main remoto e recebem somente este delta. O conector Vercel apresentou 403; acompanhamento disponível pela integração GitHub/Vercel, sem contornar credenciais.

## Próximos incrementos

Aprovação por alçada, termo/aceite, reserva durável, cancelamento Banese confirmado, substituição atômica e emissão. Depois: acompanhamento real de atraso/quitação, rescisão assistida e re-renegociação. Propostas deste incremento nunca são apresentadas como acordos ativados.
