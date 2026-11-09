# Despesas — clonagem, categoria e abertura

- Data: 2026-11-08.
- Classificação: mudança crítica de financeiro e publicação; um agente.
- Base atual: main 7145134403fb7605d0a4db1e1eebaad9aec69f80, versão 4.8.273.
- Candidata: 4.8.274, revisão 283.
- Escopo: somente Contas a pagar e nomes do cadastro financeiro.
- Lote ativo local de NFS-e é paralelo e foi preservado.

## Aceite

- Abrir Contas a pagar seleciona Despesas variáveis; fixas continuam acessíveis.
- Clonar existe em tabela/cartões de fixas e variáveis, agrupados ou não.
- Ao clonar, perguntar Pendente/Pago; somente depois abrir o formulário editável.
- Copiar descrição, categoria, base/ajustes, datas, conta disponível e forma de pagamento.
- Parceiro/tipo de credor ficam vazios; IDs, parcelas irmãs, vínculos, anexos e eventos não são reutilizados.
- A escolha posterior de parceiro não sobrescreve campos clonados com sugestões antigas.
- Não gravar nada até confirmação; origem preservada; retry idempotente.
- Categoria: corrigir os 17 nomes fora do padrão dentre os 29 cadastros observados, sem alterar IDs/tipos/vínculos.
- Não foram encontrados nomes duplicados por tipo após normalização.
- Criação/edição já normalizam no frontend; novo trigger garante a mesma regra na persistência.

## Contrato e segurança

- Quatro sobrecargas recebem data de pagamento obrigatória na assinatura, permitindo distinguir chamadas antigas.
- Assinaturas e corpos antigos não são substituídos; chamadas sem o argumento mantêm o comportamento anterior.
- Sobrecargas mantêm cálculos, rateio, convênio e transação no servidor; search_path vazio e autorização antes do replay.
- Raw é interno, sem EXECUTE de anon/authenticated/service_role; endpoints públicos somente authenticated/service_role.
- A data entra na validação do replay e no hash do convênio; descrição de parcela clonada não causa falso conflito.
- Cinco migrations versionadas ainda NÃO aplicadas em produção.
- Nenhuma despesa ou pagamento real foi criado/modificado durante a preparação.

## Validação

- Testes comportamentais: cópia explícita sem fornecedor/IDs; centavos; origem intacta; sugestão de outro parceiro preserva campos.
- PGlite descartável: normalização com acentos, backfill sem trocar vínculos/status/RLS, criação/edição futura.
- PGlite descartável: datas distintas, criação paga/pendente, retry com mesma chave, conflito de payload, rollback, rateio, convênio e negativa de acesso.
- Fixture estrutural sem dados reais; guards de acesso/conta e saldo do convênio são dublês; trigger de ajustes usa snapshot canônico.
- TypeScript focado e ESLint focado: aprovados. Doze testes comportamentais/SQL aprovados.
- Renderização dos componentes reais com dublês sem rede: formulário pago/pendente, datas, credor vazio, Clonar e aba variáveis aprovados.
- Manifesto explícito: 29 arquivos manuais, todos até 500 linhas.
- Check global local reportou 39 caminhos legados ausentes no workspace; não pertencem a este lote. CI validará checkout completo.
- Revisão independente (requesting-code-review): categoria clonada indisponível agora é limpa com aviso após consulta; envio aguarda catálogo; seleção nova inline preservada. Foco do formulário ajustado após escolha Pendente/Pago. Sem bloqueador SQL adicional.
- Navegador: controle nativo falhou com “Sky Computer Use native pipe startup failed”; host do browser também indisponível.
- Smoke visual/interativo autenticado de Clonar em desktop/mobile: PENDENTE; não substituído pelos testes automatizados.
- Build integrado e prévia: aguardando CI/Vercel.

- Publicação paralela de NFS-e preservada; metadados reconciliados na base atual antes da CI final.
- Entradas antigas 4.8.196–198 arquivadas integralmente para manter changelog ativo até 500 linhas.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/DespesasTab.tsx`
- `modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx`
- `modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormSettlementFields.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaListWorkspace.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCloneChoice.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-clone.model.ts`
- `modules/gestor/financeiro/despesas/components/despesa-clone.model.test.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesaSugestao.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `supabase/migrations/20261109021000_financial_category_names_uppercase.sql`
- `supabase/migrations/20261109021100_expense_explicit_payment_date.sql`
- `supabase/migrations/20261109021200_expense_rateio_explicit_payment_date.sql`
- `supabase/migrations/20261109021300_expense_rateio_replay_payment_date.sql`
- `supabase/migrations/20261109021400_expense_convenio_payment_date.sql`
- `supabase/tests/expense_clone_legacy.baseline.sql`
- `supabase/tests/expense_clone_payment.fixture.sql`
- `supabase/tests/expense_clone_payment.isolated.test.mjs`
- `supabase/tests/financial_categories_uppercase.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-08-despesas-clonagem-categorias.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `internal/versioning/changelog/2026-10-10-versoes-4-8-196-a-198.md`

Total: 29 arquivos.

## Publicação

- Preparar um commit atômico e PR por MCP GitHub.
- Publicação/migrations de produção dependem de pedido explícito após revisão da candidata.

