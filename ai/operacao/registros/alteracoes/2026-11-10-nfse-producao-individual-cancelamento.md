# NFS-e — fluxo diário, emissão autorizada e documentos fiscais

## Pedido e aceite

O usuário autorizou emitir pelo Portal Universo uma nota de produção de R$ 1,00
para seu cadastro pessoal e solicitar o cancelamento por valor incorreto. O Portal
Nacional é referência somente; nenhuma emissão foi realizada nele por esta entrega.
Após ampliar o pedido, o usuário autorizou publicar o lote completo em produção,
depois de validar emissão, cancelamento, Realtime e proteção do certificado.
Os testes de outras filiais pertencem à próxima etapa, após essa entrega.

O fluxo aprovado é selecionar aluno ou parceiro, escolher modelo e valor, revisar e
emitir pelas origens reais. As seis abas são Preparar emissão, Serviços, Pendentes,
Emitidas, Erros e Modelos; o ambiente fiscal pertence ao cabeçalho. Pré-modelos
contêm opções reutilizáveis; o tomador vem do cadastro escolhido na emissão.

Escopo crítico de banco, integração fiscal, interface, PDF e infraestrutura. As
alterações paralelas acadêmicas do checkout não pertencem ao manifesto deste lote.

## Emissão real comprovada

- NFS-e nº 2, produção, valor R$ 1,00, autorizada pela SEFIN e recuperada pela nossa
  interface. Emissão fiscal em 10/11/2026 às 22:05:38, horário de Brasília.
- Série DPS 49998, número 2; identidade durável da operação antes da transmissão.
  O primeiro número dessa série recebeu rejeição definitiva E0120 e foi preservado.
- A rejeição confirmou que a inscrição municipal deve ser omitida neste contrato
  CNC. A configuração de integração de produção foi corrigida na sessão autenticada;
  o cadastro geral da empresa e o snapshot rejeitado não foram alterados.
- Município IBGE 2803401, Simples ME/EPP, tributos federais e ISSQN no Simples.
  Modelo de produção versão 3 preservado: serviço 080201, NBS 122020000,
  IBS/CBS incluído, CST 000, classificação 000001, indicador 030101, consumo pessoal,
  destinatário igual ao adquirente, sem compra governamental nem retenções.
- O JSON de sucesso real pode omitir idDps/idDPS. A recuperação de produção aceita
  essa ausência somente após validar XML autorizado integral, ambiente, chave,
  DPS exata, emitente, tomador, valor e conteúdo fiscal da operação. Qualquer ID
  presente continua obrigado a coincidir. O contrato de homologação não foi relaxado.
- Não houve segundo POST para recuperar uma resposta ambígua. A consulta por DPS
  recuperou a mesma autorização. Nenhum recebimento acadêmico foi consumido e
  nenhum título a receber foi criado para a nota de R$ 1,00.
- A homologação permanece com a rejeição E0037 registrada no lote anterior;
  sucesso de produção não foi apresentado como homologação concluída.

## Transporte e validação

- Relay Node privado em Vercel Preview, deployment
  `dpl_BmHaz2Kpdoy3tRHqH8Xd79NDcQRM`, destino SEFIN de produção fixo.
  Repin aplicado em 20261111022939, preservando chave HMAC e proteção da Preview.
- Chave HMAC de produção e proteção da Preview ficam somente nos servidores/Vault;
  A1 e chave privada usados em memória. JWT obrigatório na Edge.
- O usuário autorizou expressamente a chave privada de produção após a revisão
  automática rejeitar a criação inicial fora do escopo anterior de homologação.
- XSD original preservado. Perfil derivado corrige somente os delimitadores
  literais de TSSerieDPS; sete outros recursos permanecem idênticos. XML integral
  e assinatura são verificados; não há bypass de schema, identidade ou ambiente.
- XML pessoal autorizado de referência permaneceu fora do repositório, fixtures,
  logs e RAG. Estimativa municipal de transparência de 3,88% vem da referência;
  não é apresentada como alíquota atual de ISS ou do Simples.

## Cancelamento

Somente a nota desta operação pode ser cancelada. A interface exige motivo e texto
revisados e uma confirmação específica. Resultado ambíguo é conciliado por GET;
o sistema só apresenta CANCELADA após conferir o evento registrado 101101.
Valor incorreto, descrição/serviço e tributação são categorias de erro de emissão
(código oficial 1), distintas de serviço não prestado (2) e outros motivos (9).

Não foi comprovado prazo universal de 24 horas para Japoatã. O Guia Web 1.3,
seção 5.3, delega condições ao município; a interface não inventa uma janela fiscal.
O contrato ao vivo documenta POST /nfse/{chave}/eventos e consulta de evento por
GET /nfse/{chave}/eventos/{tipoEvento}/{numSeqEvento}; não há listagem GET nessa rota.
O primeiro envio pelo fluxo próprio ficou em CANCELLATION_PENDING. A consulta real
retornou HTTP 404 com somente metadados públicos, divergindo do Swagger que marcava
`erro` obrigatório. O parser foi ajustado somente para esse 404; sucesso mantém XML
integral estrito. A ausência atual não foi confundida com prova de zero POST anterior.
Observabilidade Vercel foi inconclusiva. A retomada manual da mesma identidade,
com uma lease adicional auditada, retornou HTTP 201 no POST em 11/11 às 02:20 UTC.
A API exige sequência numérica 1 na rota GET, embora o XML use 001. O retorno real
é eventos[].arquivoXml com duas camadas Base64 e GZip; data de recebimento é ISO
local com milissegundos, sem fuso. Esse metadado não calcula prazo fiscal.
O XML oficial passou XSD/identidade/PRE/ambiente/seq e todos os campos do pedido,
exceto xMotivo: o acento retornou com uma transformação UTF8→Latin1. A correção
está limitada à representação reversível desse texto, mantendo XML/pedido originais;
NFS-e nº 2 confirmada CANCELLED/CONFIRMED às 03:30:49 UTC, com XML oficial
de 8.448 bytes. Evidence registra representação equivalente, sem afirmar igualdade
literal nem alterar os bytes assinados. Demais campos continuam estritos.
A lease adicional foi consumida: qualquer nova ação nessa nota faz somente GET,
sem outro POST, reset ou alteração dos snapshots anteriores.

## Interface, modelos e numeração

- Modelos: Exportar ao lado de Editar abre prévia com todos os dados do pré-modelo,
  unidade, ambiente, versão e proveniência; PDF nativo para conferência contábil.
- Configuração: última NFS-e autorizada pelo sistema e série/última/próxima DPS
  estimada são somente leitura e isoladas por unidade/ambiente. Número de NFS-e
  pertence à SEFIN; o sistema não oferece um contador manual concorrente.
- Emitidas: três linhas por nota, fundos alternados, ações Visualizar/PDF/XML
  explícitas, seleção e ZIP. Filtros de período, origem e tipo de curso dependem
  da projeção canônica no servidor, preservando o mês de referência da operação.
- Descrição acadêmica nova reúne curso da turma exata, matrícula vinculada,
  parcelas estruturadas e meses das datas efetivas de pagamento. Não extrai
  números de texto livre nem usa outro curso do aluno. Serviços mantêm o texto
  literal confirmado, sem inventar vínculo acadêmico.
- Snapshot/modelo de nota transmitida é imutável. Preparações acadêmicas antigas
  sem contexto estruturado precisam ser retiradas logicamente e refeitas antes
  de transmissão; recibos de operação já transmitida não são liberados novamente.

## Verificações e estado remoto

- DANFSe nº 2 aberto no visualizador e baixado: PDF nativo A4, uma página, 82.706 bytes.
- XML autorizado baixado: 10.594 bytes; SHA256
  `92c6a2f5342b5240c4e562cc767345b1e3e8a361c533049cd9d22ccd69c6a305`.
- ZIPs reais de PDF e XML baixados na sessão autenticada e íntegros. XML interno
  idêntico ao original. A nota única real não foi duplicada para fabricar um lote.
- Testes de múltiplos documentos, sequenciamento e recuperação usam fixtures
  sintéticas. Testes locais de descrição acadêmica: 9; regressão da fila: 10.
- Quatro migrations de descrição aplicadas via MCP: 20261111013732, 20261111013738,
  20261111013745 e 20261111013752. Fontes renomeadas sem alterar bytes.
- Migrations de emissão: 20261111001711..20261111001723; ponte normal:
  20261111004615..20261111004631; numeração: 20261111010414.
- Filtros aplicados em 20261111014607, renovação de prévia em 20261111014713 e
  catálogo de cancelamento em 20261111015424, todos via MCP, com ACL/RLS conferidos.
- Numeração de produção conferida: última NFS-e 2, série DPS 49998, última DPS 2,
  próxima estimada 3; homologação isolada sem última autorização comprovada.
- Exportação real do modelo v5 baixada (320.990 bytes, nove páginas); CST 200,
  classificação 200028 e percentual do Simples 12 conferidos no texto e render.
  Exportação v3 também conferida em PDF A4 de nove páginas; uma quebra
  de linha comum foi ajustada para manter o registro junto na página, sem raster.
- Versão 4.8.287/revisão 296, data 11/11; preserva a publicação paralela EAD
  4.8.286. Artefatos CI/Preview e publicação ficam vinculados ao PR 379.
- Build final Node 24.22.1 aprovado: 4.770 módulos, 26 páginas sociais geradas.
  Reader de produção e contratos focados: 76 testes Deno aprovados.

## Segundo teste autorizado

- NFS-e nº 3 de R$ 1,00 autorizada por POST único e recuperada por GET da mesma DPS,
  sem reenvio. Operação usa o modelo v5: 080201, NBS 122020000, CST 200/200028.
- XML autorizado baixado: 10.604 bytes, SHA256
  `e22ff6f1be4284ae052a589c6ad4d7a81fd1a7322e20b79506b32151b370621d`.
- XML confirma pTotTribSN 12.00, três reduções de IBS/CBS 60.00, CBS efetiva 0.36
  e IBS estadual efetivo 0.04, calculados pelo autorizador. Nenhuma taxa foi
  recalculada ou inserida como alíquota manual na DPS.
- PDF nativo de 82.657 bytes e XML baixados na sessão autenticada; visualizador
  confirmou nota, valor e classificação. O primeiro PDF omitia o percentual SN na
  nota de transparência, apesar do XML correto. Compositor corrigido e renderizado
  com 12,00%, uma página, sem alteração do XML; novo download UI em fechamento.
- Competência e prestação em 11/11/2026, no fuso brasileiro. A correção aplicada
  em 20261111030145 resolve ISSUE_DATE/FIXED_DATE pelo snapshot do pré-modelo no
  servidor e congela a data da criação; replay não deriva outra competência.
- Preparação anterior de 10/11 permaneceu sem operação fiscal: a virada do dia
  não foi contornada alterando seu conteúdo, data ou criando cobrança financeira.
- Cancelamento da nº 3 confirmado CANCELLED/CONFIRMED às 03:34:58 UTC, evento
  oficial de 8.584 bytes. Modelo formal Erro no valor do serviço v1, justificativa
  factual resolvida no servidor. Um POST original; nenhuma lease extra/reenvio.
  O GET inicial retornou 404 durante propagação; a consulta posterior confirmou
  o evento com a mesma correção delimitada de representação em xMotivo.

## Atualização fiscal, Realtime e proteção A1

- Modelo corrente de produção v4 passou a informar percentual aproximado do Simples
  de 12%, em campo próprio de transparência; não é alíquota manual de ISS/IBS/CBS.
- O usuário escolheu manter IBS/CBS e testar a classificação de ensino técnico.
  Modelo corrente v5: CST 200, cClassTrib 200028 e NBS 122020000, mantendo 12%.
  Adapter e XSD passaram offline. A nota nº 2 continua com seu snapshot v3 original.
  O novo perfil é teste solicitado para conferência contábil; NFS-e nº 3 foi
  autorizada em 11/11 às 00:11:20, R$ 1,00. Não implica aprovação contábil definitiva.
- As alíquotas e reduções de IBS/CBS são lidas da resposta oficial. O leitor preserva
  as três reduções de saída sem recalcular ou inserir taxas na DPS.
- Realtime aplicado em 20261111023828: eventos mínimos por unidade/ambiente/recurso
  para modelos, configuração, A1, modelos de cancelamento e serviços. RLS restringe
  leitura ao contexto autorizado; anon sem leitura e cliente sem escrita. Eventos
  não contêm participantes, valores, XML, identificadores Vault ou credenciais.
- TanStack Query unifica invalidação de listas, workspace, fila, serviços e numeração.
  Reconexão/foco recuperam a projeção; não há polling de 60 segundos nem transmissão
  fiscal automática por evento. Evento real de serviço foi publicado no escopo correto após salvamento autenticado;
  contratos de assinatura/invalidação aprovados. Assinatura, reconexão, isolamento e cleanup cobertos pelos contratos focados.
- Segurança aplicada em 20261111023830: cada novo upload A1 cria versão Vault
  independente; replays autorizados não criam outra versão. Material existente não
  foi lido, alterado ou removido. Corrige sobrescrita futura entre ambientes.
- Senha PKCS#12 usada somente na inspeção do upload, sem persistência em banco/cache.
  Material privado é recuperado por canal backend restrito, usado em memória e não
  publicado em Storage. Fronteiras e limites no parecer de segurança abaixo.
- Auditoria e revisão independente: ACL/Vault, 12 verificações SQL do writer,
  7 Realtime, contratos Node/Edge, sem alegar revogação OCSP comprovada ou limpeza
  absoluta de memória JavaScript. Nenhum segredo foi incluído no repositório.
- Interface: filtros em uma linha desktop, menu vertical com Consultar/Cancelar
  separados, edição parcial de datas preservada e erros transitórios recuperáveis.
- Filiais: documentação reconhece vínculo de mesma raiz CNPJ ou procuração RFB
  específica, sujeito às permissões e CNC de cada estabelecimento. Nenhum outro
  polo foi configurado ou teve emissão neste lote.

Fontes: [Documentação de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual),
[representação e perfis](https://www.gov.br/nfse/pt-br/noticias/nova-funcionalidade-possibilita-representacao-e-alternancia-de-perfis-na-nfs-e)
e [auditoria A1](../../../../docs/contracts/nfse-a1-security-audit.md).

## Manifesto explícito

Total: 225 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/limite-linhas-retired-paths.json`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-homologacao-emissao.md`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-producao-individual-cancelamento.md`
- `api/nfse-production-relay.js`
- `docs/contracts/nfse-a1-security-audit.md`
- `docs/contracts/nfse-academic-description.md`
- `internal/integracoes/nfse-production-relay/contract.js`
- `internal/integracoes/nfse-production-relay/handler.js`
- `internal/integracoes/nfse-production-relay/relay.test.mjs`
- `internal/integracoes/nfse-production-relay/transport.js`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCertificateModal.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseNumberingPanel.interaction.test.mjs`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseNumberingPanel.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/hooks/useNfseNumbering.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/services/nfse-numbering.contract.test.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/services/nfse-numbering.contract.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/services/nfse-numbering.service.ts`
- `modules/gestor/emissor-nfse/cancelamento/nfse-cancellation-models.contract.test.ts`
- `modules/gestor/emissor-nfse/cancelamento/nfse-cancellation-models.contract.ts`
- `modules/gestor/emissor-nfse/cancelamento/nfse-cancellation-models.css`
- `modules/gestor/emissor-nfse/cancelamento/nfse-cancellation-models.queries.ts`
- `modules/gestor/emissor-nfse/cancelamento/nfse-cancellation-models.service.ts`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationModelEditor.tsx`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationModels.interaction.test.mjs`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationModelsSection.tsx`
- `modules/gestor/emissor-nfse/cancelamento/NfseCancellationTemplatePicker.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-batch.core.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-fiscal-notice.test.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-fiscal-notice.ts`
- `modules/gestor/emissor-nfse/emissao/nfse-operation.contract.ts`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseBatchEmissionModal.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseCancellationReadOnlyResult.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseCancellationRetry.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationAction.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationMenu.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseSourceEmissionModal.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `modules/gestor/emissor-nfse/emitidas/NfseDocumentActions.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedFilters.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedList.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedRows.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewDetails.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/useNfseFiscalReview.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.contract.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.presentation.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.realtime.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.types.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueueRealtime.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.contract.test.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.contract.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.public-details.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.service-core.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.types.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseRealtime.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual-preparation.contract.test.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual-preparation.service.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.attempt.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.test.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.contract.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.css`
- `modules/gestor/emissor-nfse/individual/nfse-individual.service-core.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.service.ts`
- `modules/gestor/emissor-nfse/individual/nfse-individual.types.ts`
- `modules/gestor/emissor-nfse/individual/NfseIndividualCancellation.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualSnapshot.test.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualSnapshot.tsx`
- `modules/gestor/emissor-nfse/modelos/additional/nfse-preset-review.presentation.ts`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.css`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.fixture.ts`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.pdf.ts`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.projection.ts`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.rows.ts`
- `modules/gestor/emissor-nfse/modelos/exportacao/nfse-model-export.test.mjs`
- `modules/gestor/emissor-nfse/modelos/exportacao/NfseModelExportModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModelIssuerMetadata.ts`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModels.ts`
- `modules/gestor/emissor-nfse/modelos/ModelosNfseTab.tsx`
- `modules/gestor/emissor-nfse/modelos/nfse-description-variables.ts`
- `modules/gestor/emissor-nfse/modelos/NfseDescriptionPreview.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseEmissionModelsSection.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.interaction.test.mjs`
- `modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelExportModal.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelTransparencyValues.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelValuesFields.tsx`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServices.ts`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfseServicePartnerSearch.ts`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/realtime/useNfsePartnerServicesRealtime.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.service-core.ts`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/parceiros/types/nfse-partner-services.types.ts`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/realtime/useNfseReceiptRealtime.ts`
- `modules/gestor/emissor-nfse/queries/nfse-cache.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-realtime.test.ts`
- `modules/gestor/emissor-nfse/realtime/nfse-subscription.ts`
- `modules/gestor/emissor-nfse/realtime/nfse.realtime.ts`
- `modules/gestor/emissor-nfse/services/configuration/useNfseConfigurationMetadata.ts`
- `modules/gestor/emissor-nfse/services/nfse-document-filters.ts`
- `modules/gestor/emissor-nfse/services/nfse-documents.contract.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/services/nfse.runtime.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/danfse.presentation.ts`
- `scripts/check-file-line-limits.mjs`
- `scripts/check-file-line-limits.test.mjs`
- `supabase/functions/_shared/nfse-national/dps.ts`
- `supabase/functions/_shared/nfse-national/dps.types.ts`
- `supabase/functions/_shared/nfse-national/homologation-schema.ts`
- `supabase/functions/_shared/nfse-national/ibscbs-classifications.generated.ts`
- `supabase/functions/_shared/nfse-national/pilot-response.ts`
- `supabase/functions/_shared/nfse-national/production-cancellation.ts`
- `supabase/functions/_shared/nfse-national/production-diagnostics.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-archive.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-archive.ts`
- `supabase/functions/_shared/nfse-national/production-event-detail.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-representation.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-representation.ts`
- `supabase/functions/_shared/nfse-national/production-event-response.ts`
- `supabase/functions/_shared/nfse-national/production-live-contract.test.ts`
- `supabase/functions/_shared/nfse-national/production-live-contract.ts`
- `supabase/functions/_shared/nfse-national/production-optional-json-id.test.ts`
- `supabase/functions/_shared/nfse-national/production-reference-evidence.ts`
- `supabase/functions/_shared/nfse-national/production-reference-verification.ts`
- `supabase/functions/_shared/nfse-national/production-relay.test.ts`
- `supabase/functions/_shared/nfse-national/production-relay.ts`
- `supabase/functions/_shared/nfse-national/production-schema.ts`
- `supabase/functions/_shared/nfse-national/production-series-compatibility.ts`
- `supabase/functions/_shared/nfse-national/production.test-fixtures.ts`
- `supabase/functions/_shared/nfse-national/production.test.ts`
- `supabase/functions/_shared/nfse-national/production.ts`
- `supabase/functions/_shared/nfse-national/production.types.ts`
- `supabase/functions/_shared/nfse-national/schema-runtime.ts`
- `supabase/functions/_shared/nfse-national/schemas/production.generated.ts`
- `supabase/functions/nfse-national-individual/adapter-ibscbs.test.ts`
- `supabase/functions/nfse-national-individual/adapter-ibscbs.ts`
- `supabase/functions/nfse-national-individual/adapter.fixture.ts`
- `supabase/functions/nfse-national-individual/adapter.test.ts`
- `supabase/functions/nfse-national-individual/adapter.ts`
- `supabase/functions/nfse-national-individual/cancellation-retry.ts`
- `supabase/functions/nfse-national-individual/cancellation-review.test.ts`
- `supabase/functions/nfse-national-individual/cancellation-review.ts`
- `supabase/functions/nfse-national-individual/contract.ts`
- `supabase/functions/nfse-national-individual/deno.json`
- `supabase/functions/nfse-national-individual/deno.lock`
- `supabase/functions/nfse-national-individual/handler.test.ts`
- `supabase/functions/nfse-national-individual/handler.ts`
- `supabase/functions/nfse-national-individual/index.ts`
- `supabase/functions/nfse-national-individual/queue-bridge.test.ts`
- `supabase/functions/nfse-national-individual/queue-bridge.ts`
- `supabase/functions/nfse-national-individual/runtime.test.ts`
- `supabase/functions/nfse-national-individual/runtime.ts`
- `supabase/functions/nfse-national-pilot/contract.test.ts`
- `supabase/functions/nfse-national-pilot/contract.ts`
- `supabase/functions/nfse-national-pilot/index.ts`
- `supabase/functions/nfse-national-pilot/scenario.test.ts`
- `supabase/functions/nfse-national-pilot/scenario.ts`
- `supabase/migrations/20261110235303_nfse_homologation_recipient.sql`
- `supabase/migrations/20261110235311_nfse_homologation_partner_preview.sql`
- `supabase/migrations/20261111001711_nfse_production_material.sql`
- `supabase/migrations/20261111001714_nfse_production_preparation.sql`
- `supabase/migrations/20261111001716_nfse_production_relay_config.sql`
- `supabase/migrations/20261111001718_nfse_individual_store.sql`
- `supabase/migrations/20261111001720_nfse_individual_operations.sql`
- `supabase/migrations/20261111001723_nfse_individual_cancellation.sql`
- `supabase/migrations/20261111004615_nfse_queue_operation_basis.sql`
- `supabase/migrations/20261111004617_nfse_operation_core_amounts.sql`
- `supabase/migrations/20261111004620_nfse_queue_preview.sql`
- `supabase/migrations/20261111004622_nfse_queue_operation_bridge.sql`
- `supabase/migrations/20261111004624_nfse_operation_read_models.sql`
- `supabase/migrations/20261111004626_nfse_queue_workspace_reads.sql`
- `supabase/migrations/20261111004628_nfse_service_student_save.sql`
- `supabase/migrations/20261111004631_nfse_service_partner_search.sql`
- `supabase/migrations/20261111010414_nfse_numbering_metadata.sql`
- `supabase/migrations/20261111013732_nfse_academic_description_render.sql`
- `supabase/migrations/20261111013738_nfse_academic_description_context.sql`
- `supabase/migrations/20261111013745_nfse_academic_description_prepare.sql`
- `supabase/migrations/20261111013752_nfse_academic_description_reads.sql`
- `supabase/migrations/20261111014607_nfse_issued_document_filters.sql`
- `supabase/migrations/20261111014713_nfse_cancel_preview_renewal.sql`
- `supabase/migrations/20261111015424_nfse_cancellation_models.sql`
- `supabase/migrations/20261111021203_nfse_cancel_model_review.sql`
- `supabase/migrations/20261111021211_nfse_cancel_manual_retry.sql`
- `supabase/migrations/20261111022939_nfse_production_relay_numeric_event_url.sql`
- `supabase/migrations/20261111023828_nfse_resource_realtime.sql`
- `supabase/migrations/20261111023830_nfse_certificate_immutable_vault_versions.sql`
- `supabase/migrations/20261111030145_nfse_service_competence_rule.sql`
- `supabase/tests/nfse_academic_description.isolated.test.mjs`
- `supabase/tests/nfse_cancel_model_retry.isolated.test.mjs`
- `supabase/tests/nfse_cancellation_models.isolated.test.mjs`
- `supabase/tests/nfse_certificate_versions.isolated.test.mjs`
- `supabase/tests/nfse_homologation_partner.fixture.sql`
- `supabase/tests/nfse_homologation_partner.isolated.test.mjs`
- `supabase/tests/nfse_individual_production.fixture.sql`
- `supabase/tests/nfse_individual_production.isolated.test.mjs`
- `supabase/tests/nfse_issued_document_filters.isolated.test.mjs`
- `supabase/tests/nfse_numbering_metadata.isolated.test.mjs`
- `supabase/tests/nfse_production_relay_rotation.isolated.test.mjs`
- `supabase/tests/nfse_queue_emission.fixture.sql`
- `supabase/tests/nfse_queue_emission.isolated.test.mjs`
- `supabase/tests/nfse_resource_realtime.isolated.test.mjs`
- `supabase/tests/nfse_service_competence.isolated.test.mjs`

## Exclusões explícitas

- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPanel.interaction.test.mjs`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPanel.tsx`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPreview.tsx`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPublicDetails.tsx`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationRecipientPicker.tsx`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.css`
- `modules/gestor/emissor-nfse/individual/NfseIndividualFields.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualModelReview.interaction.test.mjs`
- `modules/gestor/emissor-nfse/individual/NfseIndividualPanel.interaction.test.mjs`
- `modules/gestor/emissor-nfse/individual/NfseIndividualPanel.tsx`
- `modules/gestor/emissor-nfse/individual/NfseIndividualPreparation.tsx`
- `supabase/functions/_shared/nfse-national/production-event-contract-diagnostics.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-contract-diagnostics.ts`
- `supabase/functions/_shared/nfse-national/production-event-diagnostics.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-diagnostics.ts`
- `supabase/functions/_shared/nfse-national/production-event-envelope-diagnostics.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-envelope-diagnostics.ts`
- `supabase/functions/_shared/nfse-national/production-event-semantic-diff.test.ts`
- `supabase/functions/_shared/nfse-national/production-event-semantic-diff.ts`
