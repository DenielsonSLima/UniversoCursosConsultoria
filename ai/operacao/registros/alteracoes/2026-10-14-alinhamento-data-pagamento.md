# Alinhamento da data do pagamento

Versão 4.8.226, revisão 235. Base: f42f2dcd4c4ba3d9d1d639e32075408f6c014b95.

O rótulo da data usava uma caixa de linha inline mais alta que o rótulo em bloco da forma de pagamento. Aplicado display block ao rótulo da data para igualar a altura e o espaçamento dos dois campos. Nenhuma regra financeira alterada.

Sem testes ou navegador por instrução explícita do usuário; conferência visual reservada ao usuário.

## Manifesto explícito

- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-14-alinhamento-data-pagamento.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`

Total: 7 arquivos.
