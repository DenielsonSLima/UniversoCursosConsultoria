# Parceiros PJ: fantasia, edição e cadastro dentro da despesa

Pedido de 07/11/2026. Mudança crítica por envolver cadastro persistido e leitura de despesas; três agentes solicitados pelo usuário. Candidato 4.8.263/revisão 272. Entrega GitHub autorizada, publicação do site em produção não solicitada nesta conversa.

## Comportamento e aceite

- Razão social continua canônica em `parceiros.nome`; fantasia possui coluna própria e round-trip no cadastro, edição e leitura. Busca de parceiros PJ considera ambos os nomes.
- Detalhes PJ usa padrão compacto e seletores próprios para status, categoria, parceria e UF. Botões “+” reutilizam os cadastros existentes e selecionam o registro criado sem descartar o rascunho.
- “Novo” junto à seleção de credor abre o cadastro do tipo escolhido. O formulário da despesa continua montado, inerte ao fundo; seleção depende de retorno autorizado do polo. Falha depois de salvar permite repetir somente a leitura, sem duplicar o cadastro.
- Tabela e cartão mostram fantasia em linha abaixo da categoria. Razão social é fallback; valor, baixa, recibo e PDF continuam usando seus contratos canônicos. Lookup complementar em lote usa apenas fornecedores das despesas autorizadas e respeita RLS.

## Banco e reconciliação

Migration `20261107210551_partner_trade_name` aplicada via MCP Supabase, conferida no ledger e preservada nesta entrega. Adiciona somente coluna nullable, sem alterar RLS/grants ou colunas anteriores.

Conferidos todos os oito parceiros PJ. Quatro nomes fantasia confirmados e preenchidos; quatro sem prova cadastral permaneceram nulos. Prestek também confirmado expressamente pelo usuário. BrasilAPI indisponível (403): para os demais preenchimentos, usados CNPJ e razão coincidentes em fontes públicas convergentes; conferência não substitui comprovante oficial. Evidências com identificadores permanecem temporárias fora do repositório/RAG. Divergência de uma razão social foi mantida para conferência separada, sem alteração silenciosa.

Vínculo do parceiro à despesa indicada concluído por MCP, com guardas de ID/polo/valor/status e validação de que somente fornecedor/updated_at mudaram. Auditoria existente confirmou o vínculo e os quatro preenchimentos. Nenhuma operação de pagamento ou estorno executada.

## Validação

- 34 testes focados aprovados (mapper de parceiros, round-trip fantasia, busca e lookup financeiro com fallback e lote).
- ESLint e TypeScript focados dos arquivos de implementação aprovados; bundle ESM dos componentes reais aprovado.
- Smoke Safari com dados sintéticos: edição/retorno de fantasia, cadastro e seleção de categoria/tipo, pesquisa sem acento e teclado; Novo credor PJ salva e seleciona, cancelamento preserva rascunho e ajustes.
- Layout PJ desktop e 390 px, linha de fantasia na tabela desktop e cartão 390 px conferidos visualmente. Smoke de Aluno/Professor/PF não executado; reutilizam formulários e mutações existentes.
- Revisão independente da criação de credor e metadados financeiros sem achado material.
- Candidato remoto montado sobre `bbfa9b2c67681534c9a895769c2393425a226989`: cinco fontes financeiras locais estavam anteriores ao contrato publicado; o pacote usa as versões remotas e aplica somente o delta de fantasia. Rotina canônica de confirmação, summary e interface de baixas parciais preservadas. Bundle e quatro testes do lookup reexecutados sobre esse pacote; smoke Safari mostrou fantasia, pago 30/saldo 90 e baixa parcial simultaneamente.
- CI inicial aprovou TypeScript, lint, teto e 14/15 workflows; o guard antigo do cartão foi atualizado para a função de rótulo já testada. Build Vercel da prévia aprovado.
- Smoke autenticado do site com o novo código depende de publicação. Alterações de dados conferidas diretamente no banco; a tela do usuário já confirmou o vínculo.
- Os 26 arquivos do manifesto respeitam 500 linhas (máximo: 436). `npm run check:file-lines` do workspace encontrou 39 falhas por fontes ausentes fora deste lote; não foram alteradas. CI/Preview usará a base remota completa.
- Artefatos temporários e dados da auditoria não integram o manifesto. Build integral será validado no CI/Preview da branch isolada.

## Manifesto explícito

- `.github/workflows/parceiros-nomes-credores.yml`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-trade-name.test.ts`
- `modules/gestor/parceiros/parceiros-filters.model.ts`
- `modules/gestor/parceiros/parceiros-filters.model.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/pj/ParceiroPJDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/pj/PJIdentification.tsx`
- `modules/gestor/parceiros/components/viewparceiros/pj/pj-details.presentation.tsx`
- `modules/gestor/parceiros/components/viewparceiros/pj/pj-details.css`
- `modules/gestor/financeiro/despesas/components/DespesaForm.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaFormCoreFields.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCredorPicker.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaNovoCredorModal.tsx`
- `modules/gestor/financeiro/despesas/despesas.mapper.ts`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/financeiro/despesas/despesas-lancamentos.service.ts`
- `modules/gestor/financeiro/despesas/despesas-fornecedores.ts`
- `modules/gestor/financeiro/despesas/despesas-fornecedores.test.ts`
- `modules/gestor/financeiro/despesas/components/DespesaTable.tsx`
- `modules/gestor/financeiro/despesas/components/DespesaCard.tsx`
- `supabase/migrations/20261107210551_partner_trade_name.sql`
- `ai/operacao/registros/alteracoes/2026-11-07-parceiros-fantasia-credores.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

- `scripts/test-despesas-contas-pagar-contract.mjs`

Total: 26 arquivos.
