# Lote ativo

Estado: `MIGRATIONS APLICADAS — EM PUBLICAÇÃO`

## Lote: 2026-08-31-conta-integral-e-desconto-banese-recebiveis

- Pedido: na visão do gestor, mostrar a conta recebedora completa, remover a
  repetição de empresa/polo e exibir abaixo do valor nominal o desconto dos
  boletos Banese identificados por nosso número.
- Autorização atual: o usuário autorizou explicitamente as três migrations,
  publicação no GitHub e deploy de produção após revisão por três agentes.
- Risco: crítico — financeiro, dados bancários, Supabase/RPC e eventual
  publicação.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-31-conta-integral-e-desconto-banese-recebiveis.md`.

### Escopo implementado

1. Exibir banco, agência e conta completos somente no feed financeiro seguro
   do gestor autorizado, preservando CPF mascarado e o escopo da conta por
   polo.
2. Remover `Empresa / polo` do detalhe da conciliação, pois o contexto já é
   definido pelo seletor superior; os IDs continuam no payload e nas guardas.
3. Exibir desconto configurado apenas em boleto Banese confirmado com nosso
   número canônico; diferenciar desconto vigente, expirado e efetivamente
   aplicado em título pago.
4. Não alterar cálculo, baixa manual, totalizadores, cobrança nem dados
   existentes.

### Diagnóstico confirmado

- A máscara de agência/conta era produzida deliberadamente pela RPC segura
  anterior, e não pela apresentação React.
- A empresa/polo era repetida em cada recebimento apesar do seletor global.
- O snapshot confirmado de `gateway_financial_terms` é a fonte do desconto do
  boleto; usar a configuração atual da turma/aluno poderia reescrever a leitura
  histórica.
- Em produção há 325 títulos Banese com nosso número canônico; 324 têm desconto
  confirmado no snapshot. Esta verificação foi somente leitura.
- As migrations remotas `20260831043316`, `20260831043336` e
  `20260831043524` foram aplicadas na ordem prevista.

### Validação local

- Contratos focados de interface, serviço e migrations: aprovados.
- ESLint dos arquivos tocados, TypeScript, RPC financeiro e build: aprovados.
- Limite de 500 linhas do manifesto: aprovado.
- A revisão independente adicionou vínculo obrigatório conta/polo e
  baixa-manual/recebível antes de liberar a identificação integral, além de
  fechar o helper das RPCs v3 por módulo Financeiro e aba Receber.
- Smoke remoto das RPCs: aprovado. A consulta técnica retornou 691 recebíveis;
  na primeira página, 137 tinham desconto configurado, 28 desconto aplicado e
  nenhum desconto apareceu sem nosso número. Um usuário sem permissão recebeu
  `42501`, e o feed seguro retornou agência/conta sem máscara.
- Smoke visual autenticado: pendente para o preview/produção desta publicação.

### Aceite para publicação

- Agência e conta aparecem completas apenas para gestor com Financeiro >
  Receber e polo autorizado.
- Uma conta sem vínculo com o polo do recebível não é enriquecida nem exposta.
- Um gestor sem Financeiro > Receber não executa as RPCs, mesmo que pertença ao
  polo consultado.
- `Empresa / polo` não aparece no detalhe da conciliação.
- O desconto aparece sob o valor nominal somente quando há nosso número e
  snapshot Banese íntegro; títulos pagos mostram somente desconto aplicado.
- Nenhum valor é pré-preenchido ou alterado na baixa manual.
