# Sincronização das fontes já publicadas

## Problema, autorização e resultado

O usuário solicitou conferência das últimas alterações com três agentes e autorizou revisar, conferir e atualizar o projeto. A auditoria de 49 registros de 11–13/11 e 779 arquivos encontrou 772 blobs idênticos à main, seis fontes ausentes e um registro com fechamento apenas local.

As três migrations administrativas da importação externa de NFS-e já estavam aplicadas no banco de produção. A PR #392 preservou o isolamento entre lotes e incorporou apenas as dependências governamentais do emissor; as fontes administrativas, dois testes e seu registro ficaram sem integração posterior.

Esta entrega preserva essas seis fontes no GitHub e completa os comprovantes de Pix, portal do aluno e confiança EAD. Não executa SQL em produção nem altera dados, autorização, lógica fiscal/financeira ou bundles Edge. O incremento 4.8.335/revisão 344 atende ao controle de versão do repositório para a inclusão das fontes SQL/testes.

## Revisão antes da entrega

- Base remota confirmada: main `b82b04a412050e2d3defe0ec450e7e83094e0e44`, versão 4.8.334, PR #425 integrada com 14/14 workflows aprovados. Os últimos dez PRs têm CI aprovado.
- Produção base: `dpl_695TRRShNiDgW7nJeB2f3CsESPZ4`, READY; site e bundle públicos HTTP 200, versão 4.8.334. Os 37 deploys de produção consultados desde 12/11 estão READY.
- Banco: 138/138 migrations locais de 11–13/11 correspondem por nome ao ledger; nenhuma pendente. Confiança EAD ativa desde 13/11 às 01:08:48 de Maceió, cron ativo e finalizadores publicados.
- Fontes SQL recuperadas imutáveis e idênticas aos statements do ledger, com os prefixos 20261112020706, 20261112020714 e 20261112020721. Nenhuma reaplicação integra este lote.
- MD5 local/ledger: importação `da0aa4ef27d96cf99f3ddda7682b1db2`; modelo `a365431b25c5a098fc8e479a8f8c3939`; leituras `ad79368b0a5ab12ec040dc130da14a40`.
- Dois testes fiscais usam somente dados sintéticos e PGlite em memória. Os 15 testes passaram em PGlite 0.3.14 (CI) e 0.5.10, sem alteração das fontes. O workflow NFS-e existente já inclui os arquivos pelo glob de testes isolados.
- Workflows inspecionados não aplicam migrations nem implantam Supabase. A publicação usa MCP GitHub e o deploy Vercel associado; nenhuma gravação no backend integra o lote.
- Histórico 4.8.267 arquivado integralmente para manter o changelog em até 500 linhas. O índice RAG é regenerado uma vez após atualizar as fontes operacionais.

## Validação e limites

Conferir versão/histórico, teto de linhas e os 16 arquivos deste manifesto antes do commit. O gate de CI executa a integração completa e os testes fiscais restaurados; a Preview deve estar READY antes do merge. A conclusão de produção é comprovada pelo deploy e pelo asset público da versão correspondente, ligados à PR desta entrega.

Nenhum teste em produção cria nota, cobrança, pagamento, certificado ou envio de e-mail. Smoke autenticado anterior continua pendente e não é substituído por HTTP/CI. Os 23 PRs históricos abertos não integram esta atualização.

## Manifesto explícito

Total: 16 arquivos.

- `supabase/migrations/20261112020706_nfse_external_document_import.sql`
- `supabase/migrations/20261112020714_nfse_external_model_admin.sql`
- `supabase/migrations/20261112020721_nfse_external_import_preparation_reads.sql`
- `supabase/tests/nfse_external_import.isolated.test.mjs`
- `supabase/tests/nfse_external_model_admin.isolated.test.mjs`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-importacao-palestra-prefeitura.md`
- `ai/operacao/registros/alteracoes/2026-11-12-pix-duas-vias-copia-parceiro.md`
- `ai/operacao/registros/alteracoes/2026-11-13-aluno-interface-compacta.md`
- `ai/operacao/registros/alteracoes/2026-11-13-ead-confianca-confirmacao-manual.md`
- `ai/operacao/registros/alteracoes/2026-11-13-sincronizacao-fontes-publicadas.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-267.md`
