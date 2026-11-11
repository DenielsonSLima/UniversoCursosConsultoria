# NFS-e — piloto de homologação e prontidão

## Objetivo e aceite

Pedido de 10/11/2026: atualizar o local, reunir três agentes, resolver os bloqueios
e testar emissão em homologação, preparando os requisitos de produção.
Confirmado pelo usuário: matriz com tomador sintético; nas notas reais, aluno como
tomador. A confirmação inicial de não optante foi corrigida pelo usuário: matriz
optante pelo Simples Nacional, não MEI (opSimpNac=3), IM 260-2, CNAE 8541400 e serviço 080201. Produção fiscal depende do
aceite específico depois da homologação; não houve autorização para emitir nota real.

Aceite técnico: diagnóstico A1 por mTLS sem expor segredo; teste individual de
homologação com revisão explícita, identidade DPS durável, retorno autorizado com
XML/chave coerentes e recuperação por consulta da mesma DPS. Recebimentos reais
e fila financeira não são consumidos pelo piloto.

## Base e reprodução

- Main remoto `d796188b0b50113f790dc45dbf9e6f24a8d22d8f`, versão 4.8.283.
- Local tinha composição até 4.8.278 e fontes anteriores de outros lotes. Via MCP
  GitHub foram sincronizados 396 arquivos divergentes/ausentes. Cópias anteriores
  preservadas em `/private/tmp/universo-nfse-20261110/before-sync`; manifesto de
  sincronização temporário no mesmo diretório. Nenhuma exclusão local realizada.
- Safari autenticado confirmou certificado cadastrado até 29/09/2027 17:03 Brasília
  e situação aguardando habilitação. Supabase confirmado pelo owning source e MCP.
- Certificado/configuração apenas HOMOLOGACAO matriz. Não há configuração produção.
- Botão de emissão desabilitado literalmente; dispatch/reconcile inexistentes;
  configuração e fila mantêm bloqueio explícito. Cadastro A1 não habilita emissão.

## Reunião e etapas

1. Integração: contrato oficial por ambiente, XSD, assinatura, envelope, retorno.
2. Credencial: Vault somente no executor, autorização revalidada, preflight mTLS.
3. Interface: painel piloto sem recebimentos, revisão, resultado e consulta.
4. Coordenação: ledger isolado, idempotência, validação integrada e critérios produção.

## Revisão das preparações reais

Pendentes ganhou a ação Revisar por documento. A revisão mostra o aluno, os
recebimentos canônicos e o modelo histórico preservado, permite escolher um modelo
ativo 080201 e exige confirmar o aluno como tomador, a classificação, os recebimentos
e as duas datas fiscais. Competência e prestação não são derivadas do mês pago.

As RPCs de revisão mantêm revisões próprias, versão esperada, base canônica e
requestId para replay. O navegador não envia valores financeiros, CNPJ emitente
ou cadastro arbitrário do tomador. A gravação relê o estado do servidor; revisão
fiscal salva e dependências da transmissão têm apresentação distinta. O contrato
mantém `canTransmit:false`: confirmar campos ou salvar não habilita Emitir notas.
As migrations foram aplicadas via MCP Supabase como `20261110190702` e
`20261110190706`, com os nomes locais e o teste ajustados ao ledger remoto.
O smoke Safari autenticado de consulta e seleção foi concluído com os componentes
e serviços reais, conforme detalhado abaixo. A gravação autenticada não foi
exercida; nenhuma data fiscal real foi presumida para preencher ou salvar a revisão.

## Referência institucional e modelo atualizado

A coordenação leu e renderizou `AgNFS-e.pdf`, uma NFS-e municipal Ágape da
Universo emitida em 24/02/2026. A referência confirma os campos institucionais
serviço 080201, descrição `PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS`, CNAE 8541400,
IM 260-2 e enquadramento no Simples Nacional. Dados pessoais do tomador não são
copiados para este registro, modelos ou fixtures.

O modelo foi atualizado pelo serviço autenticado e confirmado via MCP como
versão 2, nome `Curso técnico — serviços educacionais (080201)` e descrição literal
`PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS`. Valores, alíquotas, tributos e a data histórica
do exemplo não viraram constantes do modelo. O aluno é resolvido pelo cadastro e
as datas fiscais continuam exigindo confirmação na revisão do documento atual.
A configuração v3 com `regApTribSN=1` permanece a escolha já confirmada pelo usuário.

## Estado operacional confirmado pela coordenação

- A credencial privada da proteção da Preview foi criada no escopo autorizado;
  relay Node e configuração no Vault estão prontos. Nenhum valor de segredo é
  incluído neste registro ou no manifesto.
- Em 10/11/2026 às 19:05 UTC (16:05 em Brasília), o preflight da SEFIN de
  homologação retornou HTTP200 com TLS verificado e `pilot.available:true`.
  Isso confirma o canal consultado e a disponibilidade do teste, sem comprovar
  autorização de DPS ou emissão de NFS-e.
- Executor piloto Edge v1 implantado. A configuração fiscal v3 foi salva pelo
  serviço autenticado após confirmação expressa do usuário: `regApTribSN=1`,
  recolhimento pelo Simples Nacional, serviço em Japoatã e ausência de retenções,
  descontos e deduções no cenário confirmado.
- O piloto foi transmitido uma única vez à SEFIN de HOMOLOGACAO. O ledger terminou
  em `REJECTED`, com código `E0037`, e a interface exibiu a rejeição. Não houve
  autorização de NFS-e, geração de chave autorizada ou consumo de recebimentos reais.
- A entrega concorrente 4.8.284 deve ser preservada no fechamento; a base 4.8.283
  acima identifica somente a abertura deste lote.
- Após expirações repetidas durante a tentativa de smoke final, o acesso Safari
  foi recuperado. O painel real do piloto foi montado em aba local isolada, com
  escopo real e autenticação existente. O artefato temporário de diagnóstico fica
  fora do manifesto; os imports versionados dos painéis locais já carregam.
  A interface comprovou o caminho de envio e rejeição do piloto. O modal real
  também teve consulta e seleção autenticadas conferidas; gravação da revisão e
  autorização de NFS-e não foram exercidas.
  Nenhuma nota foi autorizada, e produção fiscal continua sem aceite de emissão.

## Smoke autenticado de consulta e seleção

A coordenação concluiu no Safari o smoke em aba local isolada usando os
componentes e serviços reais, com escopo institucional e autenticação existentes:

- A RPC da fila retornou 18 preparações, preservadas durante a conferência.
- Abertura do modal do primeiro pendente mostrou dados canônicos do aluno e do
  estabelecimento, inclusive regime Simples Nacional e inscrição municipal.
- O seletor próprio permitiu escolher o modelo 080201 versão 2. A nova consulta
  RPC mostrou a descrição literal `PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS` e a
  NBS `122020000`.
- Competência e data da prestação continuaram vazias; confirmações permaneceram
  desmarcadas. A revisão não foi salva e os recebimentos não foram alterados.

Esse smoke valida consulta e seleção autenticadas. A gravação autenticada da
revisão e a autorização fiscal continuam sem prova por esse procedimento.
Dados pessoais exibidos no modal não são reproduzidos neste registro.

Em outra janela, o Portal Nacional de produção estava autenticado para a Universo
e listou 15 NFS-e de outubro. Foi apenas consulta: não houve download de XML nem
emissão de produção. Esse acesso ao histórico no portal não comprova prontidão da
API de emissão nem elimina a rejeição E0037 observada em homologação.

## Rejeição E0037 em homologação

O [FAQ oficial v1.3, seção 21.4, página 119](https://www.gov.br/nfse/pt-br/perguntas-frequentes/perguntas-frequentes-nfs-e-v1-3-20261106.pdf#page=119)
associa E0037 ao município emissor ausente do cadastro de convênio municipal.
A evidência desta tentativa está restrita à HOMOLOGACAO: não estabelece a situação
do convênio de Japoatã em produção e não autoriza trocar ambiente para contornar o erro.

O painel conserva o código e a mensagem do retorno e acrescenta uma explicação
curta sobre a conferência do convênio nesse ambiente. Estado `REJECTED`, identidade
da tentativa e ausência de reenvio automático permanecem preservados. Não foi
executada uma segunda transmissão durante esse ajuste de apresentação.
Validação focada do ajuste: oito contratos, smoke DOM com leitura de rejeição
E0037 e ausência de reenvio automático, TypeScript e ESLint aprovados. O executor
não foi alterado por esse ajuste; o código e a mensagem originais são preservados.

## Candidata de Preview e correção do controle de versão

O [PR rascunho #379](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/379)
foi aberto com o commit inicial `9415cfa82c3d12e69fba65e76bdaf4aebba4649c`.
A [Preview inicial do frontend](https://universo-cursos-consultoria-howve5qup-denielson-limas-projects.vercel.app)
ficou READY, sem promoção a produção.

O [job de controle de versão](https://github.com/DenielsonSLima/UniversoCursosConsultoria/actions/runs/42884824284/job/130070243137)
reprovou legitimamente: houve alteração de produto sem atualizar os dois arquivos
de versão, sem avanço sobre 4.8.284 e com a entrada atual já existente na base.
Logs e versão de main foram conferidos via MCP GitHub antes do patch; o workflow
e o validador foram preservados.

Main mantém a entrega paralela 4.8.284, revisão 293, no commit
`d7567fdd798e796eeb638b9248d22075ea2979ca`. A candidata local deste lote passa a
4.8.285, revisão 294, com entrada própria de changelog e histórico anterior intacto.
Essa preparação destina-se ao PR e à Preview; não representa publicação ou aceite
de emissão fiscal em produção. A coordenação recomporá o único commit via MCP e
validará novamente a automação remota.

`npm run check:version` aprovou a candidata local; o changelog anterior de main
4.8.284 foi comparado via MCP e preservado byte a byte, com apenas a nova entrada
4.8.285 acrescentada. O manifesto passou no teto de linhas, com 84 arquivos.

A CI também identificou 83 trechos no RAG, acima do limite existente de 80.
A mesma falha foi reproduzida localmente em `test-agent-operation`. Somente o
resumo de `LOTE_ATIVO.md` foi compactado; as evidências extensas continuam neste
registro, fora do corpus. Limites, validador, políticas e governança não mudaram.
Uma reindexação adicional foi autorizada especificamente para corrigir essa falha
nova, seguida da validação operacional focada.
Resultado: 15 fontes e 79 trechos; `node scripts/test-agent-operation.mjs` passou,
incluindo a checagem do teto de linhas e a prova de que a busca não altera o índice.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-homologacao-emissao.md`
- `api/nfse-homologation-relay.js`
- `docs/contracts/nfse-homologation-readiness.md`
- `internal/integracoes/nfse-relay/README.md`
- `internal/integracoes/nfse-relay/auth.js`
- `internal/integracoes/nfse-relay/contract.js`
- `internal/integracoes/nfse-relay/handler.js`
- `internal/integracoes/nfse-relay/relay.test.mjs`
- `internal/integracoes/nfse-relay/renegotiation.test.mjs`
- `internal/integracoes/nfse-relay/transport.js`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewDetails.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.interaction.test.mjs`
- `modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.tsx`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.contract.test.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.contract.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.css`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.fixture.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.service-core.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.service.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/nfse-fiscal-review.types.ts`
- `modules/gestor/emissor-nfse/fila/fiscal-review/useNfseFiscalReview.ts`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPanel.interaction.test.mjs`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPanel.tsx`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPreview.tsx`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.attempt.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.contract.test.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.contract.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.css`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.service-core.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.service.ts`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.types.ts`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `supabase/functions/_shared/nfse-national/README.md`
- `supabase/functions/_shared/nfse-national/deno.lock`
- `supabase/functions/_shared/nfse-national/dps.ts`
- `supabase/functions/_shared/nfse-national/dps.types.ts`
- `supabase/functions/_shared/nfse-national/homologation-live-contract.test.ts`
- `supabase/functions/_shared/nfse-national/homologation-live-contract.ts`
- `supabase/functions/_shared/nfse-national/homologation-schema.ts`
- `supabase/functions/_shared/nfse-national/pilot-codec.ts`
- `supabase/functions/_shared/nfse-national/pilot-fixtures.ts`
- `supabase/functions/_shared/nfse-national/pilot-response.ts`
- `supabase/functions/_shared/nfse-national/pilot.test.ts`
- `supabase/functions/_shared/nfse-national/pilot.ts`
- `supabase/functions/_shared/nfse-national/pilot.types.ts`
- `supabase/functions/_shared/nfse-national/relay.test.ts`
- `supabase/functions/_shared/nfse-national/relay.ts`
- `supabase/functions/_shared/nfse-national/schemas/generate-homologation-bundle.mjs`
- `supabase/functions/_shared/nfse-national/schemas/homologation.generated.ts`
- `supabase/functions/nfse-national-pilot/contract.ts`
- `supabase/functions/nfse-national-pilot/deno.json`
- `supabase/functions/nfse-national-pilot/deno.lock`
- `supabase/functions/nfse-national-pilot/handler.test.ts`
- `supabase/functions/nfse-national-pilot/handler.ts`
- `supabase/functions/nfse-national-pilot/index.ts`
- `supabase/functions/nfse-national-pilot/scenario.ts`
- `supabase/functions/nfse-national-pilot/transport.ts`
- `supabase/functions/nfse-national-preflight/deno.json`
- `supabase/functions/nfse-national-preflight/deno.lock`
- `supabase/functions/nfse-national-preflight/handler.ts`
- `supabase/functions/nfse-national-preflight/index.ts`
- `supabase/functions/nfse-national-preflight/preflight.test.ts`
- `supabase/functions/nfse-national-preflight/probe.ts`
- `supabase/functions/nfse-national-preflight/public-contract.ts`
- `supabase/functions/nfse-national-preflight/relay-transport.ts`
- `supabase/functions/nfse-national-preflight/routes.test.ts`
- `supabase/functions/nfse-national-preflight/transport-mtls.test.ts`
- `supabase/functions/nfse-national-preflight/transport.ts`
- `supabase/functions/nfse-national-preflight/types.ts`
- `supabase/migrations/20261110182740_nfse_homologation_preflight_material.sql`
- `supabase/migrations/20261110183131_nfse_homologation_pilot_ledger.sql`
- `supabase/migrations/20261110185118_nfse_homologation_relay_config.sql`
- `supabase/migrations/20261110190702_nfse_fiscal_review_store.sql`
- `supabase/migrations/20261110190706_nfse_fiscal_review_rpc.sql`
- `supabase/tests/nfse_fiscal_review.isolated.test.mjs`
- `supabase/tests/nfse_homologation_pilot.isolated.test.mjs`
- `supabase/tests/nfse_homologation_preflight.isolated.test.mjs`
- `supabase/tests/nfse_homologation_relay.isolated.test.mjs`

- `modules/gestor/emissor-nfse/homologacao/NfseHomologationPublicDetails.tsx`
- `modules/gestor/emissor-nfse/homologacao/NfseHomologationRecipientPicker.tsx`
- `modules/gestor/emissor-nfse/homologacao/nfse-homologation.public-details.ts`
- `supabase/functions/nfse-national-pilot/contract.test.ts`
- `supabase/functions/nfse-national-pilot/scenario.test.ts`
- `supabase/migrations/20261110235303_nfse_homologation_recipient.sql`
- `supabase/migrations/20261110235311_nfse_homologation_partner_preview.sql`
- `supabase/tests/nfse_homologation_partner.fixture.sql`
- `supabase/tests/nfse_homologation_partner.isolated.test.mjs`

Total: 93 arquivos.

## Validação e limites

Validação local da revisão fiscal: quatro contratos, smoke DOM do modal e smoke
anterior da fila passaram, assim como TypeScript, ESLint e compilação focados.
O smoke do modal exerce o seletor próprio 080201, datas inicialmente vazias,
confirmações, clique duplo, replay após resposta perdida e retorno canônico salvo;
a emissão permanece indisponível. O workflow `nfse-regressions.yml` executa esse
smoke com jsdom isolado e dados sintéticos, sem credenciais nem rede fiscal.
O comando do novo passo de CI passou localmente. O manifesto contém 84 caminhos
únicos, todos presentes, e `npm run check:file-lines` passou após essa atualização.
Na rodada final comunicada pela coordenação, `test-nfse-local-stage1` passou com
139 testes e zero falhas; a revisão SQL isolada passou em 10 verificações após o
ajuste dos nomes das migrations. O build final incluindo a revisão também foi
aprovado com Node 24.22.1. Esses resultados não substituem os smokes autenticados
de gravação da revisão e de autorização de NFS-e, ainda não exercidos. O smoke
autenticado de consulta e seleção da revisão está confirmado na seção própria.

```sh
NFSE_TEST_JSDOM_MODULE=/caminho/jsdom/lib/api.js node --test modules/gestor/emissor-nfse/fila/fiscal-review/NfseFiscalReviewModal.interaction.test.mjs
```

O relay passou cinco contratos locais e uma prova HTTPS com certificados
sintéticos: o cliente Node apresenta o certificado após o request e a renegociação
TLS 1.2, com validação dos dois lados ativa. A prova local foi complementada pelo
preflight remoto HTTP200 descrito acima; conexão verificada e disponibilidade do
piloto não comprovam uma DPS autorizada. O envio real de teste retornou a rejeição
E0037 descrita acima; nenhuma NFS-e autorizada ou produção pronta é declarada.

IBS/CBS, enquadramento e parâmetros fiscais completos, habilitação por CNPJ e prova
de homologação continuam como pré-requisitos próprios de produção. As datas fiscais
de recebimentos reais precisam de confirmação; não foram presumidas pelo frontend.

No CI do rascunho, os três jobs NFS-e passaram. A validação geral apontou
referências globais não reconhecidas pelo lint e escapes desnecessários nas
expressões regulares novas. Foram usados imports explícitos/`globalThis` e um
loop equivalente para os controles XML C0, preservando TAB, LF e CR e rejeitando
os outros 29 controles. Tipos dos dois entrypoints com lock congelado, dez testes
do handler, dez de preflight/rotas e nove do motor/relay passaram após o ajuste.
Preflight v6 e piloto v2 foram então publicados por MCP para alinhar o runtime
ao código revisado, com JWT ativo. O teste fiscal documentado ocorreu nas versões
anteriores v5/v1; não houve nova transmissão para repetir a rejeição E0037.
ESLint final dos 63 arquivos JS/TS do manifesto passou sem erros ou avisos,
incluindo os testes `.mjs`. Os quatro testes ajustados somaram 14 resultados
aprovados, cobrindo contratos do relay, TLS sintético, modal DOM e ledger PGlite.

## Retomada autorizada: tomador do cadastro

Após a revisão dos pré-modelos, o usuário reiterou a emissão em homologação e
indicou seu cadastro pessoal como tomador. A implementação passa a aceitar somente
o identificador do parceiro no comando de revisão; documento e nome são relidos e
validados no backend, preservados no snapshot da DPS e nunca recebidos livremente
do navegador. O cenário técnico continua isolado, sem recebimentos reais.

Novo preflight autenticado no Safari confirmou A1, TLS e contrato público SEFIN;
a parametrização municipal permaneceu não comprovada. A consulta anterior usava
01/11; a retomada passa a conferir a competência atual do teste e o serviço080201.
Os retornos municipais públicos serão exibidos separadamente da disponibilidade
do experimento técnico. Alterar o tomador não dispensa a regra municipal E0037.

O [Guia do Painel Municipal1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-do-painel-administrativo-municipal-nfs-e-v1-2-out2025.pdf),
páginas13 e17, atribui cadastro inicial ao Gestor Nacional e parametrização/ativação
ao gestor municipal, com configuração de testes e produção conferida separadamente.
O certificado do contribuinte não concede esse perfil. O [canal oficial](https://www.gov.br/nfse/pt-br/canais-de-atendimento),
atualizado em10/11, orienta procurar a prefeitura; o antigo email federal foi desativado.
Nenhuma mensagem externa ou alteração de convênio foi realizada.

### Resultado da retomada

- 14 verificações SQL,12 Edge,10 contratos frontend e smoke DOM aprovados;
  TypeScript global, Deno check do executor e lint focado sem erros.
- Aplicadas via MCP, em ordem:20261110235303 e20261110235311. Fontes locais
  renomeadas para o ledger com bytes preservados. Getter indisponível para anon
  e authenticated; somente o executor service_role possui execute.
- Piloto Edgev3 ativo, JWT obrigatório. Relay privado permanece no mesmo Preview.
- Safari autenticado confirmou busca/seleção do parceiro indicado, revisão canônica
  deR$1,00 e transmissão de uma única tentativa, série49999/número3. A consulta
  da SEFIN retornou REJECTED/E0037 às23:56:47Z; não há chave nem XML autorizado.
- Preflight de10/11/2026 e080201 comprovou TLS nos dois hosts; Swagger municipal
  OpenAPI e Swagger SEFIN retornaram200. A rota de convênio declarada no contrato
  respondeu404; alíquota/regime responderam400 e retenções404. O404 isolado não
  foi usado para inferir a causa; a rejeição fiscal E0037 é a evidência do envio.
- Nenhum recebimento, preparação ou modelo foi consumido/alterado pelo teste.

O usuário depois pediu emissão deR$1 em produção e cancelamento. Essa operação
é distinta e ainda não foi executada. A confirmação da prestação real e das
condições de cancelamento está em análise; as notas oficiais anteriores da Universo
comprovam produção, sem eliminar a rejeição do ambiente de testes. Guia Web1.3,
seção5.3, prevê solicitação por análise fiscal quando regras municipais impedem
cancelamento direto; não há garantia prévia baseada só no valor ou na idade da nota.
