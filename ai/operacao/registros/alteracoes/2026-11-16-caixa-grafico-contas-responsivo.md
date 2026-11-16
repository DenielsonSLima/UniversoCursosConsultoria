# Caixa — gráfico e contas responsivos

Data: 16/11/2026. Versão alvo: 4.8.350.
Classificação: publicação de ajuste visual localizado, autorizada expressamente pelo usuário.
Base remota: 37d574e3aa902890ec9363f6691da2fe1d017346 (4.8.348).

## Objetivo e aceite

O número de contas esticava a linha compartilhada e deixava um grande fundo vazio no gráfico. O gráfico passa a ocupar a largura completa, seguido por contas em grade de três colunas no desktop, duas no tablet e uma no celular. As linhas acompanham a quantidade de contas.

Valores, posição do polo, total da conta, situação inativa, estado vazio, aviso contábil, conciliação e acessibilidade permanecem presentes. Sem alterações em cálculos, consultas, banco ou permissões.

## Manifesto explícito

- `modules/gestor/caixa/components/CaixaMovementAndAccounts.tsx`
- `modules/gestor/caixa/components/CaixaMovimentacaoChart.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-16-caixa-grafico-contas-responsivo.md`

- `internal/versioning/changelog/2026-11-10-a-11-versoes-4-8-282-a-4-8-290.md`

Total: 8 arquivos.

## Validação

- Reprodução pela captura enviada e observação da tela existente no Safari.
- 13 testes existentes de composição e gráfico aprovados antes/depois do patch.
- Prévia local dos componentes reais com dados sintéticos conferida em 1320, 900 e 390 px; três, duas e uma coluna, respectivamente. Essa conferência inicial foi feita no Chrome antes da leitura da guarda remota que exige Safari; não conta como smoke autenticado do Universo.
- Revisão independente dos dois arquivos sem achados acionáveis; 110 e 100 linhas.
- Build completo aprovado com Node 24.22.1 oficial, checksum SHA-256 conferido; teto de linhas aprovado.
- Preview, workflows e produção serão verificados pelo commit desta entrega; smoke autenticado posterior exclusivamente no Safari.

## Isolamento e riscos

Snapshot de publicação reconstruído por hashes a partir da árvore remota. Alterações paralelas locais, incluindo o lote de Despesas que prepara 4.8.349 e o layout PF/polos, permanecem fora do manifesto. Versão 4.8.350 evita reutilizar a numeração já preparada no trabalho paralelo.

A validação com dados sintéticos não comprova o fluxo autenticado. Indisponibilidade ou navegação simultânea do Safari deve ficar registrada como pendência, sem trocar de navegador.

O changelog arquiva as entradas antigas de 10–11/11/2026 sem alterar seu texto para manter todos os arquivos manuais do manifesto no teto de 500 linhas.
