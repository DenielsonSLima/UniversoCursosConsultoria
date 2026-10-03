# Resumo na etapa Condições — 4.8.163

## Pedido e aceite

Usuário reportou a ausência do resumo ao avançar de Parcelas para Condições
e autorizou explicitamente corrigir e publicar em produção após testes.
Resumo canônico deve aparecer no topo, antes dos campos, mantendo quantidade,
valor normal, desconto, juros, multa e total da seleção atual.

## Implementação mínima

Uma linha no Wizard reutiliza SelectionFinancialSummary na etapa TERMS.
Fonte obtida do main remoto, sem transportar o WIP bancário local.
Nenhuma regra de cálculo, RPC ou cobrança foi modificada.
Lote independente do PR249, que permanece bloqueado e não publicado.
Publicação deve preservar Convênios4.8.162 e Transferências4.8.161.

## Manifesto explícito

Total: 7 arquivos.

- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizard.tsx`
- `modules/gestor/financeiro/renegociacoes/components/RenegociacaoWizardSummary.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-03-renegociacoes-resumo-condicoes.md`

## Validação

- Reproduzido no código remoto: painel renderizado somente em SELECTION.
- Teste sintético RED na versão anterior e GREEN com patch.
- Navegação Parcelas → Condições conserva mesmos valores canônicos.
- Voltar, desmarcar parcela e avançar atualiza todos os valores e quantidade.
- Resumo precede os campos; loading/erro não apresentam montantes obsoletos.
- Retry testado; navegar não salva, simula, cancela ou emite títulos.
- ESLint e whitespace focados aprovados; arquivos do manifesto abaixo de 500 linhas.
- Usuário dispensou teste no navegador; JSDOM não é smoke visual autenticado.
- CI completo, Preview e produção serão conferidos e registrados no PR.
- Sem migration, alteração de memória/RAG ou efeitos bancários.
