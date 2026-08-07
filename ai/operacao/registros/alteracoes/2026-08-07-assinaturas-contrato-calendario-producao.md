# Alteração — assinaturas do contrato e exportação do calendário

- Lote: `2026-08-07-assinaturas-contrato-calendario-producao`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO` — aguardando apenas a conferência visual no navegador autenticado antes da publicação atômica.
- Escopo: composição visual do encerramento do contrato e hotfix da preparação canônica do Calendário de Aulas.
- Não alterado: conteúdo jurídico da minuta, regras acadêmicas da grade, autenticação/autorização da RPC e alterações paralelas fora deste manifesto.

## Resultado

- A minuta foi confirmada somente como referência: local/data, CONTRATANTE e CONTRATADA, seguidos de duas testemunhas.
- A prévia estrutural, o renderizador e o PDF vetorial do contrato desenham CONTRATANTE/CONTRATADA em duas colunas, com duas colunas de testemunhas; o bloco começa em área segura mais alta e continua exclusivo da última página, com QR à direita.
- A migration `20260807152830_fix_calendario_exportacao_volatilidade` corrige a RPC `preparar_calendario_aulas_exportacao_secure`: ela usa bloqueio compartilhado e instante de emissão, portanto deve ser `VOLATILE`, não `STABLE`.
- O visualizador oficial agora é renderizado no `document.body`, para que nenhum contêiner animado do Calendário limite o `fixed`; portanto ocupa o viewport inteiro como as prévias oficiais da Secretaria.
- A conferência da Matriz mostrou que a marca já vem corretamente configurada com escala A4 de 100%, opacidade 1 e sem rotação. O renderer passou a aplicar a escala pela largura integral da folha, e a geometria de rotação (quando configurada) pelo centro da imagem, reproduzindo a regra CSS do editor sem rasterizar a página.
- O cabeçalho vetorial do calendário passou a usar a mesma área segura de 20 mm e a hierarquia tipográfica em Times do cabeçalho institucional da Declaração. A tabela preserva sua margem acadêmica própria, sem comprimir o cabeçalho.
- A migration `20260807153000_filter_calendario_por_mes_selecionado` adiciona a assinatura canônica com `p_mes_referencia`. Ela aceita somente o primeiro dia do mês, imprime do maior valor entre esse início e a data corrente até o fim exclusivo do mês e usa o mesmo recorte para os módulos exibidos. A assinatura antiga permanece como ponte para o mês corrente durante a atualização das abas já abertas.
- A última coluna agora recebe apenas o nome do professor, nunca títulos/observações das aulas; o modelo ativo e sua prévia usam o rótulo `Professor(a)`. O renderer centraliza horizontal e verticalmente o texto de todas as células, inclusive nas quebras de página.
- A RPC de quatro parâmetros confirmou `VOLATILE`, `SECURITY DEFINER`, `search_path` vazio e `EXECUTE` apenas para `authenticated`/`service_role`; `anon` e `PUBLIC` continuam sem execução. O modelo `GERAL` foi atualizado para revisão 2 com histórico de revisão preservado.

## Evidências

- Reunião com três frentes: assinatura/minuta; diagnóstico da exportação; revisão de segurança/compatibilidade da migration. Todas convergiram no layout final, em `ALTER FUNCTION ... VOLATILE` e no recorte de mês no backend como correções mínimas seguras.
- Contrato: `deno test --allow-read --allow-write --allow-env modules/gestor/secretaria/shared/canonical-document-vector-pdf.contract.test.ts` — 5/5.
- Calendário: `deno test --allow-read --allow-write --allow-env modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.test.ts` — 11/11, incluindo passagem do mês ativo, filtros SQL de período, coluna exclusiva de professor e centralização das células.
- `npm run test:pdf-exports`, ESLint focado, `git diff --check` do manifesto e `npm run build` aprovados.
- PDFs gerados para revisão: A4, texto extraível e sem imagem A4 inteira; o contrato contém somente QR isolado e o calendário contém logo/marca isolados. A página de fixture do calendário foi renderizada e inspecionada visualmente, confirmando a centralização e o cabeçalho alinhado ao padrão.

## Limitação de sessão

- A conexão de navegador disponível nesta sessão não expôs uma janela autenticada; por isso o clique do modal não foi automatizado. O caminho do clique foi rastreado até a RPC, a chamada remota foi reproduzida com o mesmo polo/modalidade/turma autorizados e a prévia continua recebendo o mesmo Blob canônico usado para download e impressão.

## Publicação

- A publicação solicitada depende de um único commit atômico por MCP GitHub, sem incluir o ledger paralelo `COMMITS_E_DEPLOYS.md`; em seguida, a infraestrutura deve promover o mesmo commit após a Preview exigida pelo protocolo.
