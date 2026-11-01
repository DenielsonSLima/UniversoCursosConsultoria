# Correções LGPD por etapas

Data: 31/10/2026. Projeto: Universo Cursos e Consultoria.

**Estado em 01/11/2026: produção autorizada; banco e Edges aplicados,21 fotos migradas e revogação conferida; publicação do frontend em fechamento.**

Manifesto de entrega: [registro do lote](../../ai/operacao/registros/alteracoes/2026-10-31-correcao-lgpd.md). O PDF e os snapshots da auditoria original registram o estado anterior e permanecem como evidência histórica.

## 1. Fotos pessoais - LGPD-01

- Novos uploads vão para `fotos-perfil`, privado, com limite de 5 MB e JPEG/PNG/WEBP.
- O banco armazena referência canônica `profile-photo://`, não URL assinada. A visualização interna recebe assinatura de 300 segundos com o JWT do chamador e RLS por identidade/atribuição/polo.
- O adaptador de transporte limita-se a JSON PostgREST da origem Supabase configurada, campos de foto e referências dedicadas. Não busca URL externa, não compartilha cache entre sessões e normaliza assinaturas antes de gravar payloads.
- A foto de uma credencial pública só é assinada pela Edge após validar código, status `ACTIVE`, tipo permitido e foto visível na política atual. Conhecer o caminho de Storage não basta.
- Logos e imagens públicas de cursos continuam no bucket existente. Uploads legados de fotos pessoais para esse bucket são recusados.
- A migração administrativa copia os bytes pela API Storage, compara SHA-256, atualiza a referência e depois remove a origem pública. Não movimenta bytes por alteração de `storage.objects`.
- Os dois arquivos sem cadastro vão para quarentena privada. A conservação ou eliminação definitiva precisa de decisão própria; não há descarte automático nesta correção.

Metadados conferidos: 21 objetos JPEG, maior de 176.412 bytes, todos compatíveis com o bucket privado. Nenhuma imagem real foi baixada para QA.

## 2. Cadastros e vacinas - LGPD-02/03

- O módulo início/dashboard deixa de autorizar leitura integral de `parceiros`. Os indicadores continuam pelas RPCs agregadas com seus próprios controles.
- Os demais módulos operacionais mantêm o contrato existente. Esta entrega não afirma segregação completa de colunas entre todas as funções da instituição.
- Vacinas exigem identidade institucional ativa, módulo Gestão, aba **explicitamente configurada** `vacinas` e polo autorizado. Privilégio global não substitui a atribuição funcional.
- O acesso do próprio aluno permanece. Aprovação de comprovante continua reservada ao validador autorizado.
- A interface consulta a autorização antes de registros, arquivos e assinatura de URL, diferenciando negação, falha e ausência de exigências.

Antes de publicar, conferir quais profissionais devem receber Gestão/Vacinas. A correção não concede essa permissão automaticamente.

## 3. Chat e anexos - LGPD-04

- Leitura, escrita e exclusão usam identidade, polo e setor; alcance global depende das flags explícitas existentes.
- Os mesmos controles são usados por RLS, gatilhos e Storage. Saber o ID do chat ou caminho do anexo não amplia autorização.
- Dados de identidade, tokens e roteamento não podem ser trocados pelo titular. O canal de visitante mantém sua Edge e bearer específicos.
- Criações antigas recebem roteamento canônico; categoria Geral sem ID continua compatível. Exclusão do pai valida a cascata de mensagens.
- O modal de nova conversa usa diretório mínimo autorizado: `id`, `nome`, `tipo`, `status` e `cidade`. Não reabre o SELECT amplo de parceiros nem solicita foto, e-mail, telefone ou campos sensíveis.

Metadados de compatibilidade: havia zero chats e nenhum usuário ativo com aba de mensagens sem polo ou abrangência explícita. Isso não substitui o smoke de perfis representativos.

## 4. IA e aviso público - LGPD-05/06

- Transcrição é bloqueada antes de consultar mensagem/conexão ou baixar áudio, salvo `WHATSAPP_TRANSCRIPTION_ENABLED=true` e referência válida de aprovação institucional.
- A aprovação deve documentar finalidade, hipótese legal, operador, condições contratuais, conservação e eventual transferência internacional. Não basta dispor de uma chave de API.
- O atendente lê o aviso e confirma o envio do áudio completo. Essa confirmação operacional não substitui consentimento do titular quando exigido.
- O fornecedor recebe nome genérico do arquivo. MIME, extensão, tamanho e prazo de chamada são limitados; erros não ecoam conteúdo ou detalhes de credenciais.
- A transcrição nova é efêmera na visualização e não é acrescentada a `raw_payload` do histórico.
- A política pública passa a descrever saúde/acessibilidade, operadores, IA, transferências, critérios de conservação e atendimento ao titular.

O código não comprova nem substitui DPA, inventário de tratamentos, tabela de temporalidade, decisões do controlador e procedimento administrativo de titulares. Esses documentos dependem da instituição. A transcrição permanece desligada na configuração de exemplo.

## 5. Validação e revisão

- 34 testes com SQL real isolado em PGlite: fotos/journal (3), dados sensíveis/fotos (6), chat/diretório/categorias (18), operação MCP (7), com reprodução do estado anterior e dados sintéticos.
- 35 testes Node de transporte, capabilities, migração, limpeza de sessão, handler de transcrição e interação real do componente.
- 26 testes Deno: transcrição (8) e guardas compartilhadas (18).
- TypeScript global e checagem das três Edges aprovados; build integral e lint dos arquivos afetados conferidos no fechamento.
- Revisão cruzada dos três agentes. Regressões de categoria Geral e diretório mínimo foram corrigidas e retestadas.
- Arquivos manuais do manifesto limitados a 500 linhas; migrations anteriores aplicadas não foram editadas.
- Conferência final: 46 arquivos no manifesto. TypeScript global, lint global, três Edges, versão/histórico, teto global de linhas e build integral aprovados sobre a base completa do GitHub, usando Node 24.22.1.

**Gate global reconciliado no candidato:** a árvore integral do GitHub contém os históricos ausentes na cópia local anterior. `npm run check:file-lines` passou sem apagar registros de outras entregas.

**Safari nativo:** smoke dos componentes reais com dados sintéticos e I/O simulado aprovado: aviso, cancelamento sem chamada, confirmação da transcrição, setor autorizado e política pública. O smoke autenticado contra o backend novo permanece pendente de implantação autorizada. Nenhum áudio real foi enviado.

Para repetir os testes, as dependências de QA estão isoladas em `tmp/lgpd-test-runtime`, sem mudanças no package/lock do produto:

```sh
PGLITE_MODULE_PATH="$PWD/tmp/lgpd-test-runtime/node_modules/@electric-sql/pglite/dist/index.js" node --test supabase/tests/lgpd_profile_photos.isolated.test.mjs supabase/tests/lgpd_sensitive_data.isolated.test.mjs supabase/tests/lgpd_internal_chat.isolated.test.mjs supabase/tests/lgpd_profile_photo_operations.isolated.test.mjs
LGPD_JSDOM_PATH="$PWD/tmp/lgpd-test-runtime/node_modules/jsdom" node --test lib/profile-photo-transport.test.ts lib/supabase-auth-storage.test.ts supabase/functions/profile-photo-access/access.test.ts supabase/functions/profile-photo-migration/migrate.test.ts supabase/functions/profile-photo-migration/operation-route.test.mjs supabase/functions/whatsapp-media/transcription-route.test.mjs modules/gestor/comunicacao/components/whatsapp/inbox/MediaMessageActions.privacy.interaction.test.mjs modules/gestor/comunicacao/components/StartInternalConversationModal.permissions.interaction.test.mjs
deno test --no-config --no-lock --allow-read supabase/functions/whatsapp-media/transcription.test.ts supabase/functions/_shared/authz.test.ts
```

Se for necessário recriar o runtime, instalar somente `@electric-sql/pglite@0.3.14` e `jsdom@26.1.0` nesse diretório temporário. Ele não integra a entrega versionada.

## 6. Implantação autorizada em 01/11/2026

O responsável autorizou explicitamente a aplicação integral no Supabase e atualização da produção em 01/11/2026. As sete migrations e as três Edges foram aplicadas pelo MCP. A transcrição continua bloqueada sem aprovação institucional própria. As etapas abaixo descrevem a implantação operacional pendente.

1. Conferir novamente projeto e ledger por MCP Supabase. A última entrada observada foi `20261028185541_student_ead_certificate_model`; as seis migrations originais não estavam aplicadas antes desta operação.
2. Aplicar as migrations versionadas `20261101030405`, `20261101030414`, `20261101030418`, `20261101030422`, `20261101030426`, `20261101030430` e `20261101030954`, na ordem integral dos arquivos do manifesto. Usar MCP, preservando todas as migrations anteriores.
3. Publicar as três Edges pelo MCP. `profile-photo-access`: **verify_jwt=false**, com capability documental interna obrigatória. `profile-photo-migration`: **verify_jwt=true**, mais guarda de gestor global/Configurações. `whatsapp-media`: **verify_jwt=true**, mantendo transcrição desativada por padrão.
4. Publicar somente o manifesto do lote via MCP GitHub e fluxo de Preview aprovado. Conferir compatibilidade das RPCs antes de promover o frontend. A troca precisa ser coordenada: clientes antigos não devem continuar fazendo upload público; fotos privadas dependem do cliente novo para assinar referências. Durante a transição, fotos ainda não copiadas podem ficar temporariamente indisponíveis.
5. Executar o dry-run pela sessão autorizada de gestor global/Configurações ou pela operação MCP de uso único emitida exclusivamente pelo proprietário do banco. O canal MCP foi validado com HTTP200 e 21 fotos/2 quarentenas. Não compartilhar JWT, URLs assinadas ou caminhos pessoais na documentação. O retorno contém somente contagens agregadas da fila completa.
6. Com autorização para movimentar as fotos, executar lotes administrativos de até 10 objetos, com `dryRun=false`, confirmação `MIGRAR_FOTOS_PESSOAIS` e motivo operacional. Repetir até `pending=0` e `publicSourcesRemaining=0`. O journal permite retomada após falha; nenhuma remoção pública ocorre antes da cópia verificada.
7. Jobs com HEAD público ainda acessível ficam pendentes por propagação/cache; não declarar encerramento enquanto não houver403/404/410 ou HTTP400 com GETJSON limitado comprovando404/NoSuchKey/not_found, além da ausência da origem no Storage. Falha de rede, redirect, erro genérico ou GET200/206 não comprovam revogação. Cópias já baixadas por terceiros não podem ser revogadas pelo sistema.
8. Validar no Safari perfis restritos e globais: fotos próprias/autorizadas, credencial pública válida/revogada, painel sem SELECT amplo, vacinas com/sem atribuição, chat cruzado negado, anexos e confirmação/cancelamento da IA. Usar dados sintéticos; não emitir cobranças nem enviar áudios reais.
9. Atualizar o registro com evidências de aplicação e resultado de cada aceite. Até essa confirmação, os achados seguem **corrigidos no candidato revisado**, com remediação operacional pendente.

Rollback funcional não deve restaurar exposição pública ou permissões amplas. Preservar cópias privadas/journal e corrigir o cliente ou contrato afetado mantendo a restrição. Arquivos em quarentena permanecem preservados até decisão específica.

## Referências

- [LGPD consolidada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
- [ANPD - transferência internacional](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)
- [OpenAI - contrato de transcrição de arquivos](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [Supabase - buckets públicos e privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
