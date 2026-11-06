# Caixa compacto — etapa 2 de 3

## Objetivo e aceite

Aplicar ao Caixa o padrão compacto aprovado para o Gestor, após a validação visual do Financeiro. Reduzir volume de cabeçalho, indicadores, trilhas e análise estrutural, com todas as informações e navegação preservadas.

Aceite: desktop e 390×744 legíveis, valores sem truncamento, troca de mês/polo e links de capítulos funcionais, estados explícitos. Cálculos, consultas, escopo, permissões, operações e exportadores permanecem fora do patch visual.

## Manifesto explícito

- `modules/gestor/caixa/CaixaPage.tsx`
- `modules/gestor/caixa/components/CaixaFlowHero.tsx`
- `modules/gestor/caixa/components/CaixaCommitmentTracks.tsx`
- `modules/gestor/caixa/components/CaixaStatementSection.tsx`
- `modules/gestor/caixa/components/CaixaAdvancedAnalysis.tsx`
- `modules/gestor/caixa/components/CaixaStructuralOverview.tsx`
- `modules/gestor/caixa/components/CaixaLinkedCapitalOverview.tsx`
- `modules/gestor/caixa/components/CaixaLinhaCorteCard.tsx`
- `modules/gestor/caixa/components/caixa-analysis.css`
- `ai/operacao/registros/alteracoes/2026-11-05-caixa-compacto.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 12 arquivos.

## Coordenação e risco

Três agentes solicitados: alto do Caixa; análise inferior; prévia sintética/revisão independente. Coordenador integra e faz smoke no Safari. Sem publicação nova autorizada.

## Validação

- Lint dos oito TSX passou. 45 contratos focados passaram na candidate completa: hero, trilhas, narrativas, linha de corte, escopo, orquestração e registros em conferência.
- Revisão AST contra a base publicada4.8.248 confirmou alterações apenas de apresentação, cores/ícones/ornamentos; cálculos, queries, escopo, callbacks, ARIA e conteúdo financeiro preservados. Exportador/contratos PDF não foram alterados.
- Safari desktop e 390×744: topo, trilhas e três capítulos conferidos; troca de mês e polo, modal de conferência aberto/fechado, estados normal/zero/loading/error e perfil restrito conferidos.
- Valores grandes íntegros no hero móvel e Posição total na largura1024. Resultado canônico em string além da precisão de Number é exibido sem truncamento.
- Âncoras móveis inicialmente encobriam parte do título: margem corrigida para144px abaixo1024, mantendo84desktop. Reteste390 mostra título/descrição completos.
- Fixtures de composição, posição e modal validadas pelos contratos reais. I/O remoto bloqueado na prévia. Nenhuma operação financeira nem geração real de relatório foi executada.
- Etapa2 validada para avançar a Configurações. Prévia local; sem publicação desta nova repaginação.
