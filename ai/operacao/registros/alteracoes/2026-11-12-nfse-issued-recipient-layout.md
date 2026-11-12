# Prévia — identificação e organização da lista Emitidas

Pedido: reorganizar as três linhas da lista Emissor NFS-e > Emitidas e apresentar CPF/CNPJ, cidade e UF do cliente.

- Cabeçalho: número/data, situação e valor alinhados.
- Identificação: nome do cliente e metadados fiscais juntos.
- Rodapé: serviço/modelo e ações; mensagem extensa em detalhes recolhidos.
- Projeção somente leitura de documento/município do XML autorizado, com catálogo IBGE existente. Sem XML válido ou município conhecido, a interface informa ausência em vez de inferir dados do cadastro atual.
- Preservadas autorização, escopo, seleção, valores, filtro e paginação.
- Migration nova não aplicada. Nenhuma emissão, cancelamento ou publicação.

Validação: dois testes de apresentação, seis contratos, DOM com ações/seleção e PostgreSQL isolado da projeção aprovados; TypeScript, ESLint e diff-check aprovados.
Smoke visual autenticado Safari pendente (não substituído por outro navegador). Prévia HTML estática sintética gerada fora do repositório.

Manifesto: NfseIssuedRows.tsx, nfse-issued-downloads.css, nfse-recipient.presentation.ts e teste; NfseIssuedList.interaction.test.mjs; nfse.types.ts; nfse.mappers.ts; nfse-documents.contract.test.ts; migration 20261112140440; nfse_issued_recipient.isolated.test.mjs; este registro.

## Aplicação remota autorizada (12/11/2026)
- Migration aplicada por Supabase MCP como `20261112140440_nfse_issued_recipient_details`; arquivo renomeado para coincidir com histórico remoto.
- Antes: corpo remoto de `nfse_documents_period_query` comparado integralmente com o local sem a projeção nova; idêntico. ACL apenas postgres, guardas e filtros preservados.
- Depois: teste com XML sintético retornou documento fictício e Aracaju/SE; XML inválido retorna objeto vazio; anon e authenticated sem EXECUTE no helper.
- Advisors antes/depois sem aumento: security 206/2/14/560/1 nos grupos existentes; performance 205/251/20/1; health sem ocorrências.
- Nenhuma nota real consultada, emitida, cancelada ou alterada. Frontend não publicado por este agente; integração centralizada.
