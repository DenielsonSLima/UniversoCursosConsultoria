# Patrimônio compacto — etapa 2 de 5

## Objetivo e aceite

Após validar Formações, compactar a apresentação de Patrimônio: cabeçalho, indicadores, filtros, modos de listagem, cartões e tabela. Preservar consultas, valores canônicos, permissões e todas as operações existentes. Conferir filtros, cards/tabela, paginação, perfis restritos e desktop/móvel antes de Relatórios.

## Manifesto explícito

- `modules/gestor/patrimonio/PatrimonioPage.tsx`
- `modules/gestor/patrimonio/components/PatrimonioToolbar.tsx`
- `modules/gestor/patrimonio/patrimonio-workspace.css`
- `modules/gestor/patrimonio/components/PatrimonioCard.tsx`
- `modules/gestor/patrimonio/components/PatrimonioTable.tsx`
- `modules/gestor/patrimonio/patrimonio-items.css`
- `ai/operacao/registros/alteracoes/2026-11-06-patrimonio-compacto.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 9 arquivos.

## Coordenação e risco

Três agentes: página/toolbar; cards/tabela; harness e revisão independente. Regras financeiras e cálculos pertencem ao backend. Modais de inclusão, edição, baixa, exclusão e exportação permanecem fora do patch. Nenhuma gravação ou geração PDF no smoke.

## Validação

- AST dos quatro componentes idêntico à 4.8.249 excluindo apenas classes/import CSS; queries, handlers, regras financeiras e ARIA preservados. TypeScript e 18 testes focados passaram.
- Safari 1440: quatro cartões, troca para tabela, paginação 32 + 1 e consulta de dois baixados conferidos. Ajuste adicional reservou largura dos filtros e controles; recarga final sem sobreposição.
- Safari 390×744: controles empilhados, cartão legível e perfil restrito com editar/perda/excluir desabilitados pelos motivos existentes. Busca DEMO-0033 retornou um registro mantendo restrições.
- SSR real conferiu normal/restricted/zero/no-polo/valores grandes; decimal canônico preservado. Nenhuma operação patrimonial nem exportação executada.
- Etapa 2 validada; Relatórios liberado.
