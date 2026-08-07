# Decisão: patrimônio, contas a pagar e empréstimos por polo

Data: 2026-08-06

## Contexto

O Gestor precisava registrar ativos por polo, organizar despesas como Contas a Pagar e permitir que um crédito contratado pela Matriz gerasse parcelas e custo econômico distribuído entre polos, sem alterar artificialmente o resultado operacional do Caixa.

## Decisões

- Patrimônio é um módulo separado abaixo de Financeiro, com pasta própria, serviços, hooks, formulário e modos card/tabela. O cadastro é associado a um polo e registra data de aquisição, tipo, descrição, quantidade, valor unitário, total, série e observação.
- Quantidade, valores e total de patrimônio são validados e totalizados exclusivamente pelas RPCs. A tela não multiplica nem compõe valores financeiros.
- A antiga apresentação de Despesas passa a se chamar Contas a Pagar. Ela preserva os dados e inclui desdobramento opcional: uma obrigação pode ficar em aberto como total único ou gerar parcelas canônicas para baixa posterior.
- Contas a Pagar podem ser rateadas somente quando lançadas pela Matriz. Há um único título e uma única baixa física integrais na Matriz; todos ou os polos selecionados recebem alocações econômicas canônicas em centavos. O rateio não duplica pagamento, banco nem título exigível nos polos participantes.
- Empréstimo criado pela Matriz deve usar `TODOS` ou `SELECIONADOS`: o crédito e a Conta a Pagar física ficam na Matriz, enquanto cada parcela distribui custo econômico para os polos do rateio. Empréstimo criado com o polo comum selecionado usa obrigatoriamente `SEM_RATEIO`: crédito, parcelas, Conta a Pagar e baixa ficam apenas naquele polo.
- A baixa é feita no polo responsável pelo contrato. Para contratos da Matriz, cada polo participante recebe somente o custo econômico rateado; para contrato próprio, não existe linha derivada em outra unidade. Assim, responsabilidade financeira e fluxo físico de banco permanecem separados.
- Caixa distingue operação de financiamento: crédito de empréstimo não é receita operacional; principal é quitação de dívida e juros/encargos são custo financeiro separado. Empréstimo não é classificado como despesa fixa ou variável operacional e não cria ponto de equilíbrio artificial.
- Realtime e TanStack Query usam escopo mínimo: Patrimônio invalida o polo do evento; empréstimos invalidam Matriz, consolidado e os polos devolvidos pelo backend no rateio. Não há varredura global de cache.
- RPCs financeiras autorizam antes de checar idempotência, comparam o payload imutável em replays e mantêm auditoria de escopo. Isso evita vazar existência de operações ou aceitar um mesmo `request_id` com conteúdo diferente.

## Limites e validação

- No fechamento não havia empréstimos legados; logo, o backfill de escopo não precisou classificar contratos históricos.
- O usuário deve liberar explicitamente as permissões de Patrimônio e Empréstimos para perfis personalizados que precisarem das novas telas. A sessão precisa ser renovada (ou receber recarga forçada) para refletir uma permissão alterada.
- A publicação Web permanece em lote único: commit/PR/Preview depois da validação, e produção somente com solicitação explícita.
