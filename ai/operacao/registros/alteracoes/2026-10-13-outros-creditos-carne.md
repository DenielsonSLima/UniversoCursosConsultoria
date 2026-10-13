# Carnê avulso em Outros Créditos

Estado: EM_PUBLICACAO_AUTORIZADA. Usuário autorizou revisar, aplicar e atualizar GitHub/produção em 13/10/2026. Ainda sem emissão bancária real neste lote.

## Objetivo e diagnóstico

Outros Créditos já permite pagador sem turma, mas cria somente um título. O carnê acadêmico exige matrícula. Acrescentar um plano avulso com 1–60 parcelas mensais, valor por parcela, juros/multa por atraso, desconto de pontualidade e até duas taxas opcionais de matrícula/rematrícula. As taxas não criam nem reativam vínculo acadêmico.

## Manifesto explícito

- `modules/gestor/financeiro/financeiro.types.ts`
- `modules/gestor/financeiro/financeiro.receivables.service.ts`
- `modules/gestor/financeiro/outros-creditos/OutrosCreditosTab.tsx`
- `modules/gestor/financeiro/outros-creditos/useOutrosCreditos.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditRow.test.tsx`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.types.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.model.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.service.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan-attempt.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan.test.tsx`
- `modules/gestor/financeiro/outros-creditos/useOtherCreditPlan.ts`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanForm.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanPreview.tsx`
- `modules/gestor/financeiro/outros-creditos/OtherCreditPlanModal.tsx`
- `modules/gestor/financeiro/transferencias/components/TransferenciaPicker.tsx`
- `supabase/migrations/20261013170000_other_credit_plans_schema.sql`
- `supabase/migrations/20261013170100_other_credit_plans_calculator.sql`
- `supabase/migrations/20261013170200_other_credit_plans_rpc.sql`
- `supabase/migrations/20261013170300_other_credit_plans_integrity.sql`
- `supabase/tests/other_credit_plans.fixture.sql`
- `supabase/tests/other_credit_plans.isolated.test.mjs`
- `supabase/tests/other_credit_plans.banese.test.mjs`
- `supabase/functions/gateways/api/banese-financial-terms.ts`
- `supabase/functions/gateways/api/banese-other-credit-financial-terms.ts`
- `supabase/functions/gateways/api/banese-other-credit-financial-terms.test.ts`
- `supabase/functions/banese/internal/carne/carne-pdf.ts`
- `supabase/functions/banese/internal/carne/carne-pdf.test.ts`
- `supabase/functions/other-credit-carnet-document/index.ts`
- `supabase/functions/other-credit-carnet-document/document-reader.ts`
- `supabase/functions/other-credit-carnet-document/document-reader.test.ts`
- `supabase/functions/other-credit-carnet-document/document-policy.ts`
- `supabase/functions/other-credit-carnet-document/document-policy.test.ts`
- `supabase/functions/other-credit-carnet-document/document-fixture.ts`
- `supabase/config.toml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-13-outros-creditos-carne.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `supabase/functions/asaas/api/index.ts`
- `supabase/functions/asaas/api/request-context.ts`
- `supabase/functions/asaas/api/configuration.actions.ts`
- `supabase/functions/asaas/api/enrollment.actions.ts`
- `supabase/functions/asaas/api/cancellation.actions.ts`
- `supabase/functions/asaas/api/settlement.actions.ts`
- `supabase/functions/asaas/api/receivable-sync.action.ts`
- `supabase/functions/asaas/api/receivable-sync.action.test.ts`
- `supabase/functions/asaas/api/manual-settlement-reversal.contract.test.ts`
- `modules/gestor/financeiro/outros-creditos/other-credit-plan-error.ts`
- `supabase/migrations/20261013170400_other_credit_payer_effective_tab_scope.sql`
- `supabase/tests/other_credit_payers_scope.isolated.test.mjs`
- `supabase/tests/other_credit_plans.production.rollback.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 53 arquivos.

## Aceite e guardas

- Prévia, calendário e valores calculados por RPC; editar entradas invalida a prévia.
- Criação atômica, autorização de identidade/aba/polo e perfil de escrita anterior a replay, payload imutável, auditoria e isolamento entre planos.
- Títulos permanecem `OUTRO_CREDITO`, com vínculos acadêmicos nulos e snapshot próprio.
- Reutilizar emissão Banese individual; persistir plano antes da chamada bancária, sem duplicar títulos ou repetir casos ambíguos.
- Prévia financeira vem da RPC; download entrega um Blob PDF vetorial privado, com termos bancários confirmados e identidade exclusiva de plano/pagador/convênio. A impressão pelo leitor usa esse mesmo PDF.
- Preserve fluxo avulso/PDV e alterações paralelas existentes nos arquivos compartilhados.
- Novos títulos registram intenção `BOLETO`; provedor, termos e confirmação bancária continuam vazios até a emissão oficial. A ação de emissão exige a aba Outros Créditos antes de carregar credenciais ou chamar o banco.
- Tentativa de criação preserva UUID/payload na sessão; timeout ou pedido recuperado nunca permitem trocar de chave após rejeição posterior. Rejeição SQL definitiva da primeira chamada libera reconferência. Bloqueio síncrono impede chamadas simultâneas antes da nova renderização.

## Validação e limites

- As cinco migrations foram executadas de fato em PostgreSQL/WASM isolado (PGlite), com fixtures sintéticas: calendário 31/fevereiro bissexto/março, 60 parcelas + duas taxas, arredondamento, taxas sem desconto, criação atômica, rollback da última parcela, replay, drift, referências, perfis, aba/polo, ACL e identidade imutável.
- Contrato entre runtimes aprovado: JSON da criação SQL passa pelo resolvedor financeiro compartilhado e vira payload Banese correto, sem consulta acadêmica. Divergência de termos confirmados e snapshot ausente falham explicitamente.
- 28 testes de interface/retomada/PDV aprovados; lint focado e TypeScript completo sem erros. Campo monetário inalterado preserva a prévia ao perder foco.
- 56 testes dos pacotes Edge finais aprovados (29 API + 27 documento); a suíte inclui regressões técnicas/dependência, mínimo acadêmico, 62 títulos avulsos em 21 páginas, estados parciais, identidade, Pix e autorização anterior à emissão. Regressões específicas da API/baixa/estorno também aprovadas.
- `deno check --no-lock` aprovado para API e endpoint PDF. O roteador da API foi dividido somente por responsabilidade para cumprir o teto; os corpos das 15 ações antigas foram comparados com o original local anterior à extração. A alteração funcional é a guarda específica na emissão de títulos do plano.
- PDF sintético composto pelo exportador nativo: página relevante renderizada e inspecionada, texto extraído e `pdfimages` com somente logos isoladas/máscaras. Taxas, parcelas, juros, multa e desconto legíveis; nenhum PDF/PNG temporário integra o manifesto.
- `npm run check:file-lines` aprovado; todos os 53 arquivos do manifesto têm até 500 linhas físicas. Versão candidata 4.8.216 / revisão 225, recomposta sobre main 3d399c41563bd7fd411c9a34270ec229ae077252 (4.8.215).

Safari verificado em 13/10/2026: aba Universo na tela pública de login, sem sessão de gestor. O usuário informou que fará pessoalmente o teste da tela; não foi alegado smoke autenticado nesta execução. Nenhum título real foi emitido.

## Entrega remota

Produção autorizada explicitamente pelo usuário. Cinco migrations aplicadas via MCP Supabase, com correspondência imutável entre prefixo preparado e ledger real:

| Fonte preparada | Ledger remoto | Nome |
| --- | --- | --- |
| 20261013170000 | 20261013233041 | other_credit_plans_schema |
| 20261013170100 | 20261013233045 | other_credit_plans_calculator |
| 20261013170200 | 20261013233048 | other_credit_plans_rpc |
| 20261013170300 | 20261013233052 | other_credit_plans_integrity |
| 20261013170400 | 20261013233056 | other_credit_payer_effective_tab_scope |

Ensaio real `other_credit_plans.production.rollback.sql` aprovado: prévia/criação de quatro títulos, calendário, replay, auditoria, Realtime e imutabilidade. ROLLBACK confirmado por consulta independente; nenhum plano, título ou cobrança de teste permanece.

Readback: dez corpos SQL idênticos às fontes; RLS, grants, constraints, índices e triggers confirmados. A tabela nega acesso direto a anon/authenticated; as três RPCs autenticadas fazem autorização interna. O advisor registra o alerta informativo de SECURITY DEFINER executável por authenticated, comportamento deliberado dessas RPCs com search_path vazio e autorização por identidade/aba/polo ([critério do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

Edge `asaas-api` v103 e `other-credit-carnet-document` v1 ACTIVE, JWT obrigatório. Readback do documento: 26/26 arquivos idênticos. API: 111 arquivos idênticos; dois suplementos exclusivamente de tipos são omitidos pelo extrator remoto. Nenhuma dependência de runtime divergente.

Candidato recomposto sobre Git main 4.8.215: build de produção, TypeScript completo e checagem de limites aprovados. Publicação GitHub/Preview em andamento; teste visual/bancário legítimo será feito pelo usuário conforme sua instrução. Nenhuma emissão bancária real foi feita por esta execução.

## Revisão adicional de produção

- Recuperação de criação incerta consulta primeiro o plano existente e compara identidade/polo/input; recuperação bancária de emissão ambígua usa consulta explícita, sem novo POST. Estado CREATING impede nova emissão e API_REVIEW exige conferência.
- Busca de pagadores usa as permissões efetivas por aba, com coalesce em todas as guardas para negar identidade, papel ou permissão ausentes. Filtros e ACLs foram preservados.
- Montantes de cada título respeitam as dez posições monetárias do código de barras Banese; valores sem representação são rejeitados antes da criação.
- Ensaio remoto transacional executado e aprovado com RPCs reais, auditoria, Realtime, replay e imutabilidade; termina em ROLLBACK e verifica ausência de plano/títulos, sem chamada bancária.
- Git main e suas alterações paralelas foram reconstruídos em candidato isolado; registry conserva o lote do contrato 4.8.213–215. Os pacotes Edge preservam dependências remotas externas ao lote e incluem somente o novo fluxo e suplementos de tipagem sem mudança de JavaScript.

## Fechamentos anteriores preservados

Lote: 2026-10-13-contrato-financeiro-individual. Retomada após teste do usuário: a revisão corrigida não tinha sido disponibilizada no cadastro. Migration do modelo aplicada como `20261013173710`; revisão 8 V4 em EM_REVISAO, com histórico próprio, aguardando aprovação pelo fluxo autenticado. Infraestrutura das sete migrations já verificada em produção. Ajuste 4.8.215 corrige também a prévia estrutural V4. Segunda via histórica permanece imutável; nova emissão usa o modelo aprovado e as condições efetivas. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-13-contrato-financeiro-individual.md`.


Lote: 2026-10-11-cadastro-aluno-hidratacao. Publicação autorizada concluída em 11/10/2026: PR304 → PR305 → PR306, versão 4.8.212, main `14b285f46fde84fb08317422cf51d865bc82433b`. Árvores publicadas idênticas às revisadas; CI, Previews e deployment final READY. Quatro migrations aplicadas por MCP e Edge portal-user-management v40 conferida. Os três registros abaixo contêm correspondência dos ledgers e provas de entrega.

Conciliação financeira autorizada concluída separadamente: quatro recebíveis pagos, total R$ 1.142,68, valores e datas exatos, auditoria conferida e replay sem duplicidade. Uma tentativa anterior abortou integralmente por renovação automática dos snapshots; nova conferência confirmou equivalência antes da execução v2. Payloads, identificadores e provas permanecem privados fora do repositório.

Pendência real: smoke autenticado do cadastro, emissão/impressão do boletim e recuperação. Safari oficial retornou ao login; novo login foi solicitado ao usuário. Smoke público passou. Não houve envio de recuperação ou gravação de cadastro real para testar. Evidências sintéticas e readback de banco/Edge não substituem esse smoke.

Manifestos de produto preservados: boletim (32 arquivos), recuperação (23) e cadastro (8), cada um em sua PR. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-11-cadastro-aluno-hidratacao.md` (8 arquivos do produto). Manifesto exclusivo deste recibo local de fechamento, sem fonte de produto, migration, versão ou changelog adicional:

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-11-aluno-boletim-pdf-identidade.md`
- `ai/operacao/registros/alteracoes/2026-10-11-recovery-link-identity.md`
- `ai/operacao/registros/alteracoes/2026-10-11-cadastro-aluno-hidratacao.md`

Resultados de produção também registrados remotamente nas descrições das PRs304,305 e306. Os adendos locais de fechamento não geraram novo deploy.

O CI inicial identificou excesso de trechos no RAG (90/80); o lote ativo foi resumido em dois parágrafos, com o histórico integral preservado acima. Nenhuma política, skill, agente ou regra do índice foi alterada.

O lint global do CI identificou import não utilizado de apiSecretName após a divisão do roteador. Removido somente esse import; lint global e Deno check novamente aprovados. asaas-api v103 substitui v102 com readback idêntico ao pacote final.
