# Início do Gestor: composição compacta

Data: 2026-11-05. Candidato 4.8.247, revisão 256.

## Objetivo e escopo

Redesenhar a apresentação do início do Gestor, preservando as informações aprovadas. Após a primeira prévia, o responsável pediu reduzir a escala e o peso das fontes. A segunda revisão compacta também menu lateral e cabeçalho; essa ampliação visual foi informada antes da alteração. Produção deste novo redesenho aguarda pedido explícito e aceite visual.

## Critérios de aceite

- Informações, totais, datas, limites de itens e ações mantidos.
- Fonte mais leve, títulos/números menores, menos sombras e menos espaço decorativo.
- Indicadores em faixa única com divisórias; agenda e atividade em coluna principal, datas futuras na lateral.
- Menu desktop de 256 para 224px, cabeçalho de 84 para 68px e conteúdo com margens menores; menu móvel preserva alvos de toque.
- CSS restrito ao painel, dividido por responsabilidade, sem biblioteca ou fonte nova.
- Consultas, autorização, caches, modais de operação e backend preservados.

## Manifesto explícito

- `modules/gestor/dashboard/DashboardPage.tsx`
- `modules/gestor/dashboard/dashboard-workspace.css`
- `modules/gestor/dashboard/dashboard-agenda.css`
- `modules/gestor/dashboard/dashboard-activity.css`
- `modules/gestor/dashboard/dashboard-responsive.css`
- `modules/gestor/dashboard/components/DashboardQuickActionsHeader.tsx`
- `modules/gestor/dashboard/components/DashboardMetricCard.tsx`
- `modules/gestor/dashboard/components/DashboardAgendaSection.tsx`
- `modules/gestor/dashboard/components/DashboardRecentActivity.tsx`
- `modules/gestor/dashboard/components/DashboardFinancialShortcut.tsx`
- `modules/gestor/components/GestorPortalShell.tsx`
- `modules/gestor/components/GestorPortalHeader.tsx`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-05-gestor-home-compact-workspace.md`

Total: 17 arquivos

## Validação

- Base remota main 3fcb6306e36b1a2938088c3d21ab46786bc0bfe6; hashes dos oito TSX anteriores conferidos via MCP. Quatro CSS novos; alterações paralelas preservadas.
- TypeScript global e lint focado aprovados. Build integral Node24.22.1 aprovado no candidato; fechamento dos metadados e CSS modular acompanhado na PR.
- 34 testes existentes de acesso/navegação do Gestor passaram.
- Safari nativo com componentes reais, shell real e cache sintético: atalhos abriram os modais de cadastro e financeiro; fechar não gravou dados; calendário manteve destino calendario. Tipografia compacta e descrições completas conferidas no desktop. Viewport390 conferiu empilhamento dos atalhos e modal financeiro sem corte horizontal; conferência responsiva final acompanhada na PR.
- Removida a animação de entrada do painel: em Safari responsivo ela deixou conteúdo não pintado na prévia; remoção restabeleceu a renderização e evita camada transformada.
- Dois testes antigos de student-finance falharam igualmente na base intacta: contrato textual espera método antes da divisão de serviços e cenário legado espera bloqueio de tipo não previsto no modelo atual. Sete outros passaram. Nenhum dos quatro arquivos envolvidos foi alterado; não houve mudança de regra financeira para acomodar testes.
- CSS separado em quatro arquivos e demais fontes manuais abaixo de 500 linhas. Artefatos, cache e harness local fora do manifesto.

## Operação

Nenhuma migration, Edge, cobrança ou dado real modificado. Preview remota e CI serão vinculados à PR. A autorização de produção da entrega anterior não foi estendida automaticamente a este novo redesenho.
