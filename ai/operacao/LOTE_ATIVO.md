# Lote ativo

Estado: `PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA VIA PR #103`

## Lote: 2026-08-31-hotfix-layout-valor-desconto-recebiveis

- Pedido: corrigir a sobreposição do valor e dos textos de desconto com as
  ações na tabela desktop de Contas a Receber.
- Autorização atual: o usuário autorizou explicitamente o merge do PR #103 e a
  publicação em produção em 31/08/2026.
- Risco: crítico — apresentação de informações financeiras e publicação.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-31-hotfix-layout-valor-desconto-recebiveis.md`.

### Escopo implementado

1. Aumentar a largura mínima da tabela desktop de 960 para 1080 pixels.
2. Aproximar `Valor` de `Datas`, reservar 17% para o resumo financeiro e 14%
   para as ações.
3. Reduzir discretamente a tipografia auxiliar do desconto e de sua validade.
4. Preservar cards responsivos, cálculos, baixas, boletos, valores e regras do
   backend.

### Diagnóstico confirmado

- A coluna `Valor` recebia 11% da grade e o texto era impedido de quebrar
  linha; o conteúdo avançava sobre os botões da coluna `Ações`.
- As cinco capturas fornecidas reproduzem o problema em títulos pendentes e
  pagos. Os valores exibidos estão corretos; a falha é exclusivamente visual.
- O `main` remoto de origem é
  `4f316c624238b0cf0c83ea9537682a8801165b5c`.

### Validação local

- 18 testes focados: aprovados.
- ESLint dos três arquivos do produto: aprovado.
- `npx tsc --noEmit`: aprovado.
- Limite de 500 linhas do manifesto: aprovado.
- Smoke visual autenticado: pendente porque esta sessão não possui navegador
  conectado.

### Aceite para publicação em produção

- O resumo de valor e desconto não invade a coluna de ações na grade desktop.
- `Desconto do boleto` usa 10 pixels e `Válido até` usa 9 pixels.
- A alteração não modifica dados nem regras financeiras.
- O PR #103 possui um commit atômico, revisão independente aprovada, CI verde e
  Preview Vercel aprovada antes do merge.
