# Financeiro da turma compacto e privacidade — 4.8.143

## Objetivo e aceite

- Reduzir fontes, cartões e espaçamentos do financeiro da turma sem remover informação ou operações.
- Ocultar valores por padrão e permitir exibição conjunta do painel até a listagem pelo ícone de olho.
- Agrupar próximo passo financeiro e acessos do aluno com rótulos claros e foco de teclado.
- Preservar cálculos, contratos de emissão, elegibilidade, carnês, extratos, ajustes e recebimentos.

## Revisão e validação

- Revisão independente solicitada pelo usuário em três frentes: painel/privacidade, listagem/ações e contratos/regressões.
- 39 testes Deno focados aprovados; TypeScript, ESLint focado e verificação de whitespace aprovados.
- Smoke no Safari com componentes reais em harness isolado: ocultação inicial, alternância, erro de recarga, edição/consulta, desmontagem, largura reduzida e painel Cobrança na última linha.
- Escape fecha Cobrança e devolve foco; navegação por teclado não aciona o extrato da linha indevidamente.
- O login local completo ficou limitado pelo Turnstile. Smoke autenticado de produção será somente leitura após o deploy, sem emissão, baixa ou salvamento financeiro.
- Build completo aprovado. Todos os 15 arquivos do manifesto têm até 500 linhas.
- O gate global local aponta 12 arquivos/manifestos antigos ausentes, fora do lote; nenhuma dessas pendências foi incluída ou alterada. CI e Preview devem confirmar a árvore remota exata antes do merge.

## Risco e limites

- Alteração somente de apresentação e estado efêmero de privacidade; sem migration, Edge Function, RPC ou alteração de autorização.
- Edição explícita mostra os valores e bloqueia a alternância até sair; valores de extratos dedicados e exportações permanecem disponíveis nas ações existentes.
- Produção autorizada pelo usuário: “pode publicar”. Publicação parte de main `6102eec1c42bf4ebb064f6282b5b37e8606a6c05` e não inclui outros lotes locais.
- Versão e changelog de publicação preparados sobre os arquivos remotos; os arquivos locais de outro lote não são sobrescritos.
- Índice RAG refeito uma vez no staging isolado do corpus remoto; cache não versionado.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigSummary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financial-values-privacy.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-config-readonly.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-alunos-table.contract.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-financeiro-turma-compacto-privacidade.md`

Total: 15 arquivos

## Entrega

- Estado inicial do commit: validado internamente, aguardando CI/Preview e smoke após publicação.
- Evidências finais de CI, Preview e produção ficam na discussão da pull request, sem novo commit de produto.
