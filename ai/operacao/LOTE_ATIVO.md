# Lote ativo

Estado: `IMPLEMENTAÇÃO VALIDADA — AUDITORIA DE BAIXA MANUAL`

## Lote: 2026-09-07-recebiveis-auditoria-baixa-manual

- Pedido: mostrar quem deu baixa manual, com data e hora, na tela A Receber.
- Continuação da entrega de A Receber com GitHub e publicação solicitados nesta conversa.
- Risco: projeção de auditoria financeira e publicação; sem alteração de saldos.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-07-recebiveis-auditoria-baixa-manual.md`

### Aceite

1. Nome do operador vem da baixa persistida no servidor.
2. Mostrar conclusão com data, hora e segundos em Maceió, separada do pagamento.
3. Mesma informação em linhas e cartões, sem inventar dados históricos ausentes.
4. Preservar autorização, filtros, valores e paginação; excluir auditoria estornada.
5. Validar contrato remoto e tela; publicar somente o manifesto revisado.
