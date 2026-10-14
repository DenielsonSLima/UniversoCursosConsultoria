# Restauração do modal financeiro

Status: PRONTO_PARA_PUBLICACAO. Versão 4.8.223/revisão232. Correção imediata solicitada pelo usuário em 14/10/2026, com três agentes e preservação expressa do visual anterior.

## Objetivo e escopo

Restaurar a apresentação aprovada do modal de baixa a partir da referência fornecida: cabeçalho azul-escuro com destaque verde, formulário organizado em cartão, ajustes visíveis e resumo lateral de composição com destaque para o valor recebido ou pago.

Manter o recurso solicitado de combinar duas ou mais formas e contas na mesma baixa, incluindo baixas parciais. O componente compartilhado atende Contas a Receber, Outros Créditos e Contas a Pagar, conservando as rotas e os fluxos especializados existentes.

## Contrato preservado

- O frontend coleta entradas e apresenta prévia e saldo canônicos do servidor.
- Cálculos de juros, multa, acréscimos, desconto, valor da baixa e saldo permanecem no backend/RPC.
- Confirmação, retomada idempotente, bloqueios durante envio, histórico e cancelamento bancário não mudam.
- Nenhuma migration, Edge Function, RPC ou operação financeira real faz parte desta correção.

## Base e isolamento

Base remota confirmada: main bf980f548fd57b3d3130938193a19df4ab2c54da, versão 4.8.221/revisão230. Produção confirmada READY no deployment dpl_Be5odqQsSstnZ2FBSUb4X8C7kdXP, com aliases universocc.com.br e www.universocc.com.br.

Os arquivos originais FinancialPaymentModal.tsx e FinancialPaymentEditor.tsx foram comparados com essa base remota e são idênticos. A implementação usa uma cópia isolada, preservando alterações paralelas. Os metadados deste lote partem da base remota, sem incorporar a revisão local reservada 4.8.222. A versão candidata salta para 4.8.223 para evitar conflito com essa reserva; isso não declara a revisão intermediária publicada.

## Aceite e validação

- Restaurar a hierarquia, as cores, o espaçamento e o resumo lateral da referência aprovada.
- Preservar inclusão e remoção de formas, valores parciais, saldo canônico, travas de confirmação e retomada.
- Antes da instrução adicional do usuário, fluxo React/JSDOM, TypeScript, ESLint focado e build concluídos com sucesso. Revisão cruzada dos três componentes sem bloqueantes; todos têm menos de 500 linhas.
- O usuário determinou que fará a conferência na tela e que não sejam abertos navegadores nem executados novos testes. Essa orientação encerra a verificação manual nesta entrega. Nenhum pagamento real foi executado.
- Alteração do smoke existente apenas adapta a seleção de conta/forma aos comboboxes restaurados, preservando as verificações anteriores.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-10-14-restauracao-modal-financeiro.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/financeiro/settlements/FinancialPaymentEditor.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentModal.tsx`
- `modules/gestor/financeiro/settlements/FinancialPaymentSummary.tsx`
- `modules/gestor/financeiro/settlements/financial-payment.smoke.test.mjs`

Total: 10 arquivos.
