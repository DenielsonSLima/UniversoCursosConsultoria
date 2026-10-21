# Caixa: conferência da composição dos recebimentos

## Objetivo e aceite
Disponibilizar Ver registros no aviso de composição dos recebimentos. Listar todos os registros do polo/mês selecionado, 20 por página, separando diferença e ausência de detalhamento. Nenhuma alteração financeira.

## Implementação
Consulta sob clique pela RPC segura existente do relatório mensal. Preservados cálculo canônico, validação de completude e escopo, fila interativa, abort e guardas de acesso. Lista paginada em memória após receber o relatório integral; se limites ou completude falharem, a lista não é exibida como parcial. Nenhuma migration ou grant. Sem histórico de comprovantes ou dados pessoais no lote.

## Validação
- Seis testes focados de classificação, paginação, nulos e contrato de consulta aprovados; incluídos no runner do Caixa.
- Smoke DOM isolado com dados sintéticos: abertura sob clique, 41 registros em três páginas, 43 separados, nulos, fechar/Escape/foco, reabrir, troca de escopo, erro sem lista parcial e cleanup aprovados.
- Revisão independente: 240 combinações de status/nulos/diferença e paginação de 83 registros aprovadas.
- Arquivos do manifesto abaixo do teto de 500 linhas.
- Build e suíte integral dependem do CI do commit; não executados neste checkout parcial.
- Smoke visual autenticado pendente: Safari do usuário indisponível. Não substituído por outro navegador.

## Manifesto explícito
- `modules/gestor/caixa/components/CaixaCompositionCards.tsx`
- `modules/gestor/caixa/composition-review/CaixaCompositionReviewModal.tsx`
- `modules/gestor/caixa/composition-review/caixa-composition-review.model.ts`
- `modules/gestor/caixa/composition-review/caixa-composition-review.service.ts`
- `modules/gestor/caixa/composition-review/caixa-composition-review.test.ts`
- `scripts/test-caixa-report.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-21-caixa-composicao-conferencia.md`

Total: 11 arquivos
