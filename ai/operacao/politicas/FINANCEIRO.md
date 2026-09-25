# Financeiro e cobranças

Carregue esta política somente para financeiro, Caixa, patrimônio, empréstimos, contas a pagar ou cobrança.

## Regras gerais

- Cálculos, valores, parcelas, juros, multa, desconto, saldo e rateio pertencem ao backend/RPC.
- O frontend coleta entradas e exibe o resultado canônico.
- Toda mutação é autorizada por escopo, idempotente, auditável e conciliada por TanStack Query/Realtime.
- Ciclos técnicos seguem o [contrato de elegibilidade, matrícula local, baixa, estorno e C2](../../../docs/decisions/ciclos-tecnicos-cobrancas.md); origem importada não autoriza nova emissão.

## Gateways

- Novas cobranças usam Banese para boleto/Pix e Mercado Pago para cartão.
- Banese não processa cartão.
- BolePix (boleto com QR Pix vinculado) segue o contrato homologado e já publicado. Pix Banese avulso permanece bloqueado até liberação formal; não confundir as duas operações.
- Mercado Pago permanece bloqueado para cobrança real até homologação de cartão, webhook, idempotência e recuperação ambígua.
- Asaas e Banco Inter não podem ser selecionados para novas cobranças; preserve somente o histórico necessário.
- API Banese é o fluxo principal. CNAB240 é contingência e exige EDI7 real.
- Boleto e carnê são montados pelo sistema e entregues por rota privada/autenticada.

## Ativação acadêmica

- Pagamento confirmado ativa automaticamente EAD, curso livre e especialização.
- Curso técnico continua aguardando análise documental.

## Patrimônio, contas e empréstimos

- Patrimônio é cadastro por polo e seus totais são calculados no banco.
- Conta a Pagar rateada nasce fisicamente na Matriz; polos recebem somente alocação econômica, sem título ou baixa duplicada.
- Empréstimo da Matriz usa TODOS ou SELECIONADOS; empréstimo de polo comum usa SEM_RATEIO.
- Principal e quitação pertencem a financiamento; juros/encargos podem aparecer como custo financeiro separado.
- Caixa não mistura financiamento ao resultado operacional.
