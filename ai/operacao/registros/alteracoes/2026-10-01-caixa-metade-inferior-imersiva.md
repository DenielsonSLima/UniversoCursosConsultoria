# Caixa — correção da metade inferior imersiva

Estado: VALIDADO LOCALMENTE — PUBLICAÇÃO 4.8.148 AUTORIZADA

## Objetivo

Corrigir a entrega 4.8.147, cuja nova linguagem visual ficou concentrada na parte superior da tela. A metade inferior deve manter todas as leituras existentes, porém com hierarquia, relações e navegação realmente redesenhadas.

## Decisões

- O frontend não calcula valores financeiros. Totais, quantidades, percentuais, estados e posições continuam sendo exibidos diretamente dos contratos canônicos do backend.
- Posição total, posição líquida e patrimônio formam um único mapa estrutural, sem misturar caixa disponível com leitura patrimonial.
- Convênios e financiamento formam o capítulo de capital vinculado, preservando seus fluxos, saldos e mensagens de domínio independentes.
- Linha de corte vira um cockpit de cobertura, margem, composição de custos, carteira e risco de inadimplência, sem derivar dinheiro no navegador.
- Movimentação, localização do saldo e conciliação passam a formar uma única narrativa operacional.
- Estados vazios das distribuições ficam compactos; zero comprovado, indisponibilidade, carregamento e erro continuam distintos.
- Os antigos cards permanecem no código por compatibilidade, mas deixam de ser montados nesta jornada.

## Revisão com três agentes

- UX identificou que a primeira versão apenas encapsulava os cards antigos em disclosures e propôs quatro capítulos visíveis.
- Arquitetura confirmou que os contratos atuais já fornecem todos os campos necessários, inclusive posições visuais da série e valor exibido por conta.
- Qualidade definiu fixtures deliberadamente divergentes para provar que o React não recompõe totais a partir dos componentes.

## Resultado

- “Pulso operacional” combina gráfico de 90 dias, contas do escopo e trilho de conciliação.
- “Mapa estrutural” mostra a equação visual de caixa, patrimônio, empréstimos e posição total, seguida de posição líquida e atividade patrimonial.
- “Capital vinculado” mostra os fluxos independentes de convênios e financiamento.
- “Cockpit de equilíbrio” reúne cobertura atual/projetada, receita, linha de corte, custos, margem, inadimplência e referência histórica.
- Os capítulos ficam sempre visíveis e possuem atalhos por âncora, eliminando a falsa sensação de mudança causada pelas gavetas anteriores.

## Validação

- `npm run test:caixa-report`: 122/122 aprovados.
- Testes novos usam valores incompatíveis entre componentes e totais para confirmar que somente os valores canônicos retornados são exibidos.
- `./node_modules/.bin/tsc --noEmit`: aprovado.
- ESLint focado nos arquivos do lote: aprovado.
- `npm run build`: aprovado; apenas avisos preexistentes de divisão de chunks.
- Smoke autenticado no Safari local confirmou os quatro capítulos, as leituras canônicas e a navegação por âncoras.
- A captura automatizada do Safari não compôs a camada central, embora a árvore acessível, o DOM e a navegação estivessem completos; não foi usada como substituta de inspeção funcional.
- Todos os arquivos manuais tocados têm menos de 500 linhas.
- `npm run check:file-lines` continua apontando referências antigas ausentes no manifesto global; nenhuma pertence a este lote.

## Manifesto explícito

### Operação

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-01-caixa-metade-inferior-imersiva.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

### Caixa e testes

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/components/CaixaAdvancedAnalysis.tsx`
- `modules/gestor/caixa/components/CaixaDistributionDonuts.tsx`
- `modules/gestor/caixa/components/CaixaImmersiveLayout.test.tsx`
- `modules/gestor/caixa/components/CaixaLinhaCorteCard.tsx`
- `modules/gestor/caixa/components/CaixaLinkedCapitalOverview.tsx`
- `modules/gestor/caixa/components/CaixaLowerNarratives.test.tsx`
- `modules/gestor/caixa/components/CaixaMovimentacaoChart.tsx`
- `modules/gestor/caixa/components/CaixaMovementAndAccounts.tsx`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/caixa/components/CaixaStructuralOverview.tsx`
- `modules/gestor/caixa/caixa-linha-corte.test.ts`
- `modules/gestor/caixa/caixa-patrimonio-resumo.test.ts`
- `modules/gestor/caixa/caixa-posicao-liquida-resumo.test.ts`
- `modules/gestor/caixa/caixa-posicao-total-resumo.test.ts`
- `scripts/test-caixa-report.mjs`

Total: 21 arquivos.
