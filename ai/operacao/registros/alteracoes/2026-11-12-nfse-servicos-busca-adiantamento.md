# NFS-e: busca de parceiros e modelos governamentais

## Escopo e aceite

Pedido do usuário: um único campo pesquisável por nome, CPF ou CNPJ em Adicionar serviço, com pessoas jurídicas localizáveis; dois modelos de palestra para prefeitura, um com pagamento posterior e outro para adiantamento recebido antes da prestação futura. A matriz administra os modelos compartilhados com as três filiais. Preservar o modelo acadêmico e os documentos já emitidos.

Aceite: busca única, seleção de PF/PJ no escopo autorizado e tratamento explícito de busca pendente/erro; tipo 1 preservado e tipo 4 transportado do modelo ao XML sob as mesmas guardas governamentais; variantes verificadas no cadastro e filiais. Nenhuma emissão fiscal real ou alteração financeira neste lote.

## Reprodução e execução

O modal mantinha um campo que consultava a RPC e outro que filtrava localmente a página recebida. A revisão está restrita a esse caminho. O modelo governamental existente continha tipo 1. Pela interface autenticada da matriz, foi identificado como recebimento posterior e criada uma variante de adiantamento, com tipo 4 e os demais campos preservados. A variante permaneceu inativa até a validação e publicação do executor e foi então ativada pela interface autenticada, com versão 3; o modelo posterior permaneceu ativo na versão 2/tipo 1. Ambos compartilham todos os demais campos e ficam disponíveis na matriz e nas três filiais. O modelo de alunos permanece na versão 7.

Referência: [Guia oficial do emissor, páginas 64–65](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf#page=65). O tipo 4 representa recebimento com fornecimento posterior; não é o tipo 3, fornecimento com pagamento já realizado e referência fiscal anterior.

Base: main `e1caa65180772cb82fd5e28414e9f09732ed0314`, versão 4.8.298; Edge v25. O delta governamental já aplicado na Edge e ainda não consolidado integralmente no GitHub será preservado e explicitado no manifesto, sem incorporar arquivos paralelos sem relação.

## Validação

Busca: DOM do modal 1/1, contratos RPC 9/9, seletor padrão 9/9 e SQL isolado 5/5 aprovados; TypeScript e lint focados sem erros. Migration `20261112092832` aplicada por MCP, corpo SHA-256 `8fd445991ae287e959d8478e69ac4ce81c83a88e17c9dc5e85b6de96995f32a5`; getter confirmou nome fantasia no predicado e grants autenticado sim/anon não.

Safari autenticado na aba local, conectado ao cadastro de produção: um único combobox; pesquisa por nome fantasia de PJ e por razão social encontrou resultados e permitiu seleção pelo teclado. O resultado por razão social não foi perdido quando o rótulo mostrava nome fantasia diferente. Modal encerrado sem gravar serviço. Build completo da 4.8.299 aprovado.

Fiscal: 23 testes Deno aprovados, com XSD de produção e assinatura por certificado sintético; revisão independente repetiu 10/10 dos testes governamentais. Somente aceitação dos tipos 1/4, mantidas as demais guardas; XML do tipo 1 conserva hash anterior e o tipo 4 não inventa referência fiscal. Edge `nfse-national-individual` v26 ACTIVE, JWT obrigatório, publicada via MCP após getter fresco da v25. Bundle SHA-256 `4b726ff37016d2b0bf836c0396ffd0a6e4308af66547cdaa8bb58f25cad9d211`; getter conferiu as 33 fontes do payload, sendo 31 preservadas byte a byte e somente `dps.ts` e `adapter-ibscbs.ts` alteradas. Tipos enviados como dependência, sem testes/fixtures no runtime. Autenticação, certificados, relay e competência acadêmica preservados. Nenhuma nova emissão ou movimentação financeira nesta execução.

A variante antecipada foi ativada pela UI após confirmação da Edge v26; o cadastro e a visibilidade para as quatro unidades foram novamente conferidos. Registro da troca contém quatro solicitações reais auditadas (salvar original, clonar, ajustar e ativar), com Realtime para matriz e filiais. CI/Preview da publicação 4.8.299 em fechamento.

## Manifesto explícito

- `modules/shared/components/InstitutionalSelect.tsx`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfseServicePartnerSearch.ts`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `supabase/migrations/20261112092832_nfse_service_partner_trade_name_search.sql`
- `supabase/tests/nfse_service_partner_search.isolated.test.mjs`
- `supabase/functions/_shared/nfse-national/dps.ts`
- `supabase/functions/_shared/nfse-national/dps.types.ts`
- `supabase/functions/nfse-national-individual/adapter-ibscbs.ts`
- `supabase/functions/_shared/nfse-national/dps-government.test.ts`
- `supabase/functions/nfse-national-individual/adapter-government.test.ts`
- `supabase/functions/nfse-national-individual/adapter.ts`
- `supabase/functions/nfse-national-individual/adapter-government.fixture.ts`
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-servicos-busca-adiantamento.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-19-versao-4-8-227.md`

Total: 21 arquivos. O registro de limite de linhas será publicado a partir da versão do main mais a entrada deste lote; a entrada local do lote paralelo de importação permanece preservada fora da publicação.
