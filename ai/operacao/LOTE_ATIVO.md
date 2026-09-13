# Lote ativo

Estado: REVISADO — PUBLICAÇÃO AUTORIZADA EM EXECUÇÃO (4.8.61)

## Lote: 2026-09-13-proesc-regras-ciclos-composicao

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-13-proesc-regras-ciclos-composicao.md`.

- Três agentes: cobertura de ciclos; erro do resumo; composição dos pagamentos Proesc. Coordenador cuida regras comerciais e integração.
- Conferir todas as turmas importadas e exceções por matrícula. T42 em diante: segundo ciclo Banese se não emitido Proesc; anteriores mantêm legado conforme prova.
- Padrão informado: matrícula200 e rematrícula100 sem desconto, 12 mensalidades por ciclo de279,90 com desconto19,90 até vencimento; multa2% única e juros2%a.m proporcionais como T42. Preservar exceções e títulos existentes.
- Não emitir cobranças em massa. Leitura remota e preparação primeiro; alterações com pré/pós-condições, idempotência e evidência.
- Composição compartilhada em Caixa, Contas a Receber, conciliação, extrato e Outros Créditos. Usuário autorizou calcular os componentes ausentes; identificar regra calculada, preservar prova explícita e recebido real, exibir divergências.
- Regras e configuração prospectiva aplicadas às nove turmas; 392 configurações pendentes, nenhuma nova emissão. Dez workspaces financeiros conferidos, incluindo T42.
- Consulta de ciclos somente via API, com cache por unidade/janela e prova individual antes da geração. Não usar navegador conforme pedido do usuário.

## Entrega anterior

- Diário4.8.60 publicado PR153, squash b87c419c4a20e72f03aee98dbea1e2002d6db982; CI/Vercel/HTTP e versão confirmados. Smoke autenticado final pendente por navegação concorrente.
