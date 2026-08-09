# RAG operacional

O RAG recupera decisões somente quando a tarefa realmente precisa de histórico. Ajustes rápidos não o utilizam.

## Comandos

node scripts/agent-memory-rag.mjs search "termos específicos" --limit 2
node scripts/agent-memory-rag.mjs status
node scripts/agent-memory-rag.mjs index

search é estritamente somente leitura: usa o índice existente e nunca percorre fontes, grava ou reindexa automaticamente.

Execute index explicitamente uma vez ao fechar um lote que alterou AGENTS, memória, protocolo, políticas ou decisões. Índices e embeddings são caches locais ignorados pelo Git.

O corpus padrão exclui registros históricos, planejamentos, artefatos, código-fonte, dados pessoais e os antigos diretórios ai/memoria, ai/rag e ai/skil.

Embeddings e OpenContext são opcionais; ausência de configuração não bloqueia a busca lexical.
