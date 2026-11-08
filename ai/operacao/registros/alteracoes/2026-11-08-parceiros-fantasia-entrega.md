# Nome fantasia: recuperação da entrega e cartões visíveis

Pedido de 08/11/2026, retomando as fotos do site 4.8.265. Três agentes solicitados: auditoria GitHub/PJ, contrato de despesas e leitura do banco. Base remota `ce8888e43a89d75aca6e9faa0670baaa5e19d810`. Candidato inicial 4.8.266/revisão 275; rebase final 4.8.267/revisão 276 sobre `9a10e5bd13df920206ae77b41faed81ac124a7e2`, preservando a nova entrega NFS-e.

## Diagnóstico e aceite

O PR #358 permaneceu aberto: seu código não chegou ao main. Os dados já estavam salvos no banco, mas produção continuava com mapper/detalhes antigos. O cartão anterior exibia fantasia apenas no tooltip; faltava apresentação visível.

- Cartões PJ: fantasia como título; razão social abaixo. Sem fantasia, título mantém a razão. Nomes iguais não duplicam linhas.
- Detalhes/cadastro/busca: recuperado round-trip de fantasia e razão social separadas, seletores próprios e botões de cadastro de categoria/parceria.
- Despesa: fantasia na linha abaixo da categoria, com razão social como fallback. Dados canônicos de fornecedor, recibos, cálculo, baixa e summary preservados.
- Novo credor: cadastro sem abandonar a despesa e seleção somente após resposta autorizada por polo.
- Nenhuma nova alteração no banco: oito PJs, quatro fantasias preenchidas, vínculo Prestek e pagamento de R$ 120 conferidos. Migration aplicada em 07/11 preservada byte a byte.
- Base mantém integralmente os dois commits NFS-e posteriores ao lote inicial; fontes do pacote são as do PR remoto validado, nunca arquivos locais financeiros anteriores.

## Validação e entrega

38 testes focados aprovados nesta retomada, incluindo quatro testes comportamentais adicionais do cartão (fantasia, ausência, branco e nomes iguais); ESLint e TypeScript focados aprovados. O lote anterior tem 34 testes focados e 15 workflows aprovados. O novo candidato repete o CI integral e gera Preview antes da entrega. O teste de cartão roda em CI com as dependências instaladas.

Smoke Safari desktop/390 px aprovado para fantasia visível/razão secundária no cartão, fallback sem fantasia, despesa com fantasia abaixo da categoria e baixo parcial pago30/saldo90, detalhes/edição PJ com campos separados e seletores próprios. Revisão independente sem achado material. Verificação final de CI/Preview e publicação será registrada no PR. Não registrar dados pessoais ou identificadores da auditoria neste documento. Produção explicitamente autorizada pelo usuário em 08/11/2026 após CI/Preview aprovados. Rebase altera somente metadados e preserva integralmente o novo main; repetir CI/Preview do commit final e verificar o site após publicação.

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
- `modules/gestor/parceiros/components/cards/PJIdentityPreview.tsx`
- `modules/gestor/parceiros/components/cards/PJIdentityPreview.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-08-parceiros-fantasia-entrega.md`

Total: 29 arquivos.
