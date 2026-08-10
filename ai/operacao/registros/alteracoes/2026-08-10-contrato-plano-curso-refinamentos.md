# Alteração — Contrato técnico e Plano de Curso

- Lote: `2026-08-10-contrato-plano-curso-refinamentos`
- Estado no fechamento: `PRONTO_PARA_PUBLICACAO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- A minuta técnica integral preserva o texto jurídico, compacta a paginação validada em sete folhas e reutiliza a última página para o encerramento quando existe área segura.
- O editor e a emissão canônica permanecem vinculados à revisão jurídica; históricos anteriores continuam usando o snapshot e o compositor de sua própria versão.
- O Plano de Curso ganhou edição diária por data, paginação determinística, identidade visual da unidade e fluxo do professor alinhado ao documento canônico.

## Banco e documentos

- As migrations `merge_full_contract_closing_when_safe` e `compact_full_contract_to_seven_pages` já estavam aplicadas e foram versionadas no repositório.
- O contrato continua PDF vetorial nativo, com texto extraível; não foi criado pipeline raster nem regravado documento histórico.
- A publicação destes arquivos foi autorizada expressamente pelo usuário em 2026-08-10.

## Validações

- Contrato, PDF vetorial e Plano de Curso: 44/44.
- TypeScript global e build de produção aprovados para `4.2.0-beta.1`.
- O conteúdo não recebeu nova edição durante a publicação; foi publicado exatamente o lote local já concluído e testado.

## Riscos conhecidos

- Ativação jurídica para emissão continua sujeita às permissões e estados canônicos existentes; esta release não aprova automaticamente uma nova revisão.
