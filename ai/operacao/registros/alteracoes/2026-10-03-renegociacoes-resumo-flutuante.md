# Renegociações — resumo flutuante durante a seleção

## Objetivo e escopo

Atender à captura da versão 4.8.158: resumo deve aparecer ao selecionar e permanecer visível durante a rolagem, sem exigir chegar ao fim das parcelas.

Correção de interface em domínio financeiro. Somente apresentação: consultas, cálculos, descontos, elegibilidade e banco permanecem inalterados. Lote próprio preserva LOTE_ATIVO e alterações paralelas.

## Aceite e implementação

- Uma faixa flutuante na viewport ao marcar a primeira parcela; totais canônicos, aluno/turma e ações Limpar/Continuar.
- Portal no body evita recorte por overflow dos cards. Alinhamento respeita largura da matrícula e viewport, com atualização em scroll interno, resize e ResizeObserver.
- Espaço inferior reservado para alcançar a última parcela sem obstrução; altura limitada e detalhes recolhidos.
- Sem backdrop, bloqueio da rolagem ou captura do foco; abaixo do header e dos modais.
- Limpar devolve foco às parcelas sem deslocar a página. Recolher/limpar/zerar/trocar contexto remove a faixa; reabrir preserva seleção.
- Bloqueio entre alunos e passagem dos IDs ao modal preservados. Apresentação original dentro do modal permanece inalterada.

## Manifesto explícito

- `modules/gestor/financeiro/renegociacoes/components/CandidateEnrollment.tsx`
- `modules/gestor/financeiro/renegociacoes/components/FloatingSelectionSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/FloatingSelectionSummary.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/SelectionFinancialSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/components/SelectionSummaryPanel.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-resumo-flutuante.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 12 arquivos. Nenhum outro arquivo do worktree entra neste lote. Workflow e registro de manifestos recebem somente este delta sobre a main remota.

## Validação e limite

Falha reproduzida em DOM antes do patch: portal ausente. Lista/modal: 2 testes PASS, incluindo seleção 1→N→1, callbacks, recolhimento, contexto e foco após limpar. Painel original: 3 testes PASS. Posicionamento/cleanup: 2 testes PASS com scroll interno, resize, observer, largura de viewport estreita, reserva inferior e desmontagem. TypeScript e ESLint focais PASS.

Manifesto manual abaixo de 500 linhas por arquivo. Checagem global local mantém 14 referências antigas ausentes fora deste lote, sem corrigi-las silenciosamente. Build integrado PASS no envio autorizado ao GitHub; warnings preexistentes de chunks/importação dinâmica preservados. Revisão independente final sem bloqueadores.

Smoke visual autenticado não executado: preservada a dispensa anterior do usuário. DOM com medidas simuladas não equivale à conferência visual real no Safari.

Em 03/10/2026, o usuário pediu “ATUALIZE NO GITHUB”. Envio em branch/PR com checks e Preview, versão candidata 4.8.159/revisão168, sem promoção à produção nesta etapa. Nenhuma chamada ao banco nem mutação financeira. Base remota conferida: dde2a7c9e365788934ce2391c4098558d048f744. Resultado do envio será registrado no PR.

Skill de interface aplicada para preservar o padrão do sistema; skill de lote mantém o manifesto e as alterações paralelas.
