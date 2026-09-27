# Lote ativo

Estado: VALIDAÇÃO / PUBLICAÇÃO

## Lote: 2026-09-26-pdv-confirmacao-recibos-impressoras

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-26-pdv-confirmacao-recibos-impressoras.md`

- Versão preparada: 4.8.108 / revisão 117; base publicada 4.8.107 / revisão 116.
- Escopo: consulta temporária do PDV no orçamento Banese, com reserva de três créditos por consulta dentro do orçamento global da janela móvel de 60 segundos; recibo canônico vetorial; estações, impressoras/modelo e escolha após confirmação.
- Testes locais: UI/PDF/loop/cache 24; SQL impressoras 19; SQL orçamento 45; Edge 31; impressão compartilhada 8. Runner e cobertura CI incluídos.
- Guardas: somente recebível avulso autorizado, sem emissão/cancelamento; financeiro no backend, replay/CAS, mesma fila/orçamento, recibo apenas PAGO e UNKNOWN sem repetição automática.
- Cinco migrations aplicadas via MCP; ensaio remoto de 11 contratos com rollback/financeiro preservado/zero despachos, claim pago INELIGIBLE/zero runs e ACL restrita aprovados. Edge v4 ACTIVE com verify_jwt=true; SHA-256 do pacote: `648d53cc7f215e72bba1aef5ea04b77ea66b610b30a9d25d131092eee676ad8c`.
- PDF de 58/80 mm aprovado em texto e visual. Safari local confirmou formulário real, edição Epson TM-T20, modelo de 80 mm, prévia PDF real e escolha de comprovante após pagamento, sem impressão.
- Lint dos 46 caminhos, build e TypeScript aprovados; nova execução final de TypeScript em andamento. GitHub/produção ainda não publicados; CI e smoke autenticado final pendentes.
- Modelo/interface real da impressora não confirmados. PERGUNTAR funciona pelo navegador; AUTOMÁTICO e transportes silenciosos permanecem bloqueados até homologação.
- Não emitir, cancelar ou pagar novos títulos para testes. PDFs/harnesses regeneráveis e dados de diagnóstico ficam fora do manifesto.
