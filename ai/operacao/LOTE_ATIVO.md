# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_8_3`

## Lote: 2026-08-24-correcao-financeiro-realtime-resiliencia-4-8-2

- Pedido: corrigir os fluxos Financeiro/recibo do Professor e do Aluno, sincronização TanStack/Realtime e resiliência do portal do Professor, validar internamente com agentes independentes e publicar o resultado no GitHub e em Produção.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-correcao-financeiro-realtime-resiliencia.md`.
- Versão funcional publicada: `4.8.2`; fechamento operacional: `4.8.3`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-correcao-financeiro-realtime-resiliencia.md`; lista recongelada com 79 arquivos antes do hardening remoto.

### Contratos do lote

1. Status financeiro, totais, valor pago, filtros e paginação são calculados pelo backend; o frontend somente envia intenção e apresenta a resposta canônica.
2. O recibo usa payload financeiro canônico e compositor PDF nativo/vetorial, preservando modelo, cabeçalho e marca d'água institucionais; prévia, download e impressão compartilham o mesmo `Blob`.
3. Mutações de acesso do Aluno invalidam a chave TanStack exata depois da confirmação assíncrona final, inclusive quando o cache usa `staleTime: Infinity`.
4. Realtime atua como sinal de invalidação/refetch, com reconexão, ressincronização, debounce e cleanup proporcionais; exclusões não dependem de `payload.old` incompleto.
5. Falhas transitórias ao hidratar o portal do Professor preservam a sessão e oferecem repetição; JWT, papel ou perfil definitivamente inválidos continuam falhando de forma fechada.

### Critérios de aceite

1. Testes SQL/RPC cobrem autorização, valor zero, pagamento parcial, atraso, cancelamento, filtros, paginação e payload do recibo.
2. A interface financeira não recalcula valores nem mascara erro de consulta como `R$ 0,00`; o PDF passa por extração textual, inspeção de recursos e renderização da página relevante.
3. Testes de TanStack/Realtime cobrem invalidação final, reconexão, eventos repetidos, exclusão e cleanup sem atualização direta de cache por CDC.
4. Testes do Professor cobrem indisponibilidade transitória, repetição bem-sucedida e rejeição definitiva de credencial/perfil inválido.
5. Todos os arquivos manuais tocados possuem no máximo 500 linhas e a revisão cruzada encerra sem finding funcional `P1` ou `P2` aberto.
6. Migrations, CI, controle de versão, Vercel Preview, merge e smoke de Produção ficam verdes antes do encerramento.

### Ordem de execução e publicação

1. Implementar Auth/resiliência, Financeiro do Professor, Financeiro do Aluno e TanStack/Realtime, sem operação remota. `CONCLUIDO`.
2. Executar revisão cruzada independente e corrigir findings. `CONCLUIDO_SEM_P1_P2`.
3. Rodar testes focados, contratos SQL/PDF, lint, TypeScript, teto de linhas e build. `CONCLUIDO_LOCAL`.
4. Aplicar migrations via MCP Supabase e validar contratos/advisors/logs. `CONCLUIDO_11_DE_11`; precedência JSON corrigida incrementalmente, helpers internos privados e advisors de segurança restaurados ao baseline.
5. Publicar branch e PR via MCP GitHub; aguardar CI e Vercel Preview. `CONCLUIDO_PR_93`.
6. Mesclar, validar Produção, fechar versão/documentação e reindexar o RAG. `CONCLUIDO_PRODUCAO_4_8_2`.

### Evidências de publicação

- A PR GitHub `#93` partiu da `main` remota `731202f07a1c784076367542ffb24faa66aee9a4` e publicou somente 78 arquivos alterados dos 79 permitidos pelo manifesto; `ai/operacao/registros/ALTERACOES.md` já era idêntico à base.
- Controle de versão, CI completa e Vercel Preview `FYsWqDPJNM1E7amcDY8S6t3zARnU` foram aprovados no head `d3114cea629c1a3ae045ee5ce1b6ef4d8cf9a736`.
- A PR foi mesclada por squash no commit `256eaa78e0dda2930b57f986c71ead315eed329d`; o Vercel Production `TywqYpgDaxfuWcTfUx2ey69gu6Mz` e a CI pós-merge ficaram verdes.
- O domínio público e as rotas `/login` e `/sistema/login` responderam `200`; o bundle `main-BCXA3xKx.js` contém a versão `4.8.2` e carrega o seletor multiperfil publicado.
- O fechamento documental e o RAG são publicados na PR `#94` como patch estável `4.8.3`, sem alterar o contrato funcional da `4.8.2`.

### Limites

1. Somente os arquivos do manifesto explícito integram a publicação; alterações paralelas do workspace permanecem preservadas.
2. GitHub remoto e Supabase remoto serão operados exclusivamente pelos respectivos MCPs.
3. Nenhum usuário artificial, segredo ou dado pessoal será criado ou exposto para o smoke de Produção.
4. A integração Realtime não modificará objetos internos do schema `realtime`; apenas APIs suportadas e, se indispensável, políticas permitidas em `realtime.messages`.
5. Migrations aplicadas tornam-se imutáveis e qualquer correção posterior será incremental.
6. A inspeção visual automatizada pós-merge não foi executada porque a sessão não possuía navegador controlável; contratos de UI, Preview e smoke HTTP final permaneceram verdes.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
