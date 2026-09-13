# Legenda avaliativa dos diários — 2026-09-13

Estado: publicação 4.8.63 autorizada pelo usuário; validação local aprovada, CI e smoke pós-deploy em execução.

## Objetivo e aceite

Restaurar a legenda integral abaixo da tabela de notas, incluindo páginas de continuação,
sem alterar instrumentos, notas, médias, frequência ou resultados dos documentos originais.
Pedido do usuário incluiu conferência da pasta DIARIO e revisão com agentes.
Escopo de PDF com ajuste da área de tabela em páginas compartilhadas; sem banco ou importação.
O lote de ciclos Proesc existente em LOTE_ATIVO.md foi preservado como trabalho paralelo.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-result-legend.test.ts`
- `ai/operacao/registros/alteracoes/2026-09-13-diarios-legenda-avaliativa.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 6 arquivos.

## Evidência e alteração

- Conferidos 17 DOCX válidos (14 únicos) em DIARIO; dois temporários Word ignorados.
- Todos contêm a legenda completa em dois parágrafos.
- Anatomia T42 originalmente usa P/P; Microbiologia T41 usa P/TG/CQ.
- Outros originais usam ordens e combinações próprias; a legenda não determina colunas obrigatórias.
- Safari autenticado confirmou Resultados 1 sem legenda e Resultados 2 com frase genérica.
- Causa: condição de última página e substituição de DIARIO_RESULT_LEGEND_TEXT no modo documental.
- O compositor agora usa a legenda completa em cada página, com tabela limitada a 174 mm.
- Mantidos 18 alunos/página, agrupamento, número de páginas e ordem das colunas.
- Serviço de modelos continua resolvendo modelo por curso/modalidade; prévia, download e impressão
  mantêm o Blob compartilhado. Capa, contracapa, assinatura, marca e adaptadores não foram alterados.
- O arquivo do compositor já possuía mudanças anteriores; apenas os trechos da legenda/área da
  tabela foram editados nesta tarefa. Publicação futura deve comparar com a base remota atual.

## Validação

- Regressão nova com typecheck: antes 8 passaram/16 falharam; depois 24/24 passaram.
- Matriz: normal, documental P/P, documental P/TG/CQ; preenchido/branco; 0/18/19/36 alunos.
- Contratos existentes documental, fronteira do compositor e snapshot: 21/21 passaram.
- Total: 45 testes focados aprovados; nenhum build global necessário nesta etapa local.
- PDFs do compositor nativo gerados com dados sintéticos de 27 e 28 alunos.
- pdftotext confirmou texto integral em ambas as páginas de resultados.
- pdfimages listou somente logo isolado, máscara de transparência e QR; sem captura de página.
- Renderização e revisão independente de Anatomia (páginas 5/6) e Microbiologia (página 5)
  confirmaram legenda abaixo da tabela e antes do rodapé, sem cortes ou sobreposição.
- Recursos temporários e baseline anterior estão em tmp/diario-legenda-qa e não integram entrega.
- Sem publicação nem modificação de dados reais. Smoke autenticado da versão corrigida depende
  da disponibilização dessa versão; o defeito anterior foi reproduzido na sessão real.
- Sem alteração de fonte do corpus RAG (registros históricos não integram corpus padrão).

## Publicação autorizada

- Autorização explícita renovada nesta conversa em 13/09/2026.
- Base remota main: faed55c355366334a5311b28cdf64a4d8f74ff7a (4.8.61).
- Compositor remoto coincide byte a byte com baseline anterior ao patch.
- Versão 4.8.63/revisão72; reserva local 4.8.62 de ciclos Proesc preservada, sem incluí-la.
- Publicação exclusiva dos seis arquivos acima, por MCP GitHub, preservando lote ativo paralelo.
