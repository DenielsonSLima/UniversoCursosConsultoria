# Memória canônica do projeto

Atualizada em: 2026-08-09

## Finalidade

Este arquivo é um índice curto de contexto durável. Ajustes rápidos não precisam lê-lo. Detalhes de domínio ficam nas políticas específicas e são carregados somente quando a tarefa os envolve.

## Operação

- AGENTS.md define a classificação entre ajuste rápido, mudança padrão e mudança crítica.
- LOTE_ATIVO.md contém somente um lote corrente; históricos ficam em ai/operacao/registros/.
- Um agente é o padrão. Delegação só ocorre para frentes independentes e materialmente úteis.
- A validação deve exercer o fluxo real afetado antes de build ou suítes amplas.
- Regras globais não são acrescentadas durante hotfix de produto.

## Arquitetura e qualidade

- O frontend React/TypeScript/Vite coleta intenção e apresenta o retorno canônico.
- Regras acadêmicas, financeiras, autorização, elegibilidade, valores e paginação pertencem ao backend/RPC quando aplicável.
- TanStack Query e Realtime usam invalidação pelo menor escopo afetado.
- Testes-fonte e migrations permanecem no repositório mesmo depois de executados.
- tmp, caches, relatórios e PDFs/PNGs de QA são regeneráveis e podem ser limpos.

## Políticas condicionais

- PDFs gerados pelo produto: politicas/PDFS_OFICIAIS.md
- Supabase e segurança: politicas/SUPABASE_E_SEGURANCA.md
- Financeiro: politicas/FINANCEIRO.md
- Plano de Curso: politicas/PLANO_CURSO.md
- Interface: politicas/INTERFACE.md
- Entrega e publicação: PROTOCOLO_DE_LOTES.md

## RAG

- Fontes padrão: AGENTS.md, esta memória, lote corrente, protocolo, políticas e docs/decisions/.
- Registros históricos não entram no corpus padrão.
- search lê somente o índice existente e nunca grava ou reindexa.
- index é executado explicitamente uma vez no fechamento de lote relevante.
- Embeddings e OpenContext são opcionais e nunca bloqueiam a operação.
