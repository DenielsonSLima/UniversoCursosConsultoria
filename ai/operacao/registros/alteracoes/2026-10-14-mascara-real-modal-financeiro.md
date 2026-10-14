# Máscara de real no modal financeiro

Status: PRONTO_PARA_PUBLICACAO. Versão 4.8.224/revisão233.

## Escopo

Aplicar máscara brasileira durante a digitação nos valores de cada forma de pagamento, juros, multa, desconto e outros acréscimos. Dígitos são apresentados como centavos, com vírgula, duas casas e separador de milhares: 1999 vira 19,99. Valores previamente carregados conservam seu significado. A máscara manipula texto, sem cálculos financeiros. Layout, serviços e banco permanecem iguais.

## Orientação do usuário

Sem novos testes ou navegador; conferência na tela será feita pelo usuário. Publicação autorizada no contexto da correção. Base main ecbdd16dfaa59ae27d84925e618820d813d43087.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-10-14-mascara-real-modal-financeiro.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`

Total: 7 arquivos.
