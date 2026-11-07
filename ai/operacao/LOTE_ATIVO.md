# Lote ativo

## Lote: 2026-11-07-campos-monetarios-centavos

Publicar máscara monetária automática solicitada pelo usuário: dígitos deslocam centavos e exibem duas casas, seguindo Contas a Receber, com vírgula extra sem limpar o campo. Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-07-campos-monetarios-centavos.md`. Candidato 4.8.261/revisão 270 sobre main 55b8bdc8e12b2192e8c1592d76c0dfb2147fe44d (Biblioteca 4.8.260), preservando integralmente as entregas anteriores e alterações paralelas do workspace.

Três agentes implementaram e revisaram. 78 testes focados, smoke DOM de pagamentos, TypeScript e lint globais, teto global de linhas e build completo aprovados; Safari desktop/390px confirmou digitação e conversão com dados sintéticos. Base259 passou nos 12 workflows e Preview, mas Biblioteca 260 entrou durante a CI: incorporar seu delta remoto e repetir a validação integrada/CI na base 260. Baixa de despesas conserva wrapper FinancialPaymentModal; máscara integrada no editor ativo. Produção explicitamente solicitada; aceite: digitação contínua, separadores sem apagar, exclusão e colagem, percentuais/quantidades preservados. Sem migration ou transação financeira real.
