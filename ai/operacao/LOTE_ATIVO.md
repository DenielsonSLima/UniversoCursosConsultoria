# Lote ativo

Estado: `VALIDADO — GITHUB / PREVIEW — 4.8.40`

## Lote: 2026-09-12-recebimentos-origem-periodo

- Pedido: alinhar Recebidos ao que efetivamente entrou no mês, conforme o Caixa; corrigir, aplicar e atualizar GitHub.
- Requisito esclarecido pelo usuário: o total de Recebidos deve usar a data do pagamento.
- Risco: consultas financeiras, grupos, totais, cache e exportação.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-recebimentos-origem-periodo.md`

### Aceite

1. Recebidos usa pagamento, inclusive para parcelas antecipadas ou atrasadas.
2. Indicador, grupos, expansão e exportação usam o mesmo período e escopo.
3. Pendentes, vencidos, cancelados e Todos preservam o filtro por vencimento.
4. Valores e datas dos registros não são alterados; guardas de acesso permanecem.
5. Conferir o caso reportado: cinco recebimentos no mês, total igual ao Caixa.
6. Validar RPCs, contratos focados, PDF nativo, Safari autenticado e CI/Preview.

- Três agentes: backend, apresentação/testes e integração/revisão.
- Entrega no PR 134; backend aplicado e smoke Safari aprovado. Frontend de produção não publicado.
