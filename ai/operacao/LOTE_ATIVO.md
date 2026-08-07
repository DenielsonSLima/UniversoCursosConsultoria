# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-06-operacao-memoria-rag

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: Implantar memória canônica, recuperação RAG restrita, registros de lote e protocolo único de publicação para todos os agentes.
- Escopo incluído: `AGENTS.md`, `ai/operacao/`, marcadores de legado em `ai/`, skill global do Codex, scripts de RAG e sincronização OpenContext.
- Fora de escopo: produto do portal, dados acadêmicos/financeiros, migrations, Edge Functions e produção.
- Regras/RPC/segurança aplicáveis: GitHub e Supabase exclusivamente por MCP; corpus sem segredos ou dados pessoais; frontend continua sem regras/cálculos canônicos.
- Critérios de aceite: busca local retorna fontes citáveis; índice é limitado ao manifesto; OpenContext recebe cópia sincronizável; todos os agentes recebem o protocolo pelo `AGENTS.md`; há registros separados de alterações, commits e deploys.
- Arquivos previstos: documentação operacional, scripts e `.gitignore`.
- Validações focadas: testes dos scripts RAG e de sincronização aprovados; pesquisa lexical de amostra retornou a memória canônica; skill global validada.
- Validação final: TypeScript/lint não se aplicam aos Markdown; build de produto não é necessário porque não há alteração de produto.
- Publicação prevista: um commit atômico e uma única Preview Vercel, se o Vercel estiver configurado para reagir a esta alteração documental.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: embeddings semânticos externos dependem de `OPENAI_API_KEY` aprovada; a camada lexical já está ativa. O resultado da Preview será acompanhado no PR deste lote.

Abra um novo bloco abaixo antes de alterar produto, infraestrutura, banco, publicação ou documentação operacional relevante.

```md
## Lote: AAAA-MM-DD-identificador-curto

- Estado: PLANEJADO | EM_EXECUCAO | PRONTO_PARA_VALIDACAO | PUBLICADO | BLOQUEADO
- Objetivo:
- Escopo incluído:
- Fora de escopo:
- Regras/RPC/segurança aplicáveis:
- Critérios de aceite:
- Arquivos previstos:
- Validações focadas:
- Validação final:
- Publicação prevista: PR / Preview / Produção
- Responsável pela consolidação:
- Pendências ou riscos:
```
