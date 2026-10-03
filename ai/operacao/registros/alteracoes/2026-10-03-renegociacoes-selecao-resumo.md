# Renegociações — seleção exclusiva e resumo canônico

## Objetivo, escopo e autorização

Correção crítica financeira: impedir seleção simultânea de alunos/matrículas diferentes e mostrar, ao marcar parcelas, principal, principal com desconto de pontualidade vigente e bruto com multa/juros. O usuário confirmou “Sim, aplicar e publicar após os testes”. Sem emissão, cancelamento, baixa, aceite ou ativação de acordos.

Mantida a dispensa explícita de teste no navegador. LOTE_ATIVO e frentes paralelas preservados; este registro delimita o lote.

## Critérios e comportamento

- A listagem existente ordena alunos por quantidade de parcelas vencidas decrescente, vencimento atrasado mais antigo e nome; inclui abertas vencidas/futuras dos filtros. Critério agora visível na tela.
- Seleção global pertence a uma identidade: aluno, matrícula, turma e polo. Bloqueio nas demais matrículas até limpar ou desmarcar a última parcela; não há troca silenciosa.
- Recolher/expandir preserva seleção. Mudança de polo, página, busca ou filtros reinicia o contexto; refetch remove parcelas inelegíveis.
- Resumo na lista e no modal fullscreen, com debounce de 150 ms, cancelamento, deadline de 12 s e chave isolada por identidade/data/IDs.
- Durante mudança/carregamento/erro nenhum valor anterior é exibido. Desconto não comprovado é “A conferir”, nunca zero inventado.
- Principal/juros/multa/bruto reutilizam source_item canônico sem alterar prévia/salvamento.
- Desconto LOCAL usa snapshot congelado; Banese exige termos confirmados, compatíveis com valor e vencimento e calendário bancário comprovado quando necessário.
- Desconto vencido não é ressuscitado; desconto comercial da proposta continua explícito. Os três valores são comparativos dos títulos originais, não promessa de quitação bancária.
- Havendo conflito entre carência bancária e encargos corridos da prévia, os cenários permanecem separados; total combinado indisponível e não exibido.

## Manifesto explícito

- `modules/gestor/financeiro/renegociacoes/RenegociacoesTab.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateStudentCard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/CandidateEnrollment.tsx`
- `modules/gestor/financeiro/renegociacoes/components/candidateSelection.model.ts`
- `modules/gestor/financeiro/renegociacoes/components/candidateSelection.model.test.ts`
- `modules/gestor/financeiro/renegociacoes/components/CandidateGroups.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/SelectionSummaryPanel.tsx`
- `modules/gestor/financeiro/renegociacoes/components/SelectionSummaryPanel.test.mjs`
- `modules/gestor/financeiro/renegociacoes/components/SelectionFinancialSummary.tsx`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoSelectionSummary.ts`
- `modules/gestor/financeiro/renegociacoes/hooks/useRenegociacaoSelectionSummary.test.mjs`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.selection-summary.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.selection-summary.test.ts`
- `modules/gestor/financeiro/renegociacoes/renegociacoes.selection-summary.service.ts`
- `supabase/migrations/20261003053418_receivable_renegotiation_selection_summary.sql`
- `supabase/tests/receivable_renegotiation_selection_summary.transaction.sql`
- `supabase/tests/receivable_renegotiation_selection_summary_readonly.sql`
- `scripts/test-renegociacao-selecao-sql.mjs`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-selecao-resumo.md`

Total: 26 arquivos. Arquivos compartilhados recebem somente este delta sobre main remoto; alterações locais paralelas não serão publicadas.

## Banco e segurança

Nova RPC de leitura e helper interno; guardas de autenticação e escopo, identidade única e até 120 IDs. SECURITY DEFINER intencional somente na RPC pública, search_path vazio, EXECUTE limitado a authenticated/service_role. Helper sem execução direta para papéis cliente. Prévia e source_item existentes preservados.

Aplicada via MCP no projeto confirmado kfekgwyqozhicpfuunpo, ledger 20261003053418. Prefixo local sincronizado sem alterar conteúdo aplicado. Fixtures executadas somente em PGlite; gate remoto separado em READ ONLY.

## Validação e publicação

- Reprodução DOM antes do patch confirmou seleção simultânea; regressão agora impede o segundo aluno.
- 14 testes focados de seleção, lista→modal, resumo, parser e concorrência: PASS.
- PGlite com parser TypeScript real: PASS; desconto futuro/vencido/desabilitado/desconhecido, termos Banese, carência, calendário desconhecido, auth/escopo, IDs e limites.
- Nenhuma alteração de saldo/status/vencimento nas leituras; definição de source_item/prévia inalterada.
- Revisões independentes do parser/hook/painel e SQL sem bloqueadores; teste DOM também confere IDs/data e transições 1→N→1 no resumo.
- TypeScript, ESLint, build integrado e 25 testes de regressão: PASS. Regras reais de propostas em PGlite: PASS.
- Gate remoto READ ONLY PASS: catálogo, grants, autenticação antes de leitura, calendário e recusa sem identidade. Hashes de source_item/prévia iguais antes/depois.
- Consulta positiva real com papel service_role explícito, sem personificar usuário: duas parcelas, desconto comprovado, 14,68 ms; appliedToProposal=false. Sem dados pessoais em logs e sem mutação ou chamada bancária.
- Checagem global local possui referências antigas ausentes fora deste lote; não corrigidas silenciosamente. Manifesto deste lote deve respeitar 500 linhas e CI remoto valida o snapshot publicado.
- Smoke visual autenticado no Safari não executado por escolha do usuário; DOM não comprova renderização final.
- Versão alvo: 4.8.158, revisão 167; confirmar main antes de publicar. Resultado remoto será registrado no PR.

As skills do Universo mantêm o cálculo no servidor e a publicação por manifesto; a skill de CI orienta validar a Preview antes da promoção. Não houve redesenho global nem alteração de governança.
