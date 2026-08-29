# Lote ativo

Estado: `CONCLUIDO`

## Lote: 2026-08-29-selecao-banese-importados-verificados

- Pedido: esclarecer os 32 itens em revisão/erro e garantir que a conciliação consulte somente boletos pendentes comprovados pelo Nosso Número, inclusive os importados pela API Banese da turma de Radiologia.
- Registro: `ai/operacao/registros/alteracoes/2026-08-29-selecao-banese-importados-verificados.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-29-selecao-banese-importados-verificados.md`.
- Autorização: o usuário autorizou a correção financeira em produção e a atualização do GitHub no pedido de investigação da conciliação Banese.
- Risco: crítico, por envolver a seleção automática de consultas financeiras em produção.

### Resultado confirmado

1. Os 32 itens continuam em `QUARANTINED`: 19 de Radiologia exigem normalização de zeros à esquerda no Nosso Número e 13 da T42 falharam na guarda interna de persistência já corrigida. Nenhum dos 32 foi baixado, reemitido, cancelado ou reaberto.
2. Os 13 títulos novos da Adenize (rematrícula e 12 parcelas) continuam pendentes, sem pagamento, baixa, duplicidade de Nosso Número ou transação bancária duplicada.
3. Os 196 importados da API Banese em Radiologia voltaram a ser elegíveis somente com evidência local completa: emissão API registrada, termos confirmados e transação com Nosso Número, linha digitável e código de barras idênticos.
4. Histórico acadêmico puro e importações sem essa prova continuam fora da seleção automática.

### Fechamento

- A migration `20260829203000` foi aplicada e validada no banco de produção.
- A publicação GitHub usa exclusivamente o manifesto do registro e preserva alterações paralelas.
