# Caixa e avisos Cloudflare — 2026-10-24

## Objetivo e aceite

Pedido de correção em três etapas, com três agentes: composição do Caixa, conexões Cloudflare atribuíveis ao portal e revisão/validação. Excluir integralmente os três registros de carteira de R$ 839,70. Não usar computador, navegador ou CUA. Na retomada, o responsável autorizou explicitamente atualizar GitHub e produção. Aceite: eliminar a leitura duplicada, preservar integralmente composição/autorização e entregar o candidato validado no projeto confirmado.

## Manifesto explícito
- `index.html`
- `modules/gestor/caixa/caixa-composicao.service.ts`
- `modules/gestor/caixa/caixa-composicao.test.ts`
- `scripts/test-portal-auth-flow.mjs`
- `supabase/migrations/20261024161437_caixa_composition_single_pass.sql`
- `supabase/tests/caixa_composition_single_pass.isolated.test.mjs`
- `supabase/tests/caixa_composition_classification_v2.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-24-caixa-avisos-carregamento.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
Total: 12 arquivos.

## Etapas e correções locais

1. Composição: reproduzida repetição indevida com QueryClient real e resposta simulada HTTP 401 sem código SQL reconhecido. O serviço descartava o status HTTP que acompanha o erro PostgREST. Preservado status sem mutar o erro original; HTTP 401/403 também impede fallback V2/V1, mesmo diante de código contraditório PGRST202. Regras financeiras, autorização e validação do payload preservadas.
2. Cloudflare: removidos dns-prefetch/preconnect globais de index.html, correspondentes às linhas citadas pelo bloqueador nas capturas. Turnstile mantém carregamento sob demanda; captcha e CSP preservados. Isso remove as antecipações desnecessárias, sem prometer eliminar bloqueios do widget por extensões.
3. Banco/publicação: logs confirmaram HTTP 500/PostgREST 57014 por statement timeout de 8 segundos às 15:50:47 UTC. A V2 chamava V1 e relia os dois cores para classificação. Nova V2 agrega totais e classificação na mesma passagem por core, preservando V1, autorização, formato JSON, paridade canônica e metadados de segurança. Sem aumentar timeout ou repetição. Versão 4.8.234/revisão 243, PR328 sobre main e304311b19e7de090292bb0b271bdb99b62061c6.

## Limites e pendências

- A negação HTTP reproduzida localmente é um defeito separado do timeout do incidente. Logs seguintes do incidente responderam 200 em aproximadamente 1,8–2,0 segundos, sem comprovar eliminação de intermitência.
- A conclusão inicial de acesso indisponível estava incorreta: só o conector codex_apps havia sido consultado. O MCP configurado mcp__supabase__ confirmou https://kfekgwyqozhicpfuunpo.supabase.co; diagnóstico realizado por esse MCP. Publicação GitHub e inspeção Vercel também acessíveis por MCP. Não utilizar projeto diferente nem CLI para banco.
- Smoke visual/autenticado pendente por proibição explícita do usuário. Não usar observações anteriores do Safari como aceite deste lote.
- 401 /pat/ é esperado no fluxo Cloudflare sem Private Access Token. Mesma origem e CSP são proteções; não foram relaxadas. Nenhum iniciador próprio identificado para styleMedia/data:, portanto esses avisos não são declarados corrigidos.
- Service/teste constam no main remoto, embora não rastreados no HEAD local antigo. Arquivos de produto reconciliados diretamente com main via MCP; release usa histórico remoto do changelog, preservando o histórico local divergente. Somente o manifesto deste lote pode ser publicado.
- Produção autorizada na retomada. A proibição de navegador permanece; não há alteração de cobranças, carteira ou limpeza de mudanças paralelas.

## Validação

- Composição e cards: 25/25 testes aprovados na revisão independente; composição e fila: 21/21 no agente implementador. Há sobreposição entre essas contagens.
- Widget Turnstile: 7/7 testes aprovados. Checagem de carregamento sob demanda e ausência dos hints globais aprovada.
- CI inicial identificou contrato antigo exigindo preconnect global; contrato atualizado para validar ausência dos hints e loader sob demanda. Testes de autenticação: 81/81 aprovados.
- SQL isolado: equivalência exata V2 antiga/nova sem gerado_em em Matriz/global, fronteiras mensais, conjunto com mais de 300 registros, NULL, subtotais conhecidos e diferenças compensadas. Leituras de cada core de duas para uma; V1 e metadados pg_proc preservados, autorização antes dos cores e divergência canônica negada.
- Regressão executada com a implementação anterior em bundle temporário: HTTP 401 repetia a consulta (duas chamadas em vez de uma); patch encerra a leitura na primeira negação.
- Revisão independente dos três arquivos de implementação/teste sem bloqueadores. Nenhum acesso de navegador ou computador.
- Manifesto atual: arquivos abaixo de 500 linhas; diff dos arquivos rastreados sem erros de whitespace.
- npm run check:file-lines executado; checker agregado falha por fontes ausentes em manifestos anteriores. Não ampliar este lote para corrigir cópia incompleta de arquivos históricos. Manifesto atual verificado diretamente e aprovado.
- Preview inicial dc9e423 aprovado na Vercel com build completo e /gestor HTTP 200; hints ausentes e CSP preservada por inspeção HTTP, sem navegador. Candidato final com SQL/docs ainda em validação; não confundir Preview inicial com entrega final.

## Aplicação autorizada

Migration aplicada via MCP no Universo; ledger efetivo 20261024161437_caixa_composition_single_pass. Fonte renomeada para o identificador efetivo, sem alterar o SQL aplicado. Mesma consulta em transação READ ONLY/ROLLBACK: 1.788,840 para 1.588,042 ms; blocos compartilhados 141.724 para 122.014; temporários 9.864 para 9.042. Hash do retorno sem gerado_em idêntico. Redução de custo nesta amostra quente não garante ausência futura de timeout sob outra carga.

V1 permanece intacta; V2 preserva owner postgres, SECURITY DEFINER, STABLE, search_path vazio e ACL apenas postgres/authenticated. Acesso anon e authenticated sem identidade negado na RPC real. Nenhum dado/configuração persistido nos ensaios. Fonte SQL aplicada conferida sem alteração; teste reexecutado depois do ajuste do nome de migration para o ledger efetivo, aprovado.
