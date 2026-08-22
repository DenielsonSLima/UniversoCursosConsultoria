# Limpeza Segura de Artefatos e Material Interno

Status: CANÔNICO. Última revisão: 2026-08-12.

## Objetivo

Manter o repositório orientado a código, contratos e documentação útil, sem
apagar evidência de negócio, testes-fonte, migrations ou material que precise
de retenção segura.

Esta página é um inventário de decisão. Ela não autoriza apagar dados pessoais
nem arquivos versionados sem revisão.

## Pode ser limpo localmente depois de encerrar processos

| Caminho | Tipo | Ação |
| --- | --- | --- |
| tmp/ | PDFs, imagens, HTML e textos de QA | Remover localmente; é regenerável e ignorado. |
| dist/ | Build Vite | Remover localmente; npm run build recria. |
| output/ | Saídas geradas | Remover localmente quando não forem entrega ativa. |
| scratch/*.bundle.js | Bundles de diagnóstico de Edge Functions | Remover localmente; são regeneráveis. |
| ai/operacao/rag/index.json e embeddings.json | Cache RAG | Remover localmente; preservar manifesto e fontes. |
| supabase/.temp/ | Estado temporário de ferramenta | Remover localmente. |
| arquivos .DS_Store | Metadados do macOS | Remover localmente. |

## Material sensível: reter ou excluir em fluxo separado

- scratch/diarios_lote_*.json pode conter dados acadêmicos.
- Planilhas de turma ou radiologia em Documentos/ podem conter dados pessoais.
- Boletos de homologação, PDFs e retornos bancários podem conter identidade e
  dados financeiros.

Esses arquivos não devem ser movidos para uma pasta versionada, enviados ao
GitHub ou usados como exemplo na documentação. Antes de excluir, defina
responsável, prazo de retenção e confirmação de que não há obrigação
institucional de guarda.

## Não remover nesta limpeza

- supabase/migrations/.
- Testes em modules/, supabase/functions/ e supabase/tests/.
- Runners de teste em scripts/ sem revisar referências.
- internal/versioning/ e internal/empacotamento/.
- Documentos versionados em Documentos/ sem inventário individual.
- Assets usados em imports do produto, como referências documentais.

## Material a classificar antes de mover ou remover

| Caminho | Decisão necessária |
| --- | --- |
| scratch/check_query.mjs | Diagnóstico versionado e sem referência conhecida; mover para scripts/diagnostics/ com runbook ou retirar em lote próprio. |
| pasta sem título/ | Legado de instruções e skills; extrair apenas políticas ainda válidas para ai/operacao antes de remover. |
| Scripts de importação, sincronização e atualização | Alguns usam acesso direto ou dados fixos; revisar LGPD, autorização e substituição por procedimento MCP antes de mantê-los. |
| Documentos/Asaas e relatórios antigos | Marcar como LEGADO ou HISTÓRICO antes de usar como orientação. |

## Ordem de limpeza recomendada

1. Fechar processos de desenvolvimento, build e agentes.
2. Limpar somente artefatos regeneráveis e ignorados.
3. Separar dados sensíveis para retenção externa ou exclusão autorizada.
4. Criar inventário dos scripts legados e mover somente os que tiverem uso
   documentado.
5. Tratar pasta sem título e documentação histórica em lote próprio.
6. Conferir cada remoção versionada contra a main remota, nunca apenas contra
   um worktree local desatualizado.

