# Lote ativo

Estado: VALIDAÇÃO / PUBLICAÇÃO

## Lote: 2026-09-26-pdv-confirmacao-recibos-impressoras

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-26-pdv-confirmacao-recibos-impressoras.md`

- 4.8.108 / revisão 117; base 4.8.107. PR198 em validação, sem publicação em produção.
- Escopo: confirmação PDV, recibo canônico e impressoras/modelo. Reserva de três créditos por consulta no orçamento global de 60 segundos; autorização, polo, CAS/replay e financeiro no backend preservados.
- Recibo somente PAGO; UNKNOWN não repete envio. PERGUNTAR pelo navegador; AUTOMÁTICO bloqueado até homologação física. Não emitir, cancelar, pagar ou imprimir para testes.
- Cinco migrations e Edge v4 aplicadas; contratos, hashes, testes e smoke detalhados no registro. Lint, build e TypeScript final aprovados; Safari validou formulário, prévia e reimpressão condicionada ao motivo, sem despacho.
- Pendentes: CI, publicação, smoke autenticado em produção e homologação física. Artefatos regeneráveis ficam fora do manifesto.
