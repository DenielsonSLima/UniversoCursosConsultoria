# Lote ativo

Estado: PUBLICADO — HOMOLOGAÇÃO FÍSICA PENDENTE

## Lote: 2026-09-26-pdv-confirmacao-recibos-impressoras

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-26-pdv-confirmacao-recibos-impressoras.md`

- 4.8.108 publicada pelo PR198, CI e Safari aprovados. Ajuste 4.8.109 / revisão 118 retira o fundo do recibo térmico por pedido explícito; manifesto de seis arquivos no registro.
- Escopo: confirmação PDV, recibo canônico e impressoras/modelo. Reserva de três créditos por consulta no orçamento global de 60 segundos; autorização, polo, CAS/replay e financeiro no backend preservados.
- Recibo somente PAGO; UNKNOWN não repete envio. PERGUNTAR pelo navegador; AUTOMÁTICO bloqueado até homologação física. Não emitir, cancelar, pagar ou imprimir para testes.
- Cinco migrations e Edge v4 aplicadas; contratos, hashes, testes e smoke detalhados no registro. Lint, build e TypeScript final aprovados; Safari validou formulário, prévia e reimpressão condicionada ao motivo, sem despacho.
- Safari validou Impressoras, Recebidos e PDF real. Correção térmica passou 25 testes e renderização 58/80 mm; pendentes publicação 4.8.109 e homologação física. Artefatos regeneráveis ficam fora do manifesto.
