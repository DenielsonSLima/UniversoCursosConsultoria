# Financeiro e Caixa

Status: CANÔNICO. Última revisão: 2026-08-12.

## O que este módulo faz

O Financeiro administra recebíveis, pagamentos, regras de cobrança,
conciliação, despesas, transferências, empréstimos, outros créditos e saldos.
O Caixa apresenta a posição financeira e movimentações. Relatórios consolida
resumos, fluxo de caixa e inadimplência.

As telas ficam principalmente em:

- modules/gestor/financeiro/
- modules/gestor/caixa/
- modules/gestor/relatorios/
- modules/aluno/financeiro/
- modules/asaas/

## Regra de arquitetura

O frontend solicita e exibe. Valores, desconto, juros, multa, vencimento,
estado do recebível, baixa e autorização são definidos pelo backend, RPCs e
Edge Functions. Não calcule nem marque pagamento diretamente no navegador.

## Cobrança de dependência acadêmica

O fluxo atual é propositalmente separado do financeiro da matrícula técnica:

- cria uma única cobrança para a disciplina refeita;
- não cria parcelas recorrentes, carnê ou novo cronograma;
- mantém a matrícula técnica original intacta;
- usa descrição neutra: Disciplina: nome da disciplina;
- possui vencimento único, encargos próprios e aviso de não recebimento após
  60 dias;
- emite apenas boleto Banese no fluxo novo;
- libera academicamente somente depois da confirmação de pagamento.

Não usar a cobrança de dependência para alterar preço, parcelas ou condições
da turma original. A configuração da política de dependência deve ser feita
na tela apropriada e é gravada como snapshot no título para evitar mudança
retroativa.

## Configuração antes de cobrar

1. Configure contas bancárias e gateway autorizado na Matriz.
2. Defina regras financeiras da modalidade e, quando houver, regras próprias
   de dependência.
3. Confirme dados completos do pagador exigidos pelo banco.
4. Verifique que o polo e a turma pertencem ao escopo do operador.
5. Para boleto, confirme que a rota Banese e as credenciais privadas já estão
   ativas no backend.

Não inserir credenciais bancárias, URLs privadas ou tokens no frontend.

## Caixa e relatórios

Caixa, Financeiro e Relatórios usam consultas canônicas e devem manter
classificações coerentes. Uma alteração de categoria financeira pode afetar
receber, caixa, aging, relatórios e gateway; trate-a como mudança crítica.

## Fontes principais

- modules/gestor/financeiro/financeiro.service.ts
- modules/gestor/caixa/caixa.service.ts
- modules/gestor/relatorios/relatorios.service.ts
- modules/gestor/secretaria/dependencias-academicas/
- supabase/functions/gateways/
- supabase/functions/banese/
- supabase/functions/dependencia-banese-checkout/
- supabase/migrations/ ligadas a contas_receber, caixa e dependência
- ai/operacao/politicas/FINANCEIRO.md

## Validação recomendada

- Testar contratos e preview antes da emissão.
- Nunca usar dados reais de aluno nem emitir boleto real apenas para smoke.
- Validar idempotência: uma repetição não pode criar título duplicado.
- Validar pagamento, estorno e conciliação em ambiente controlado.

