# Lote ativo

Estado: `PUBLICADO`

## Lote: 2026-08-07-correcao-filtro-calendario-mes-selecionado

- Estado: EM_EXECUCAO
- Objetivo: Corrigir o recorte temporal da exportação do Calendário de Aulas para respeitar estritamente o mês selecionado na agenda, sem mudar regras de elegibilidade, autorização nem o payload canônico.
- Escopo incluído: migration da RPC `preparar_calendario_aulas_exportacao_secure` com quatro parâmetros e atualização de lote operacional.
- Fora de escopo: UI da agenda, autorização por escopo, composição PDF e alteração de modelos não relacionados.
- Regras/RPC/segurança aplicáveis: Supabase e GitHub apenas por MCP; manter `SECURITY DEFINER`, `search_path` vazio e validação de polo antes de consulta.
- Critérios de aceite: para uma seleção (polo/modalidade/turma/mês), o `WHERE` da grade usa intervalo `>= primeiro_dia_do_mes` e `< primeiro_dia_do_mes seguinte`, sem incluir outros meses.
- Arquivos previstos: `supabase/migrations/20260807170000_fix_calendario_aulas_exportacao_mes_referencia_completo.sql` e registro no `LOTE_ATIVO.md`.
- Validações focadas: revisão da migration aplicada e conferência do caminho de chamada já existente que envia `mesReferencia` da agenda.
- Validação final: migration incremental já adicionada; aguarda aplicação via MCP Supabase e fechamento de lote pelo fluxo já definido.
- Publicação prevista: sincronizar o lote via MCP GitHub quando autorizado, sem arquivos fora do escopo.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: verificar registros da turma 40 com fuso/`data_aula` persistente para validar o recorte por mês inteiro.

## Lote: 2026-08-07-calendario-filtro-modulo-exportacao-academica

- Estado: EM_EXECUCAO
- Objetivo: Ajustar fluxo de exportação de Calendário de Aulas para seleção por tipo e módulo: sem EAD, com tipo `Técnico/Livre/Especialização`, e para Técnico exigir seleção de módulo antes de exportar.
- Escopo incluído: atualização de painel, tipos, hooks e serviços de exportação; nova migration para `listar_modulos_calendario_aulas_secure` e extensão da RPC `preparar_calendario_aulas_exportacao_secure` com filtro opcional de módulo para técnico.
- Fora de escopo: alteração do documento PDF além de seleção de escopo, mudanças de marca d’água/visual e ajustes fora do módulo de calendário.
- Regras/RPC/segurança aplicáveis: Supabase e GitHub apenas por MCP; manter `SECURITY DEFINER`, `search_path` vazio, autorização por polo e sem alterações de lógica financeira.
- Critérios de aceite: o painel permite tipos Técnico/Livre/Especialização; EAD não aparece no dropdown; para Técnico o módulo é obrigatório; para não técnicos o módulo não é solicitado; o SQL filtra módulo somente no técnico e mantém recorte mensal do mês selecionado.
- Arquivos previstos: `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx`, `modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.service.ts`, `modules/gestor/calendario/exportacao-aulas/hooks/useCalendarioAulasExportacao.ts`, `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.queryKeys.ts`, `modules/gestor/calendario/exportacao-aulas/types.ts`, `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.test.ts`, `supabase/migrations/20260807180000_filtro_modulo_exportacao_calendario_aulas.sql`.
- Validações focadas: revisão da nova migration no corpo da função e cobertura de query keys/migration no teste local.
- Validação final: em andamento.
- Publicação prevista: sincronizar o lote via MCP GitHub apenas após validação funcional desta etapa.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: conferir módulos retornados no histórico de técnicos com cadastros sem disciplina vinculada e impacto de módulo vazio (turma sem módulo) no filtro.

## Lote: 2026-08-07-assinaturas-contrato-calendario-producao

- Estado: PUBLICADO
- Commit: `9f46816c`
- Objetivo: Refinar o encerramento visual do contrato conforme a minuta, deixar as assinaturas lado a lado e mais acima na última página, corrigir a preparação canônica do Calendário de Aulas e garantir que sua prévia, marca-d’água e cabeçalho reproduzam o padrão institucional da Declaração, sempre para o mês selecionado na agenda.
- Escopo incluído: composição do encerramento/assinaturas na prévia e no PDF vetorial do contrato; diagnóstico e correção mínima do handler, serviço e RPC de exportação do calendário; visualizador oficial em portal de viewport; centralização rotacionada da marca institucional no PDF; normalização do cabeçalho vetorial do calendário à geometria e tipografia da Declaração; recorte canônico da grade ao mês ativo da agenda, excluindo encontros já transcorridos; coluna exclusiva de professor e centralização interna das células; testes de regressão e inspeção visual/estrutural dos PDFs; registros operacionais; uma publicação atômica no GitHub e uma promoção Vercel para Produção após Preview aprovada.
- Fora de escopo: edição jurídica da minuta, posicionamento livre por arrastar no documento oficial, alteração de regras acadêmicas/financeiras, mudança de modelos não relacionados e inclusão de alterações paralelas no commit.
- Regras/RPC/segurança aplicáveis: Supabase e GitHub exclusivamente por MCP; assinaturas, QR e encerramento continuam apenas na página final e dentro da área segura; prévia, download e impressão reutilizam o mesmo Blob PDF canônico; o backend mantém autorização, elegibilidade e paginação; nunca rasterizar uma página A4 inteira.
- Critérios de aceite: o contrato mostra data/assinaturas em duas colunas, acima da borda inferior, apenas na última página e sem colisão com QR; o calendário selecionado retorna payload autorizado e abre, acima de todo o portal, a prévia do mesmo Blob usado para download/impressão; o PDF contém exclusivamente aulas restantes do mês ativo da agenda, com a última coluna limitada ao nome do professor e todo o conteúdo das células centralizado; a marca-d’água usa o ativo e a escala institucional pelo centro da folha; o cabeçalho do calendário usa a mesma margem, fonte e hierarquia da Declaração; PDFs mantêm A4, texto extraível e somente ativos isolados; testes focados, build e revisão das três frentes concluídos; Preview e Produção entregam o mesmo commit atômico.
- Arquivos previstos: componentes/renderizadores/testes do contrato e calendário, migration apenas se a correção da RPC exigir, e registros operacionais do lote.
- Validações focadas: reprodução da chamada de exportação pelo payload/RPC, teste de portal do visualizador, testes de contrato e calendário, auditoria de PDF vetorial (texto, recursos e imagens), inspeção visual do A4, lint focado, build e conferência de deploy.
- Validação final: as três frentes confirmaram a composição da assinatura e a causa do calendário. A migration `20260807152830_fix_calendario_exportacao_volatilidade` foi aplicada pelo MCP Supabase; a função preserva `SECURITY DEFINER`, `search_path` vazio e `EXECUTE` autenticado, agora com `provolatile = 'v'`. A migration `20260807153000_filter_calendario_por_mes_selecionado` também foi aplicada pelo MCP: a nova assinatura recebe o primeiro dia do mês ativo, filtra entre o início restante desse mês e seu fim exclusivo, não concatena observações/títulos à coluna de professor e conserva a assinatura anterior como ponte para o mês atual. O modelo ativo foi revisado para `Professor(a)` com histórico correspondente. A conferência da Matriz confirmou marca A4 configurada em 100%, opacidade 1 e sem rotação; o erro era o renderer restringi-la à área útil. O visualizador oficial agora é um portal para `document.body`, cobrindo o viewport real, e o PDF calcula escala pela largura total da A4 e rotação pelo centro, igual ao editor. O renderer centraliza horizontal e verticalmente as células; o PDF A4 de fixture foi renderizado e inspecionado. Contrato vetorial 5/5, calendário 11/11, `npm run test:pdf-exports`, ESLint focado e `npm run build` passaram. Não havia navegador conectado para clicar na sessão autenticada; a validação funcional foi feita contra a RPC e o Blob PDF canônico.
- Publicação prevista: commit atômico via MCP GitHub com manifesto explícito; uma Preview Vercel aprovada; promoção desse mesmo commit para Produção, autorizada expressamente pelo usuário nesta conversa.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: preservar alterações paralelas e a redação jurídica da minuta; não exibir detalhes internos do RPC em erros de interface; a última confirmação visual no navegador autenticado ainda precisa ser feita antes da publicação, pois esta sessão não expôs uma janela controlável. O advisor de segurança continua sinalizando a exposição autenticada de funções `SECURITY DEFINER` no projeto; para esta RPC é deliberada, com guarda por polo, `search_path` vazio e nenhum `EXECUTE` para `anon`/`PUBLIC`.

## Lote: 2026-08-07-documentos-secretaria-calendario

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: Transformar a minuta de contrato de aluno em modelo editável e emissão segura; disponibilizar carteira de preceptor para professores; e gerar/exportar calendário de aulas a partir da grade da turma, preservando marca d'água, QR Code e padrões documentais. Ajustar a prévia do contrato no editor para suportar quebra de página, contagem "PÁGINA 1 DE X", cabeçalho institucional e marca d'água idêntica ao modelo de declaração, auditando a exportação PDF vetorial nativa na Secretaria.
- Escopo incluído: análise da minuta e da referência visual, Modelos de Documentos, Secretaria, Calendário, QR Code/validação, serviços/hooks/query keys, banco/RPC/RLS/Realtime estritamente necessários, templates editáveis, emissões individual/lote/personalizada, quebra de página visual no editor de contrato, marca d'água e cabeçalho alinhados, auditoria de exportação de PDF vetorial nativo em Secretaria, documentação de planejamento e memória/RAG.
- Fora de escopo: cálculos/regras no frontend, alteração dos dados acadêmicos existentes sem RPC, e substituição de modelos não relacionados.
- Regras/RPC/segurança aplicáveis: Supabase/GitHub exclusivamente por MCP; identificação, elegibilidade, composição, dados de validação, QR Code e emissão de lote ficam no backend/RPC; frontend coleta opções e exibe retorno; permissões por módulo/aba e polo; TanStack Query/Realtime com invalidação de escopo mínimo; arquivos emitidos por rota autenticada.
- Critérios de aceite: contrato disponível como modelo padrão editável e emissível para modalidades elegíveis, com QR verificável; carteira de preceptor disponível como modelo e emissão somente para professores; calendário filtra modalidade/turma, gera a partir da grade canônica e exporta no padrão visual aprovado; todos suportam individual, lote e personalizado quando aplicável; estados de carregamento/erro/vazio e validação visual funcionam sem cálculos no browser.
- Arquivos previstos: planejamento em `ai/operacao/planejamentos/`, migrations/RPCs, tipos, módulos isolados de Modelos/Secretaria/Calendário, templates, testes focados, registros e memória.
- Validações focadas: revisão de contrato visual e estrutural, testes de contratos/RPC/RLS, testes de query keys e filtros, renderização de documentos/PDFs, lint focado dos módulos afetados e auditoria de exportação PDF vetorial nativa (124/124 testes de validação documental aprovados; auditoria de PDFs selecionáveis OK).
- Validação final: testes de contrato PDF vetorial (3/3), validação pública (26/26), calendário (4/4), contratos SQL/RPC (6/6), validação documental (124/124), lint e build concluídos. A auditoria nativa confirmou A4, texto extraível e ausência de imagem de página inteira; o calendário também abre o mesmo Blob na prévia, download e impressão. Falta somente a conferência do commit/Preview antes da Produção.
- Publicação prevista: usuário autorizou expressamente nesta conversa. Publicar um único commit atômico por MCP GitHub, com PR/merge controlado e uma Preview Vercel do lote completo; após confirmar a Preview, promover o mesmo conteúdo para Produção.
- Responsável pela consolidação: Codex, após reunião interna com três frentes delimitadas.
- Pendências ou riscos: o modelo técnico exige aprovação auditada deliberada antes de novas emissões; Livre e Superior permanecem em revisão jurídica, sem emissão. A minuta não será copiada para RAG/logs; QR aponta apenas para validação canônica sem dados pessoais. O lote aguarda apenas as validações finais e a publicação autorizada.

## Lote: 2026-08-07-correcao-calendario-padrao-documental

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Corrigir o Calendário de Aulas para reutilizar o cabeçalho institucional e a marca-d’água padrão do sistema, tomando a Declaração de Cursando como referência visual e estrutural, sem comprimir ou sobrepor o cabeçalho na prévia.
- Escopo incluído: renderizador canônico do calendário, sua prévia, projeção institucional autorizada da RPC e testes focados de composição visual/PDF; comparação pontual com o modelo de Declaração de Cursando e ajuste da escala do cabeçalho no cartão de prévia.
- Fora de escopo: redesenho do modelo de declaração, mudanças nas regras/dados acadêmicos de turmas e publicação GitHub/Vercel.
- Regras/RPC/segurança aplicáveis: a prévia, download e impressão devem continuar usando o mesmo Blob PDF canônico; cabeçalho e marca-d’água permanecem em camadas vetoriais/recursos isolados, sem rasterização da página.
- Critérios de aceite: o calendário exibe o cabeçalho institucional completo e a marca-d’água padrão equivalentes à Declaração de Cursando; a prévia não comprime, quebra indevidamente ou sobrepõe dados do cabeçalho; o PDF mantém texto selecionável, sem imagem A4 inteira, e prévia/download/impressão continuam idênticos.
- Arquivos previstos: renderizador/componentes compartilhados de documento do calendário, testes focados e registros operacionais de fechamento.
- Validações focadas: comparação estrutural com a declaração, testes do calendário/PDF, extração de texto, inspeção de recursos, revisão visual local e teste do cartão de prévia em navegador conectado quando disponível.
- Validação final: a prévia agora monta uma A4 de `794 × 1123` e a reduz proporcionalmente por `ResizeObserver`, preservando as proporções do cabeçalho de Declaração/Contrato. Deno do calendário 6/6, ESLint focado e build concluídos. A migration `20260807142446_align_calendario_institutional_branding` permanece aplicada e confirmada pelo MCP Supabase.
- Publicação prevista: migration de RPC entregue pelo MCP Supabase; sem publicação GitHub/Vercel nesta correção, salvo solicitação posterior do usuário.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: ativos externos só são incorporados se forem data URI de imagem ou URL HTTPS do Storage oficial. Não havia navegador conectado para automação nesta sessão; a causa visual foi confirmada pelas capturas e pela equivalência dimensional com as A4 de Declaração/Contrato. Preservar alterações locais concorrentes fora do escopo.

## Lote: 2026-08-07-correcao-minuta-contrato-rodape-assinatura

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Corrigir a composição do modelo de contrato do aluno conforme a minuta institucional, normalizando as quebras de linha do encerramento e deixando as assinaturas exclusivamente na última página.
- Escopo incluído: leitura e renderização somente de `Documentos/MINUTA - CONTRATOS ALUNOS 2.docx`; editor, prévia e renderizador PDF vetorial do contrato; testes focados de paginação, rodapé e assinatura; registros operacionais do lote.
- Fora de escopo: reescrita jurídica da minuta, alteração de dados acadêmicos/financeiros, mudanças em outros modelos documentais e publicação GitHub/Vercel.
- Regras/RPC/segurança aplicáveis: a minuta permanece inalterada e não entra no RAG/logs; prévia, download e impressão usam o mesmo Blob PDF canônico; rodapé, marca-d’água e cabeçalho preservam camadas vetoriais/recursos isolados, sem rasterização da página.
- Critérios de aceite: `\\n` não aparece de forma literal; o bloco de aceite/assinaturas não se repete e aparece apenas na página final; rodapés não sobrepõem conteúdo; cabeçalho e marca-d’água continuam consistentes nas páginas; PDF mantém texto selecionável e sem imagem A4 inteira.
- Arquivos previstos: componentes e tipos do contrato, renderizador PDF e testes focados, além dos registros do lote.
- Validações focadas: renderização e inspeção visual de todas as páginas da minuta, teste de paginação/assinatura, extração de texto e inspeção de recursos do PDF, lint focado e build se necessário.
- Validação final: minuta revisada sem modificação (SHA-256 `b4df5b33631bd25411242f64f1dcaf3ea12bd03e4d8f5c3c21574fb2941a670e`); migration `20260807151556_fix_contrato_encerramento_final` aplicada pelo MCP Supabase e consultada: modelo Técnico na revisão 3, sem `\\n` literal, sete páginas canônicas e encerramento presente apenas na página 7. Teste vetorial 4/4, inspeção visual do PDF A4 de duas páginas com assinatura somente na segunda, `npm run test:pdf-exports`, ESLint focado e build concluídos.
- Publicação prevista: nenhuma; alterações locais aguardam solicitação explícita.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: preservar alterações paralelas fora do escopo e não converter conteúdo jurídico em dados operacionais; a assinatura deve continuar reservada à página final mesmo quando a quantidade de páginas variar.

## Lote: 2026-08-06-operacao-memoria-rag

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Implantar memória canônica, recuperação RAG restrita, registros de lote e protocolo único de publicação para todos os agentes.
- Escopo incluído: `AGENTS.md`, `ai/operacao/`, marcadores de legado em `ai/`, skill global do Codex, scripts de RAG e sincronização OpenContext.
- Fora de escopo: produto do portal, dados acadêmicos/financeiros, migrations, Edge Functions e produção.
- Regras/RPC/segurança aplicáveis: GitHub e Supabase exclusivamente por MCP; corpus sem segredos ou dados pessoais; frontend continua sem regras/cálculos canônicos.
- Critérios de aceite: busca local retorna fontes citáveis; índice é limitado ao manifesto; OpenContext recebe cópia sincronizável; todos os agentes recebem o protocolo pelo `AGENTS.md`; há registros separados de alterações, commits e deploys.
- Arquivos previstos: documentação operacional, scripts e `.gitignore`.
- Validações focadas: testes dos scripts RAG e de sincronização aprovados; pesquisa lexical de amostra retornou a memória canônica; skill global validada.
- Validação final: TypeScript/lint não se aplicam aos Markdown; build de produto não é necessário porque não há alteração de produto.
- Publicação prevista: commit `70e52473c852707d179783ae0d23156281167023`, PR #61 aberta como rascunho e uma Preview Vercel concluída com sucesso. Produção não autorizada.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: embeddings semânticos externos dependem de `OPENAI_API_KEY` aprovada; a camada lexical já está ativa. A PR #61 permanece aberta como rascunho, portanto este lote não deve ser marcado como publicado/mesclado.

## Lote: 2026-08-06-patrimonio-contas-a-pagar-emprestimos

- Estado: PRONTO_PARA_VALIDACAO
- Objetivo: Criar o módulo Patrimônio por polo, transformar Despesas em Contas a Pagar, adicionar rateio canônico às Contas a Pagar e permitir empréstimos rateados pela Matriz ou próprios de cada polo, refletindo obrigações/custos corretamente no Caixa.
- Escopo incluído: banco/RPC/RLS/Realtime necessários, `modules/gestor/patrimonio/`, Financeiro, Caixa, query keys, testes focados, registros e documentação operacional. O complemento atual inclui: rateio genérico de Contas a Pagar com um título e uma baixa integral na Matriz; empréstimo da Matriz com rateio; e empréstimo próprio do polo sem rateio.
- Fora de escopo: produção, cálculo financeiro no frontend, migração de dados históricos não compatível e alteração dos gateways de cobrança.
- Regras/RPC/segurança aplicáveis: Supabase/GitHub exclusivamente por MCP; valores, rateio, parcelas, baixas e indicadores do Caixa são canônicos no backend/RPC; frontend apenas coleta/exibe; isolamento por empresa e polo; TanStack Query e Realtime preservados.
- Critérios de aceite: patrimônio cadastra, busca e alterna card/tabela por polo; Contas a Pagar substitui a nomenclatura de Despesas sem quebrar dados; uma Conta a Pagar lançada pela Matriz pode ratear seu custo para todos ou polos selecionados sem criar títulos/baixas duplicados; empréstimo da Matriz usa apenas `TODOS`/`SELECIONADOS`, enquanto empréstimo do polo usa somente `SEM_RATEIO` e gera Conta a Pagar/baixa apenas nele; salários/obrigações podem permanecer em aberto e ter desdobramento opcional; Caixa separa financiamento de custo operacional; estados de loading/erro/vazio e atualizações em tempo real funcionam.
- Arquivos previstos: migrations, RPCs, tipos gerados, services/hooks/componentes do Gestor, páginas Financeiro/Caixa, testes e registros.
- Validações focadas: `npm run test:caixa-report` (20/20), `npm run test:gestor-access` (30/30), `npm run test:financeiro-rpc` (6/6), testes Deno de empréstimos (9/9), lint focado dos módulos aprovado, verificação de RPC/RLS/índices/Realtime pelo MCP Supabase e revisão independente do lote aprovadas.
- Validação final: build de `2.3.0-beta.1` aprovado após o complemento de rateio em Contas a Pagar e empréstimos por polo. As migrations `20260807035000`, `20260807035500`, `20260807036000` e `20260807037000` foram aplicadas pelo MCP Supabase. O TypeScript amplo mantém um erro pré-existente, fora do lote, em `tmp/pdfs/review-caixa/real-report-harness.tsx`.
- Publicação prevista: um commit atômico, uma PR e uma Preview Vercel; produção somente por solicitação explícita.
- Responsável pela consolidação: Codex, com três frentes técnicas fechadas.
- Pendências ou riscos: a publicação web ainda não foi feita; deve ser um único commit/PR/Preview contendo somente o manifesto deste lote. Perfis personalizados precisam receber explicitamente as novas permissões de Patrimônio e Empréstimos quando forem usados; a sessão deve ser renovada para o menu refletir a alteração. Não havia empréstimos legados no banco no fechamento, portanto o backfill de escopo de rateio não alterou histórico. O rateio genérico de Contas a Pagar não pode alterar o pagamento físico nem criar uma segunda obrigação para os polos. As RPCs antigas de empréstimo permanecem sem `EXECUTE` para usuários autenticados para não contornar o escopo Matriz/polo.

## Lote: 2026-08-07-documentos-matricula-foto-assinatura-escala

- Estado: EM_EXECUCAO
- Objetivo: Corrigir a composição visual canônica da Ficha de Matrícula e da Pasta de Identificação e alinhar o fluxo de Contratos de Aluno à Declaração de Matrícula, para que foto, assinatura, prévia A4, busca e seleção sejam proporcionais, consistentes e alinhadas ao padrão institucional.
- Escopo incluído: renderizadores vetoriais e visuais, composição da fotografia e assinatura, visualizador da prévia, ordem/estado de busca e seleção de Contratos de Aluno e testes focados da Ficha de Matrícula, Pasta de Identificação e Contrato de Aluno.
- Fora de escopo: alteração de dados do aluno, regras de elegibilidade/RPC, conteúdo jurídico aprovado do contrato, outros modelos documentais, publicação GitHub/Vercel e rasterização de páginas.
- Regras/RPC/segurança aplicáveis: prévia, download e impressão reutilizam o mesmo Blob PDF canônico; fotografia e assinatura permanecem recursos isolados; texto, linhas e campos seguem vetoriais e selecionáveis.
- Critérios de aceite: a foto preenche seu quadro por recorte proporcional sem zoom excessivo; a assinatura da diretoria cruza a linha de assinatura com leitura natural, sem colidir no rótulo; ambas as prévias preservam a escala A4 e não aparentam zoom/corte diferente do PDF final; Contratos de Aluno apresenta primeiro a busca vazia, depois os resultados, como a Declaração; a prévia do contrato usa o mesmo desenho, margens e hierarquia estrutural do modelo aprovado e do PDF canônico.
- Arquivos previstos: componentes/renderizadores e testes de emissão desses documentos, além deste lote e dos registros de fechamento.
- Validações focadas: renderização de PDFs de fixture, inspeção visual A4, extração de texto, inspeção de recursos incorporados, testes de estado de busca e lint focado.
- Validação final:
- Publicação prevista: nenhuma sem solicitação posterior; entrega local para validação visual.
- Responsável pela consolidação: Codex.
- Pendências ou riscos: preservar alterações paralelas; manter o frontend sem decisões de paginação ou dados canônicos; confirmar por fixture as fotos em orientação divergente; manter Contratos de Aluno restrito às modalidades/modelos autorizados pelo retorno canônico.

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
