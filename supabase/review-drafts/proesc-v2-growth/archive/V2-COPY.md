# Codec, transferência e worker V2 copy-only

Preparo local, 2026-10-10. Formato próprio, separado do ensaio sintético anterior.
Nenhum dado real foi exportado por estes módulos durante o desenvolvimento.
Os testes usam fixtures inventadas, PostgreSQL isolado quando integrado pelo
pacote, e transporte HTTP em memória. Não há endpoint ou implantação automática.

## API e arquivos

- `v2-copy-codec.mjs`: `encodeV2Copy(exported, expectedBatchId, approvedScope)`,
  `decodeV2CopyManifest(gzip, receipt)` e `decodeV2CopyPayload(gzip, manifest)`.
- `v2-copy-transfer.mjs`: `publishV2Copy(exported, remote, expectedBatchId)` devolve
  recibo somente após os dois uploads/readbacks; `restoreV2Copy(remote, receipt,
  destination, filename)` verifica e restaura arquivo local separado.
- `v2-copy-worker.mjs`: `runV2CopyBatch(batchId, dependencies)` devolve
  `{receipt, catalog}` apenas após confirmação explícita do catálogo.
- `v2-copy-local-store.mjs`: `createV2CopyRestoreStore(directory)` cria destino
  local explícito, sem sobrescrita, remoção, rede ou importação para Postgres.
- `v2-copy-fixture.mjs` e os dois testes `v2-copy-*.test.mjs`: somente dados
  inventados, incluindo números financeiros maiores que a precisão de Number.

O adapter existente `createSupabasePrivateStore` continua responsável por HTTP,
credenciais injetadas, origem fixa, bucket privado, MIME, teto e readback.
O núcleo `archive.mjs`/`local-store.mjs` permanece intacto. Dados V2 não são
rotulados como sintéticos nem passam pelo verificador do formato sintético.

## Confiança e contrato da fonte

O backend recebe somente um `batchId` aprovado. `exportBatch(batchId,{signal})`
deve chamar `proesc_v2_export_copy_service(p_batch)` e devolver diretamente o
objeto de dados da RPC; falhas do cliente/PostgREST devem rejeitar a chamada.
Não aceitar seleção, unidade, projeto, bucket ou prefixo fornecidos livremente
pelo navegador. A função de exportação confere o plano privado previamente
aprovado pelo operador. O codec não cria nem aprova planos.

O `remote` é configurado por backend confiável e já ligado ao projeto/unidade
autorizados. A ponte exige adapter habilitado, bucket `proesc-history`, namespace
`proesc-v2-copy`, unidade numérica textual e prefixo correspondente. Snapshot e
validação ocorrem antes dos awaits; adapter desligado bloqueia antes da export RPC.
O projeto exato configurado é comparado com o projeto exportado. A configuração
real, escolha da identidade backend e autorização do lote continuam pendentes.

O envelope exportado `proesc-v2-copy-v1` deve conter os campos exatos do draft
SQL: batch/projeto/bucket/namespace/tenant/run, IDs ordenados, contagem, texto,
SHA-256 e bytes. Aceita até 100 observações e 1 MiB UTF-8. Rejeita getters, campos
extras, IDs duplicados/desordenados e escopos divergentes. Confere hash/tamanho
antes de comprimir e confronta run/unidade/IDs/contagem com o conteúdo do envelope.

`payloadText` é preservado byte a byte, sem acrescentar newline ou reserializar.
O nome remoto termina em `.jsonl.gz` para o contrato do adapter; o conteúdo é um
único documento JSON de uma linha, exatamente como produzido no PostgreSQL.
A leitura do envelope usa JSON.parse para validar metadados; `normalizedJson`
permanece uma string opaca e nunca é submetida a parse/stringify financeiro.
Um digest autodeclarado não comprova aprovação: o plano privado e a RPC confiável
são a âncora de origem. O codec só valida estrutura, coerência e integridade.

## Objetos, manifesto e recibo

Dados: `<batchId>.<compressedSha256>.jsonl.gz`, até 4 MiB comprimidos.
Manifesto: `<batchId>.<manifestCompressedSha256>.manifest.json.gz`.
Ambos usam `application/gzip`, sem ampliar MIME ou políticas do bucket.

O manifesto próprio `proesc-v2-copy-manifest-v1` carrega seleção, run, escopo,
contagem, tamanhos e hashes do payload original e comprimido. Tem tetos
independentes de 64 KiB para JSON e gzip. A descompressão limita a saída pelo
tamanho previamente validado; os decoders públicos aplicam seus próprios tetos,
mesmo quando chamados fora da ponte. Buffers e descritores são copiados antes
de operações assíncronas. Hashes e nomes são vinculados de forma inequívoca.

O recibo exato `proesc-v2-copy-receipt-v1` contém:

- `batchId`, `payloadSha256`, `rawBytes`, `rowCount`;
- `objectName`, `compressedSha256`, `compressedBytes`;
- `manifestObjectName`, `manifestJsonSha256`, `manifestJsonBytes`;
- `manifestCompressedSha256`, `manifestCompressedBytes`, `storageScope`;
- `format`, `copyOnly: true`.

Nenhum dado financeiro, credencial ou campo arbitrário é incluído no recibo.
A ponte faz um decode integral local antes de enviar. Envia/readback dos dados
primeiro, seguido do manifesto. O adapter compara os bytes lidos com os enviados;
resposta de upload sozinha ou conflito sem bytes iguais não confirma a cópia.

`recordReceipt(batchId,receipt,{signal})` deve chamar separadamente
`proesc_v2_record_copy_receipt_service(p_batch,p_receipt)`. O worker aceita somente
ack com batch exato, status `COPY_RECEIPT_RECORDED` e `copyOnly=true`, sem extras.
O catálogo SQL confere o vínculo ao plano; não consegue atestar Storage por si só.
A confiança no worker backend continua necessária. Este código não contém o
shim de cliente PostgREST, endpoint, segredo ou autenticação real.

## Falhas, retomada e restauração

`rpcTimeoutMs` é validado e capturado antes de iniciar, padrão 15 segundos e teto
60 segundos por RPC. AbortSignal deve ser respeitado pelo cliente injetado.
Timeout, erro ou ack inesperado ficam não confirmados; não existe retry automático.
Um callback que ignore cancelamento pode concluir remotamente depois do timeout.
A aplicação não deve declarar sucesso nem apagar objetos nesse caso. Uma repetição
explícita do mesmo lote verifica bytes existentes e aceita somente recibo igual.

Objeto parcialmente enviado ou manifesto não confirmado pode ficar órfão. Nenhum
caminho remove ou sobrescreve objetos. Não há transação distribuída entre Storage
e catálogo. Mudança de versão do compressor pode produzir bytes gzip diferentes;
replay divergente do recibo é bloqueado, não substituído. Preservar recibos e
artefatos exatos confirmados ao planejar retomada entre versões do runtime.

`restoreV2Copy` valida escopo e recibo antes de HTTP, verifica manifesto gzip/JSON,
valida seleção, baixa e verifica payload, descomprime até 1 MiB e só então grava
um basename `.json` no destino explícito. O conteúdo final é o `payloadText`
original, sem reformatação. Compara novamente os bytes do arquivo gravado.
Diretório distinto do banco/origem é requisito operacional; o tipo de adapter
local separado impede reutilizar por engano o adapter sintético. Não importa SQL.
Arquivos/symlinks existentes divergentes bloqueiam; replay idêntico é permitido.

O recibo atesta o fluxo de cópia/readback e não afirma que o operador executou
uma restauração independente. O piloto real deve restaurar em local autorizado e
comparar bytes/hash/contagem antes de declarar recuperabilidade ou concluir seu
gate operacional. Tal ensaio não libera exclusão das fontes.

## Validação e gates restantes

Executar `node --test supabase/review-drafts/proesc-v2-growth/archive/*.test.mjs`.
Os testes específicos cobrem bytes financeiros exatos, escopo, tetos próprios dos
decoders, gzip bomb, mutations, HTTP ambíguo, catalogação incerta, deadlines,
replay sem sobrescrita, falhas antes do catálogo e restauração local imutável.
A integração SQL→HTTP mock→catálogo é mantida separadamente no pacote do draft.

Os mocks não comprovam acesso/RLS, identidade backend, versão implantada, quota,
egresso ou segurança do diretório de uma implantação. Antes de usar dados reais:
revisão/CI, instalação especificamente aprovada, shim backend revisado, destino
local seguro e autorizado, lote/IDs/unidade/dados/destino aprovados e verificação
copy/readback/restore. Guardar objetos e catálogo com política de recuperação
própria: backup/PITR do banco não contém bytes Storage. Nenhum worker V1 é chamado.
Copiar preserva fontes e referências; não reduz automaticamente disco ocupado.
