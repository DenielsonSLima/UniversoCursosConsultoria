# NFS-e externa e modelo de palestra para prefeitura

## Escopo e autorização

Operação fiscal administrativa solicitada expressamente pelo usuário: importar na matriz a NFS-e/XML e o PDF fornecidos, emitidos no mês corrente, e criar um segundo modelo para palestra para prefeitura. Revisão interna com três agentes independentes (documento fiscal, contrato de importação e modelo/interface). Preservar o modelo de alunos e o lote paralelo de filiais; este registro possui manifesto separado e não substitui seu LOTE_ATIVO.

Aceite: uma nota emitida disponível no histórico da matriz no mês original; XML integral e PDF original arquivados privadamente com hashes; repetição sem duplicação; segundo modelo independente, com tomador e valor variáveis. Em continuidade, o usuário esclareceu que cadastrar o modelo inclui permitir seu uso: completar e publicar no emissor o suporte ao cenário governamental descrito na nota. Nenhuma nova transmissão fiscal, cobrança ou baixa financeira integra a correção. Sem publicação de frontend.

## Implementação

- Importação administrativa privada, sem grants para a aplicação e sem simular JWT/identidade de usuário. O UUID da solicitação identifica explicitamente uma operação administrativa na auditoria.
- Origem externa registrada separadamente; XML e PDF originais imutáveis, hashes e fatos extraídos do XML nacional. O número DPS local é somente identificador interno; os dados da DPS original permanecem no XML e na proveniência.
- Matriz ativa, CNPJ prestador, parceiro tomador, ambiente, chave, códigos e identidade do documento são verificados. Replay exige os mesmos vínculos e bytes; documento divergente é recusado.
- Documento importado participa de Emitidas, totais e download de XML/DANFSe existentes. Não é preparação de nova emissão. Cancelamento/transmissão incompatíveis permanecem bloqueados.
- O PDF original é arquivado privadamente; o botão PDF existente continua compondo DANFSe a partir do XML. Não houve verificação criptográfica da assinatura do documento fornecido.
- Modelo de palestra baseado nos campos efetivamente informados: tomador definido a cada serviço, valor variável, enquadramento da unidade, ISS sem alíquota inventada e transparência do Simples separada do ISS. Cadastro municipal e demais opções seguem o documento de referência.
- A primeira entrega cadastrou o modelo mas deixou a lacuna do emissor. A correção transporta a opção governamental do snapshot ao XML: `tpOper=1`, `tpEnteGov=4`, `cIndOp=030102`, `CST=000`, `cClassTrib=000001`, serviço `080201` e NBS `122051900`. Suporte restrito ao cenário comprovado, origem serviço, tomador CNPJ, sem consumo pessoal, com endereço completo e município coerente com a prestação; nenhuma cidade/empresa foi fixada no código. Perfis restantes conservam suas validações.

## Validação e estado

Concluído no banco de produção via MCP Supabase. Três migrations aplicadas, preservadas byte a byte e renomeadas com os prefixos exatos do ledger: `20261112020706`, `20261112020714` e `20261112020721`.

Uma NFS-e externa importada e um modelo ativo independente criados atomicamente. Replay real retornou o mesmo documento sem duplicação. XML e PDF originais mantiveram os hashes SHA-256 locais; emissão/competência e valor permaneceram os da fonte. O total de Emitidas da matriz no mês inclui a nota uma única vez. Não houve conta a receber, pagamento, nova transmissão ou alteração de certificado/configuração. O modelo de alunos conserva versão e hash anteriores.

Validações: quinze testes-fonte aprovados (nove de importação e seis de modelo administrativo) com PostgreSQL/PGlite; normalizadores reais executados também no banco alvo antes da gravação; parser XML, projeção tributária SQL, texto e render do DANFSe pelo compositor existente. O XML preserva campos tributários ausentes como nulos. Grants/RLS dos novos objetos conferidos, com acesso de aplicação negado aos originais e executores administrativos. A revisão corrigiu colisão entre solicitação/chave e conservou integralmente o filtro vigente de canceladas. `npm run check:file-lines` aprovado; fontes aplicadas conferidas byte a byte. Sem mudança frontend, build global ou deploy do site.

Continuidade do emissor: 33 testes Deno aprovados, incluindo adapter governamental, serialização, assinatura com certificado efêmero sem rede, esquema de produção, alunos e local das filiais. Tipagem do entrypoint aprovada. XML de alunos preservado byte a byte por hash. Revisão fiscal independente conferiu XSD e Anexo I oficiais de produção na [documentação técnica atual](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual). Usa o perfil numérico derivado já vigente, sem alterar schemas ou contornar validação. Snapshot real lido do banco com o modelo salvo passou em construção offline, sem modificar operação nem transmitir o documento importado.

Edge `nfse-national-individual` publicada via MCP, ACTIVE v24, JWT obrigatório. SHA-256 do bundle: `31b03017a32733210a20aed804ae73ddbee75a7befe1b1899b914535d8da4688`. Getter remoto confirmou os 32 arquivos de runtime: somente `dps.ts`, `adapter.ts` e `adapter-ibscbs.ts` alterados; os demais 29 idênticos à v23. Arquivo de tipos e configuração/lock existentes foram incluídos no upload e não são retornados na árvore runtime do getter. Preservados autenticação, certificados, relay, contrato vivo, schema, assinatura e reconciliação. Nenhuma nota nova transmitida durante a correção; a nota importada e o modelo ativo v1 permanecem íntegros no banco. O bloqueio específico de compra governamental foi removido para o perfil desse modelo; aprovação fiscal de uma nova nota exige a futura emissão explicitamente comandada pelo usuário.

A nota importada permanece em Emitidas; o backend a exclui da lista de preparações de Serviços antes de paginação/totais, evitando oferecer nova emissão. O botão PDF habitual gera DANFSe; os bytes do anexo original ficam no arquivo fiscal privado.

Safari autenticado na matriz foi confirmado. A sessão passou a receber outra interação durante a operação; não disputar o navegador nem interromper o fluxo paralelo. Smoke visual final permanece pendente enquanto essa interação continuar. Validação direta de banco e dos contratos afetados não substitui esse smoke.

## Manifesto explícito

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-importacao-palestra-prefeitura.md`
- `supabase/migrations/20261112020706_nfse_external_document_import.sql`
- `supabase/migrations/20261112020714_nfse_external_model_admin.sql`
- `supabase/migrations/20261112020721_nfse_external_import_preparation_reads.sql`
- `supabase/tests/nfse_external_import.isolated.test.mjs`
- `supabase/tests/nfse_external_model_admin.isolated.test.mjs`
- `supabase/functions/nfse-national-individual/adapter.ts`
- `supabase/functions/nfse-national-individual/adapter-ibscbs.ts`
- `supabase/functions/nfse-national-individual/adapter-government.fixture.ts`
- `supabase/functions/nfse-national-individual/adapter-government.test.ts`
- `supabase/functions/_shared/nfse-national/dps.ts`
- `supabase/functions/_shared/nfse-national/dps.types.ts`
- `supabase/functions/_shared/nfse-national/dps-government.test.ts`

Total: 14 arquivos.
