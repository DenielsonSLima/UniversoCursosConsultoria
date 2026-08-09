# Instruções do agente

## Autoridade local

- Entre fontes deste repositório, esta ordem prevalece: AGENTS.md, lote atual, política específica do domínio, memória recuperada e skill genérica.
- Se uma skill genérica contrariar estas regras, descarte somente a instrução conflitante.
- Comece pelo pedido exato do usuário e pelo menor caminho de código capaz de atendê-lo. Não amplie silenciosamente o escopo.

## Classificação obrigatória da tarefa

### Ajuste rápido

Use este fluxo quando a mudança estiver localizada em até dois arquivos de implementação e não envolver banco, Auth, autorização, financeiro, PDF gerado pelo produto, infraestrutura ou publicação.

- Use um único agente.
- Não leia MEMORIA_CANONICA.md, LOTE_ATIVO.md, RAG, históricos ou decisões.
- Não abra lote, não altere documentação operacional, versão ou changelog.
- Localize apenas o componente/função indicada, reproduza ou confirme a causa, aplique o patch mínimo e execute um teste focado ou smoke do fluxo.
- Quando o pedido nomear módulo, tela ou documento, restrinja a primeira busca a essa pasta; amplie somente se não houver resultado.
- Não rode build, lint global ou suíte ampla por padrão.
- Se o diagnóstico localizado não convergir rapidamente ou o risco crescer, reclassifique a tarefa e informe o motivo; não transforme um ajuste pequeno em auditoria ampla.

### Ajuste PDF focado

Use quando a alteração estiver em um compositor PDF nativo existente, limitada a até dois arquivos de implementação e apenas texto, estilo, espaçamento ou posição de recurso isolado.

- Use um agente e carregue somente `ai/operacao/politicas/PDFS_OFICIAIS.md`.
- Não leia memória, lote, RAG ou histórico e não abra lote.
- Valide apenas o contrato/exportador afetado, texto extraído, recursos embutidos e a página relevante renderizada.
- Não rode build global por padrão.
- Reclassifique se houver alteração de payload/backend, elegibilidade, cálculo, paginação, novo exportador, captura raster ou compositor compartilhado com impacto amplo.

### Mudança padrão

Use quando a alteração envolve um domínio e mais de dois arquivos, mas não possui risco crítico.

- Leia MEMORIA_CANONICA.md e somente o bloco atual de LOTE_ATIVO.md.
- Consulte o RAG apenas se uma decisão anterior for necessária, com no máximo dois resultados.
- Use um agente por padrão. Delegue apenas uma frente realmente independente que economize tempo.
- Abra lote somente para mudança coesa de produto, documentação operacional ou entrega que será publicada.

### Mudança crítica

Banco/Supabase, Auth/RLS, financeiro, mudança estrutural de PDF, infraestrutura e publicação exigem a política específica indicada abaixo.

- Um agente continua sendo o padrão; múltiplos agentes não são requisito.
- Reproduza o fluxo real antes de implementar e valide o contrato diretamente afetado.
- Use build completo somente quando o risco de integração justificar ou no fechamento para publicação.

## Operações remotas

- GitHub remoto é somente via MCP GitHub. Não use git ou gh para criar branch, commit, push, pull request ou publicação.
- Supabase é somente via MCP Supabase. Não execute Supabase CLI para consultas, migrations, banco, Auth, Storage, RLS, Realtime ou Edge Functions.
- Preserve alterações paralelas e publique apenas um manifesto explícito de arquivos do lote.
- Produção exige pedido explícito do usuário e critérios de aceite confirmados.

## Qualidade e escopo

- A sequência padrão é: reprodução, teste/checagem específica, patch mínimo, smoke real e validação final proporcional.
- Correção visual/interativa não fica pronta sem smoke do fluxo correspondente; se a sessão autenticada estiver indisponível, registre a pendência sem substituir o smoke por dezenas de testes não relacionados.
- Não altere AGENTS, skills ou memória dentro de um hotfix de produto. Mudanças de governança pertencem a lote operacional separado.
- Testes-fonte e migrations aplicadas permanecem versionados. Eles protegem regressões, auditoria, drift e reconstrução de ambientes.
- Caches, PDFs/PNGs gerados, relatórios temporários, harnesses em tmp e saídas de build são regeneráveis e não pertencem ao lote.
- Não varra o repositório inteiro nem use estado Git amplo como lista de trabalho.

## Políticas carregadas somente por domínio

- PDFs gerados pelo produto: ai/operacao/politicas/PDFS_OFICIAIS.md
- Supabase, Auth e segurança: ai/operacao/politicas/SUPABASE_E_SEGURANCA.md
- Financeiro e cobranças: ai/operacao/politicas/FINANCEIRO.md
- Plano de Curso: ai/operacao/politicas/PLANO_CURSO.md
- Interface e notificações: ai/operacao/politicas/INTERFACE.md
- Lotes, validação e publicação: ai/operacao/PROTOCOLO_DE_LOTES.md

## Memória e RAG

- ai/operacao é a fonte versionada; ai/memoria, ai/rag e ai/skil são legados removidos.
- A busca RAG é opcional para ajustes rápidos e somente leitura. Reindexe explicitamente uma vez ao fechar um lote operacional ou de publicação.
- Nunca indexe segredos, dados pessoais, dumps, código-fonte completo ou artefatos gerados.
