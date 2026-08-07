# Alteração — encerramento final do contrato de aluno

- Lote: `2026-08-07-correcao-minuta-contrato-rodape-assinatura`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: revisão não destrutiva da minuta, normalização do modelo Técnico, prévia e renderizadores de contrato.
- Não alterado: teor jurídico das cláusulas, minuta original, outros modelos, emissão já arquivada e publicação GitHub/Vercel.

## Evidência da minuta

- A referência é `Documentos/MINUTA - CONTRATOS ALUNOS 2.docx`, mantida inalterada; SHA-256: `b4df5b33631bd25411242f64f1dcaf3ea12bd03e4d8f5c3c21574fb2941a670e`.
- O encerramento da minuta contém local/data, campos de CONTRATANTE e CONTRATADA e testemunhas depois da última cláusula. Não há assinatura recorrente em página intermediária.
- A minuta não foi incluída no RAG, no histórico de alterações nem em qualquer artefato publicado.

## Resultado

- A migration `20260807151556_fix_contrato_encerramento_final` corrigiu as sequências de quebra de linha gravadas literalmente no modelo Técnico, criou a revisão 3 em `EM_REVISAO` e preservou a trilha no histórico do modelo.
- A RPC de renderização aceita também snapshots anteriores e normaliza `\\n`/`\\r\\n` antes de compor o rodapé canônico.
- O paginador canônico entrega o encerramento somente para a última página; consulta pós-migration confirmou sete páginas e conteúdo de encerramento exclusivamente na página 7.
- A prévia do editor agora associa o rodapé a uma página, em vez de repetir o valor globalmente. O campo foi renomeado para **Encerramento e assinaturas** e a nota de controle deixou de ser impressa.
- A prévia oficial e o PDF vetorial exibem QR, linha de encerramento e assinatura somente na folha final. O QR foi compactado para permanecer dentro da área segura da A4.
- Texto, linhas e marca d'água permanecem vetoriais; QR continua o único recurso raster isolado.

## Validações

- MCP Supabase: migration aplicada e consulta confirmou revisão 3, nenhuma quebra `\\n` literal e um único encerramento na página 7.
- `deno test --allow-read --allow-write --allow-env modules/gestor/secretaria/shared/canonical-document-vector-pdf.contract.test.ts`: 4/4 aprovados.
- PDF de teste com duas páginas: `pdfinfo` confirmou A4; `pdftotext` encontrou as assinaturas somente na página final, sem `\\n` literal; PNGs das duas páginas foram inspecionados visualmente.
- `npm run test:pdf-exports`: aprovado, sem rasterização de página inteira.
- ESLint focado e `npm run build`: aprovados.

## Segurança e publicação

- A atualização do banco foi feita somente pelo MCP Supabase. As permissões da função de renderização continuam revogadas para `public`, `anon` e `authenticated`; a emissão segura segue responsável pela autorização e pelo payload canônico.
- O diagnóstico global de segurança do Supabase retornou avisos legados fora do lote. Não houve novo aviso específico introduzido pelo contrato.
- Não há commit, PR, Preview Vercel ou publicação pendente neste lote sem solicitação explícita.
