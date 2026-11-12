# NFS-e: resumos paralelos e identificação dos polos

Status: prévia aprovada; publicação autorizada. Migration 20261112131549 aplicada; CI/deploy em preparação.

## Pedido

- Resumos em colunas separadas (tributação nacional, NBS e polo no consolidado), com total no final de cada visão e aviso de que não são somáveis entre si.
- Terceira linha por nota com nome do polo, CNPJ formatado, cidade e UF. No resumo por polo, cidade/UF e CNPJ distinguem nomes semelhantes.
- Título simples centralizado, maior, usando variante plain do cabeçalho canônico.
- Remover rótulo Produção; manter Homologação quando aplicável. Rodapé com data/hora da geração em Brasília.

## Manifesto explícito

- `modules/gestor/relatorios/nfse/RelatorioNfse.tsx`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.types.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.service.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.fixture.ts`
- `modules/gestor/relatorios/nfse/nfse-accounting.pdf.test.mjs`
- `supabase/migrations/20261112131549_nfse_accounting_summary_columns.sql`
- `supabase/tests/nfse_accounting_report.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-resumos-colunas-previa.md`

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-22-versao-4-8-232.md`

- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 15 arquivos

## Contrato e verificação

- Nova migration proposta, ainda não aplicada: paginação backend de seis notas por página (três linhas) e oito itens por coluna de resumo, com continuação independente e total apenas no final de cada coluna.
- Preserva o contrato summaryPages legado e acrescenta summaryColumnPages. Frontend rejeita perda, duplicação ou totalização marcada na página errada.
- Identificação dos polos vem do cadastro autorizado (não é substituição do emitente fiscal do XML).
- Testes PDF: sete aprovados, incluindo posições em três colunas, título centralizado, três linhas por nota, horário, ausência de Produção, continuação, total único por visão, desconhecidos e recursos vetoriais.
- SQL isolado com XML real: seis aprovados, incluindo escopo, autorização, dados fiscais, metadados por polo, paginação independente e totalizadores.
- TypeScript e ESLint focados aprovados. PDFs dos dois modelos renderizados e inspecionados; páginas extensas sem sobreposição.
- Nenhuma alteração de dados fiscais, emissão/cancelamento ou operação remota nesta revisão.
- Publicação futura exige rebase sobre main, versão própria, CI e aplicação ordenada da migration aprovada. Não alterar o lote ativo do EAD paralelo durante esta prévia.

## Revisão visual após rejeição da terceira linha

- O usuário rejeitou a linha com polo, CNPJ e cidade espalhados pela largura inteira.
- Identificação passou a anotação única discreta sob o tomador, sem terceira grade, com rótulo Unidade e todos os dados juntos. Altura do registro reduzida de 16 para 14,5 mm.
- Fixture usa nomes completos semelhantes entre polos para conferir legibilidade realista.
- Sete testes PDF aprovados, incluindo alinhamento e tipografia da anotação; prévia novamente renderizada. Nenhuma publicação.

## Fechamento autorizado

- Situações coloridas e textuais: autorizada, cancelada, rejeitada, bloqueada, processamento, aguardando confirmação e estados reais do cancelamento.
- Totais exclusivamente de emissão autorizada sem cancelamento confirmado; pedidos de cancelamento pendentes não excluem nota válida. Erros/processamentos não têm número, chave ou valores fiscais inventados. Rascunhos PREVIEWED fora do escopo.
- Filtro E usa data fiscal; R usa criação das operações não emitidas. Unidade/CNPJ/cidade preservados; nenhum dado pessoal real nas fixtures.
- RPC nova get_nfse_accounting_report_v2_secure preserva RPC v1 e clientes antigos durante rollout/rollback. Migration remota 20261112131549 aplicada em 12/11; apenas leitura, sem tabelas novas ou alteração de dados.
- Validação local: 8 testes PDF e 7 PGlite com XML real; TypeScript/ESLint aprovados. Render colorido e cinza conferido, estados explícitos não dependem de cor.
- Remoto: SECURITY DEFINER com search_path vazio, statement_timeout 30s, STABLE, anon sem execute, authenticated com guarda interna. Advisors nas mesmas cinco categorias preexistentes; nova RPC guardada continua sujeita ao advisory informativo de funções definer autenticadas.
- Chamada real com contexto nulo foi bloqueada pela ferramenta; não houve contorno nem leitura fiscal. Autorização foi exercitada em testes sintéticos; verificação remota restrita a schema/grants.
- Smoke Safari autenticado permanece pendente (Mac offline na última consulta); usuário aprovou prévia e publicação, conferirá no dispositivo dele. Não afirmar smoke autenticado concluído.
