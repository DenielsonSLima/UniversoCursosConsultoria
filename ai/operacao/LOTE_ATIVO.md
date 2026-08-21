# Lote ativo

Estado: `EM_VALIDACAO_DE_PUBLICACAO_4_5_0`

## Lote em validação: 2026-08-21-release-4-5-0

- Base remota: `400c3864c7f288780f73a6e3698050fa7b7cba03` (`main`).
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-21-release-4-5-0.md`.
- Escopo coeso: acesso e primeiro acesso, contexto multiperfil, credencial de preceptor e contrato visual seguro da assinatura eletrônica.
- Produção Supabase: aplicar somente a migration inédita de Crachá de Preceptor; as migrations de identidade, assinatura e tipografia v6 já constam no ledger remoto. A fonte local `safe_typography_v5` e seu teste permanecem fora do manifesto, pois foram substituídos pela v6 já aplicada.
- Critérios de aceite local aprovados: TypeScript, ESLint, build, testes de acesso/portal, Caixa, validação documental, contratos Supabase e checks Deno dos quatro entrypoints afetados.
- Gates restantes: CI e Preview da pull request; publicação coordenada de `portal-auth` e `checkout-api`; smoke público e registro do resultado remoto.

## Complemento publicado: 2026-08-20-assinatura-global-diario-v5-v7-1

- O editor passou a usar a caixa visual quadrada do QR para seleção, redimensionamento e colisão, eliminando o bloqueio provocado pela antiga caixa lógica retangular.
- Todos os elementos possuem controles explícitos de área; Papel, Título e Linha decorativa podem ser ocultados, sem remover dados probatórios do evento.
- QR, código e endereço foram alinhados em coluna. A legenda humana usa `www.universocc.com.br`, mas o QR e os links técnicos continuam HTTPS.
- O CPF público do ato mostra os dois primeiros e os três últimos dígitos; registros históricos no padrão anterior continuam aceitos.
- As migrations incrementais estão registradas no ledger como `20260820225028`, `20260820232636`, `20260821002331`, `20260821002333` e `20260821002336`. A migration `add_individual_signature_proofs_v1` foi preservada intacta.
- Validação final: 220 testes relevantes, TypeScript, ESLint, Deno check/fmt, diff-check e PDF vetorial aprovados. A Edge de artefatos v9 está ativa com JWT obrigatório; o smoke anônimo retornou 401, confirmando o gate de autenticação.

## Fechamento complementar: 2026-08-20-assinatura-global-diario-v5-v7

- Objetivo: substituir o carimbo separado por papel por um único template global livre, aplicado automaticamente a cada signatário canônico do Diário.
- Escopo concluído: schema 5 de template global com imagem, textos, linha e QR reposicionáveis/redimensionáveis; prova, binding, rótulo e estilo imutáveis; distribuição automática de 1 a 6 signatários; acervo compatível com a cardinalidade; prévia e PDF vetoriais; marca estritamente resolvida de `watermark_landscape_<polo_id>`.
- Segurança: a marca aceita somente o ativo canônico já registrado em Modelos de Documentos, inclusive data URI validada; não há fallback de polo/empresa nem marca editável no editor. A migration `add_individual_signature_proofs_v1` continua intacta.
- Produção Supabase: migrations v4, v5, normalização v5, v6 e v7 foram aplicadas e pós-verificadas no projeto `kfekgwyqozhicpfuunpo`; a Edge de artefatos ativa está na versão 9 com JWT obrigatório e contrato de geometria global. A entrada de dry-run registrada pelo provedor foi preservada como fonte sem efeito e a migration real foi registrada separadamente.
- Validação: contratos de assinatura, Edge, acervo, PDF vetorial e migrations, mais build Vite, aprovados localmente; pós-check remoto confirmou ACL, `search_path` e o ramo v6 do acervo. O smoke autenticado de assinatura não foi fabricado: a política `diario_classe` segue juridicamente desabilitada.

## Lote: 2026-08-19-piloto-assinatura-diario-professor-coordenador

- Objetivo: preparar de ponta a ponta, ainda juridicamente desabilitado, o piloto de assinatura eletrônica do Diário de Classe na ordem obrigatória Professor → Coordenador.
- Escopo incluído: envelope versionado e snapshots imutáveis; participante e ordem autoritativos; contexto multiperfil; reautenticação por senha em cliente Auth isolado; ticket curto e de uso único; compositor puro do Diário; alvo semântico do carimbo na última página de conteúdo; hashes distintos do original, PDF final e comprovante; pipeline Edge/Storage privado; manifesto de assets e integridade canônica PostgreSQL→Deno.
- Fora de escopo deste fechamento: habilitação jurídica da política, ativação da assinatura real, teste funcional autenticado reservado ao usuário e assinatura de Responsável Legal em documentos de aluno.
- Guarda principal: a política `diario_classe` permanece `habilitada=false` e `PENDENTE_MATRIZ_JURIDICA`; nenhuma decisão de autorização, ordem, hash, snapshot, participante ou estado é calculada pelo frontend.

### Etapas concluídas localmente

1. Identidade multiperfil de Aluno, Responsável, Professor, Coordenador e Gestor, com contexto opaco revalidado por RPC e escopo explícito por polo.
2. Envelope do Diário com exatamente Professor ordem 1 e Coordenador ordem 2, snapshots de identidade/vínculo e progressão fechada no banco.
3. Reautenticação por senha em Edge separada, sessão secundária revogada antes do ticket, TTL de 120 segundos, uso único, idempotência e limite durável por tentativa física.
4. Compositor do Diário extraído para núcleo server-safe, sem DOM/Vite/fetch, com PDF vetorial, manifesto semântico e geometria congelada do documento original.
5. Carimbo do documento original com dois atos separados, data/hora com segundos, URL exata de verificação e método único `SENHA_REAUTENTICADA` no piloto.
6. Pipeline autoritativo de artefatos: bytes institucionais verificados, QR local, paths determinísticos, Storage privado, hashes do original/final/comprovante e wrappers service-role vinculados a ator e sessão.
7. Hardening do manifesto: JSON canônico `POSTGRES_JSONB_TEXT_UTF8_V1`, SHA-256 integral e sub-hashes, assets sem base64 duplicada no manifesto e ledger mínimo sem senha, token ou sessão.
8. Reconciliador DB-aware/TTL de uploads órfãos, com intenção persistida antes do upload, fencing contra worker obsoleto, quarentena de 15 minutos, remoção somente após dupla validação e testes de falha após o primeiro e o segundo upload.
9. Orquestração frontend do Diário por contrato canônico: lookup do envelope atual no banco, `requestId` separado e estável para solicitar/preparar/finalizar, recuperação após reload, estados terminais somente leitura e finalização após o ato do Coordenador. O navegador não persiste envelope, participante ou estado como autoridade.
10. Consentimento explícito antes do ato: o signatário recebe o termo canônico congelado, suas cinco seções, versão e hash, pode abrir o PDF original e precisa marcar o aceite antes da reautenticação por senha. O banco vincula termo, participante, contexto, sessão e horário oficial; a senha nunca é persistida.
11. Validador público do Diário: o UUID impresso no QR só resolve envelope final ou substituído com hash e objeto final presentes no Storage. O mapper aplica allowlist própria do Diário e rejeita campos pessoais não autorizados.
12. `Secretaria > Assinaturas e Acervo`: a permissão granular existente foi preservada e a tela ganhou Caixa de assinaturas e Acervo assinado, com busca e filtros server-side, paginação keyset, versões substituídas, signatários, horários e downloads temporários do PDF final e comprovante. `Histórico de Emissões` continua separado.
13. O download privado passou a uma única RPC atômica vinculada a ator, sessão, perfil, contexto, envelope, classe e `requestId`. O gate do Gestor foi reescrito de modo actor-aware, sem bypass de `service_role`, e revalida agenda, módulo/aba e polo antes de resolver a coordenada interna do objeto.

### Revisão e validação

- Reunião e revisão cruzada em três frentes: Banco/RLS/envelopes; Auth/Edge/reauth; PDF/manifesto/carimbo, seguida de auditoria independente somente leitura.
- Contratos SQL integrados: 91/91. Edge/reauth: 52/52. PDF, compositor e cliente: 60/60. TypeScript completo, ESLint focado, Deno check/fmt/lint e build Vite aprovados.
- A auditoria independente aprovou 94/94 verificações integradas, 67/67 contratos textuais SQL e 31/31 verificações focadas de PDF.
- O preflight remoto confirmou projeto `kfekgwyqozhicpfuunpo`, tabelas operacionais de assinatura vazias, bucket `documentos-assinatura-eletronica` privado/PDF-only, `pgcrypto`, `auth.sessions.not_after`, renames e índice de identidade no estado esperado.
- As sete migrations foram concatenadas sem seus wrappers transacionais e compiladas integralmente no PostgreSQL remoto dentro de um único `BEGIN/ROLLBACK`. O dry-run completo foi revertido e confirmou a cadeia incluindo o reconciliador.
- Pós-rollback confirmado: zero novas tabelas/funções/colunas; `conteudo_sha256` restaurado; zero envelopes e participantes; ledger remoto de migrations inalterado.
- Validação final local: 84/84 contratos das sete migrations, 57/57 testes das duas Edge Functions e checks Deno dos entrypoints aprovados. Os bundles ficaram abaixo do limite de 5 MB.
- Hash da migration de pipeline `20260819160000_harden_diario_artifact_pipeline.sql`: `48db331995d263015e654deaa2eccf7987d3f9562117913463f267ac934b51e2`; hash do reconciliador `20260819170000_add_diario_artifact_orphan_reconciler.sql`: `133bed7e2f15b2c194cb2cfd1c55bcec47a813739c2d9d85fbba97c043aba506`.
- Revisão local do termo/acervo: 146/146 contratos integrados; SQL focado 17/17; Edge acervo 15/15; reautenticação 29/29; validador 19/19; frontend focado 13/13; TypeScript, Deno check/fmt/lint e ESLint focado aprovados. A revisão independente encerrou com zero achados Critical, High ou Medium abertos.
- Freeze local da próxima migration `20260819190000_add_assinatura_termo_acervo_v1.sql`: SHA-256 `a6f08a9d86057a3b7e35081c3c37faa27ad6e7916271852b4b82313c7732e8a8`; teste contratual: `442533e8a33ffd99b63565621e9f8e0175089c01be8410f835b2e307d356ab69`.

### Aplicação remota concluída e gates restantes

- Vault configurado com exatamente uma entrada válida para `portal_identity_cursor_hmac_secret`, `assinatura_reauth_ticket_hmac_secret` e `portal_invite_reconciliation_hmac_secret`; cada segredo possui pelo menos 32 bytes e o conteúdo nunca foi retornado.
- As sete migrations foram aplicadas individualmente, na ordem obrigatória, e registradas no ledger remoto. Após cada bloco foram verificados objetos, constraints e estado dormente.
- A migration corretiva `20260819180000_harden_edge_rpc_contracts.sql` foi aplicada no ledger remoto como `20260819224314` (`harden_edge_rpc_contracts`). Ela criou três aliases RPC explícitos com nomes abaixo do limite de 63 bytes do PostgreSQL, fechou os overloads internos antigos, criou a assinatura HMAC via Vault e adicionou o lookup canônico do envelope atual.
- As Edge Functions `assinatura-eletronica-reautenticacao` v2, `assinatura-eletronica-diario-artefatos` v2, `assinatura-eletronica-acervo` v1 e `portal-user-management` v29 estão `ACTIVE`, com `verify_jwt=true`. O bundle remoto de artefatos usa somente os aliases curtos; o Portal contém as ações de acesso de Professor e Responsável e não depende de segredo HMAC configurado na Edge.
- Pós-aplicação: 13 tabelas de assinatura com RLS, zero grants diretos para `anon/authenticated/service_role`, todas as constraints validadas, bucket PDF privado e zero envelopes, participantes, eventos, desafios, artefatos ou intenções de upload.
- Todas as políticas de assinatura permanecem desabilitadas. As quatro linhas/versões do Diário continuam `PENDENTE_MATRIZ_JURIDICA` e `habilitada=false`.
- A migration `20260819190000_add_assinatura_termo_acervo_v1.sql` foi compilada em dry-run com rollback e aplicada uma única vez no ledger remoto como `20260820002006` (`add_assinatura_termo_acervo_v1`), preservando o hash congelado `a6f08a9d86057a3b7e35081c3c37faa27ad6e7916271852b4b82313c7732e8a8`.
- A Edge `assinatura-eletronica-reautenticacao` v2 e a nova Edge `assinatura-eletronica-acervo` v1 foram implantadas coordenadamente. O smoke anônimo das duas retornou `401 UNAUTHORIZED_NO_AUTH_HEADER`, sem erro de boot ou transporte e sem acionar usuário, envelope ou política.
- A integração frontend do Diário e do acervo está concluída e validada no workspace (`tsc`, build Vite, ESLint e testes focados). A entrega versionada deve partir do `main` remoto e usar manifesto explícito, pois o worktree local contém mudanças paralelas; não haverá merge em Produção antes do teste e aceite do usuário.
- No estado remoto atual, o teste do Diário deve validar somente o bloqueio seguro e a navegação: a política jurídica está desabilitada e não há massa acadêmica/coordenação canônica para um happy path. Um E2E positivo Professor → Coordenador requer dados canônicos, parecer jurídico e autorização explícita para habilitar um piloto; a política não será alterada silenciosamente.
- Após a publicação do frontend, o usuário poderá testar os fluxos de acesso do Responsável/Professor e seleção multiperfil. O teste funcional autenticado continua reservado ao usuário.
- Hardening pré-escala: adicionar cron interno e alerta de backlog para o reconciliador; no piloto, a limpeza oportunística roda em background após uma invocação autenticada bem-sucedida.

### Ordem aplicada em produção

1. `20260819013000_add_assinatura_eletronica_signature_stamp_editor_v3.sql`
2. `20260819110000_create_portal_multi_profile_identities.sql`
3. `20260819120000_require_public_signup_demographics.sql`
4. `20260819123000_enable_diario_signature_envelopes_v1.sql`
5. `20260819150000_harden_assinatura_reauth_attempt_nonce.sql`
6. `20260819160000_harden_diario_artifact_pipeline.sql`
7. `20260819170000_add_diario_artifact_orphan_reconciler.sql`
8. `20260819180000_harden_edge_rpc_contracts.sql`
9. `20260819190000_add_assinatura_termo_acervo_v1.sql`

Ledger remoto: `20260819203137`, `20260819203143`, `20260819203149`, `20260819203221`, `20260819203227`, `20260819203314`, `20260819203338`, `20260819224314` e `20260820002006`, na mesma ordem acima.

Estado de entrega: banco, termo/acervo e Edge Functions aplicados no projeto `kfekgwyqozhicpfuunpo`; assinatura real continua bloqueada por política e o teste funcional autenticado permanece reservado ao usuário. O frontend corrigido está disponível para smoke local em `localhost`; a publicação versionada segue por Draft PR isolado e não será mesclada em Produção antes do aceite do usuário.

## Lote: 2026-08-19-identidades-multiperfil-e-carimbo-v3

- Objetivo: preparar, sem habilitar assinatura conclusiva, a identidade autenticável do responsável legal, o contexto independente de coordenador de curso e o modelo visual do carimbo que futuramente será aplicado ao documento original.
- Escopo incluído: cadastro mínimo e vínculos verificados de responsáveis; mesma identidade Auth com perfis Aluno e Responsável; seletor de perfil pós-login; aba `Parceiros > Responsáveis`; portais próprios de Responsável e Coordenador; atribuições temporais Professor→Coordenação; terceira aba `Carimbo de assinatura` no editor; imagem PNG exclusiva do carimbo; posicionamento acessível na última página do documento original.
- Fora de escopo: criação de envelopes; seleção definitiva de signatários por documento; assinatura do Diário; reautenticação por senha; mudança de participante para `ASSINADO`; aplicação do carimbo em artefato oficial; publicação do frontend, aplicação das migrations e deploy da Edge Function atualizada.
- Guarda principal: perfil escolhido no navegador é apenas contexto visual. Toda RPC revalida `auth.uid()`, vínculo, atribuição, escopo e vigência. Responsável nunca é associado por coincidência isolada de e-mail ou telefone; coordenador continua sendo um professor com atribuição explícita; nenhuma capability de assinatura foi concedida nesta etapa.

### Identidade e acesso do responsável

- `responsaveis_legais` mantém a identidade própria, com cadastro em rascunho exigindo somente nome. CPF, e-mail, identidade verificada, status ativo e ao menos um vínculo verificado e vigente com aluno ativo são exigidos pelo serviço antes de preparar acesso.
- `responsaveis_legais_alunos` representa a relação N:N e preserva parentesco, vigência, verificação e revogação. O vínculo não é inferido por dados cadastrais coincidentes.
- O mesmo `auth.users.id` pode continuar ligado a um Aluno em `parceiros` e também a um Responsável na tabela própria, sem afrouxar `uq_parceiros_auth_user_id` nem criar novo `parceiros.tipo`.
- A Edge `portal-user-management` ganhou a ação `ensure-responsavel-access`. Conta existente só recebe o segundo perfil quando CPF e e-mail coincidem com um cadastro canônico já ligado ao mesmo usuário; caso contrário, a operação falha fechada. Convites novos usam nonce de operação e vínculo transacional service-role-only.

### Contextos de portal e coordenação

- `portal_listar_perfis()` devolve exclusivamente contextos autorizados de Aluno, Responsável, Professor, Coordenador e Gestor. Cada contexto inclui identificador, rota, capabilities, polos e escopos definidos pelo banco.
- Quando a mesma conta possui mais de um contexto, os logins institucional, público e do aplicativo exibem o seletor de perfil antes da navegação. A troca limpa o cache TanStack Query e usa uma chave que inclui o `contextId`.
- `professores_coordenacoes` registra Professor + Curso + Polo + vigência. Coordenador possui rota `/coordenador`, menu e consulta somente leitura dos escopos devolvidos pelo serviço; não recebeu autorização de assinar.
- Os portais de Professor, Coordenador e Responsável exibem o módulo Assinaturas em estado bloqueado. Nenhum deles cria ordem, participante ou documento no frontend.

### Correções de fechamento do acesso multiperfil

- O primeiro acesso do Aluno passou a falhar fechado: enquanto o aceite vigente ou a troca obrigatória de senha estiver pendente, login web, aplicativo e entrada direta no portal redirecionam para o fluxo canônico de primeiro acesso. A ação de interromper encerra a sessão e nunca abre o portal.
- O checkout também passou a aplicar esse bloqueio no servidor antes de consultar ou reaproveitar matrícula/cobrança existente. O Aluno próprio é resolvido somente por `auth_user_id` e `tipo = Aluno`; o estado de primeiro acesso vem de `portal_listar_perfis()` usando o bearer atual. A exceção administrativa continua restrita ao Gestor revalidado e ao aluno de terceiro dentro de seu escopo, sem permitir que o Gestor contorne o próprio primeiro acesso.
- `portal_listar_perfis()` é a única autoridade para reidratar um contexto. O `contextId` armazenado ou recebido pela URL é apenas uma dica opaca e só é aceito quando reaparece na resposta atual do banco.
- Campos sensíveis de Parceiros — vínculo Auth, e-mail de login, matrícula de acesso, troca de senha, estado de acesso e aceite jurídico — não podem mais ser alterados diretamente pelo navegador. Criação ou vínculo do Aluno após checkout usa a RPC idempotente `portal_garantir_perfil_aluno_checkout`.
- A unicidade global de `parceiros.auth_user_id` foi preservada. Aluno e Responsável compartilham o mesmo UID por viverem em entidades distintas; um UID já vinculado a Professor não é transformado em Aluno e falha fechado.
- Leituras e mutações administrativas de Responsáveis e Coordenações recebem `p_polo_id` e `p_include_global`. O banco revalida o escopo e a UI mantém caches separados por contexto, polo e variante local/global; nenhuma lista ampla é filtrada no navegador para simular autorização.
- `requestId` permanece estável durante retry e só é descartado após sucesso canônico. Convites de Responsável usam marcador HMAC e as RPCs internas de preparação/vínculo permanecem exclusivas do `service_role`.

### Carimbo de assinatura v3

- A terceira aba do editor é `Carimbo de assinatura`; não existe Página 3 no comprovante. As duas páginas de confirmação permanecem inalteradas.
- O carimbo possui layouts `HORIZONTAL` e `COMPACT`, ativo PNG próprio, slots fixos de Professor e Coordenador, alvo canônico `LAST_PAGE` e coordenadas inteiras no espaço `PAGE_TOP_LEFT_BP_V1`.
- O usuário pode mover e redimensionar o carimbo com ponteiro ou teclado. Limites e colisões são validados no cliente para UX e novamente no banco para autoridade.
- Rótulo, nome do signatário, papel, data/hora com segundos, fuso e URL de verificação continuam bloqueados e serão preenchidos pelo serviço. A configuração permanece `habilitada=false` e `PENDENTE_MATRIZ_JURIDICA`.
- A prévia do carimbo é uma folha vetorial demonstrativa separada. Ela não acrescenta página ao comprovante nem simula assinatura concluída.

### Validação deste lote

- Reunião técnica em três frentes independentes: Auth/RLS e identidade multipapel; portais/TanStack Query; PDF vetorial e carimbo.
- Contratos integrados de Auth/RLS, multiperfil, escopo por polo, cache, navegação e gate financeiro: 88/88 aprovados. Fluxo geral de autenticação: 16/16. Controle de acesso do Gestor: 30/30. Regressões específicas do checkout: 5/5 novas e 9/9 existentes.
- Contratos do carimbo e PDF permaneceram aprovados no fechamento da frente visual. TypeScript completo, ESLint focado, Deno lint/format e `git diff --check` focado foram aprovados.
- As migrations `20260819013000_add_assinatura_eletronica_signature_stamp_editor_v3.sql` e `20260819110000_create_portal_multi_profile_identities.sql` compilaram integralmente no Postgres remoto dentro de `BEGIN/ROLLBACK`. A verificação posterior confirmou ausência das novas tabelas e do schema v3, sem resíduo remoto.
- O Safari carregou o frontend mais recente em `localhost:3001/sistema/login`; a tela institucional reconheceu o contexto de coordenador e permaneceu fail-closed sem as migrations. Não foram usados dados ou credenciais reais.
- Estado de entrega: arquivos somente no workspace; nenhuma migration foi aplicada, nenhuma Edge Function foi implantada e nenhum frontend foi publicado neste lote.

### Gates antes da aplicação

- Configurar no Vault o segredo `portal_identity_cursor_hmac_secret`, com no mínimo 32 bytes. O preflight remoto de 19/08/2026 confirmou que ele ainda não existe.
- Configurar na Edge Function o segredo dedicado `PORTAL_INVITE_RECONCILIATION_SECRET`, também com no mínimo 32 caracteres e sem reutilizar a chave `service_role`.
- Aplicar a migration exclusivamente pelo MCP Supabase, implantar a Edge atualizada com JWT obrigatório e então executar smoke autenticado com: Aluno; Aluno + Responsável no mesmo UID; Responsável com dois dependentes; Professor + Coordenador; gestor local em dois polos; e gestor global.
- Somente depois do smoke publicar o frontend. Envelopes, assinatura conclusiva e carimbo em documento oficial continuam bloqueados até o lote seguinte.

### Próxima etapa funcional

1. Estender participantes e políticas para papéis explícitos de Professor, Coordenador e Responsável Legal, sempre ligados ao contexto autenticado e ao vínculo/atribuição vigente.
2. Criar envelopes versionados, ordem obrigatória de participantes e snapshot imutável do documento original, da política e das relações usadas na autorização.
3. Implementar reautenticação por senha em Edge separada, com ticket curto, uso único, rate limit e confirmação transacional; senha e tokens nunca entram nas tabelas.
4. Separar hash do documento original do hash do artefato final carimbado e aplicar o carimbo somente na última página real, respeitando orientação e caixas do PDF.
5. Pilotar o Diário de Classe na ordem Professor → Coordenador, mantendo todas as outras categorias desabilitadas até matriz jurídica própria.

## Lote: 2026-08-18-fundacao-assinatura-eletronica

- Objetivo: criar a fundação segura da assinatura eletrônica, o modelo configurável do comprovante de duas páginas e as caixas de consulta, sem habilitar assinatura jurídica antes do retorno jurídico e da autenticação reforçada.
- Escopo incluído: configuração global `MODELO_PADRAO`; três RPCs; seis tabelas protegidas; bucket privado; comprovante PDF vetorial; caixas de Gestor/Secretaria, Professor e Aluno; permissão granular da Secretaria; testes de contrato, acesso e PDF.
- Fora de escopo: assinatura conclusiva; criação de envelopes reais; vínculo do responsável legal; conta de parte externa; desafio OTP/provedor; validação pública específica de envelopes; publicação do frontend em GitHub/Vercel.
- Guarda principal: navegador usa somente RPCs e não calcula autorização, elegibilidade ou estado; tabelas e funções internas não são executáveis por papéis da API; `MODELO_PADRAO` fica global, desabilitado e com status `PENDENTE_MATRIZ_JURIDICA`.

## Produção Supabase

- Projeto: `kfekgwyqozhicpfuunpo`.
- Migration remota `20260818194445` — `20260818143000_create_assinatura_eletronica_foundation`.
- Migration remota `20260818194642` — `20260818164540_harden_assinatura_eletronica_function_grants`.
- Migration remota `20260818195036` — `20260818164927_index_assinatura_eletronica_foreign_keys`.
- Migration remota `20260818230318` — `20260818184706_extend_assinatura_eletronica_model_editor_v1`.
- Migration remota `20260819002821` — `add_assinatura_eletronica_custom_watermark_assets_v2`.
- Edge Function `assinatura-eletronica-modelo-assets` versão 1 ativa, com `verify_jwt=true`.
- Resultado: nove tabelas com RLS; bucket de PDFs finais `documentos-assinatura-eletronica` privado; bucket isolado `assinatura-eletronica-modelo-assets` privado, somente PNG e 1 MiB; uma configuração global versão 1 desabilitada; zero envelopes, participantes, eventos, desafios, artefatos de comprovante, reservas e imagens personalizadas persistidas.

## Correção local: editor real de duas páginas

- A tela de configuração foi substituída por um editor visual com seleção explícita da Página 1 e da Página 2. Editor e prévia permanecem juntos no desktop e empilham em telas menores; os modos artificiais `Lado a lado`, `Editor` e `Prévia` foram removidos após revisão visual.
- O atalho interno para a Central de Assinaturas foi removido do editor. A Central permanece um módulo separado e acessível pelo próprio cartão em Configurações.
- A prévia usa o próprio PDF vetorial por meio de PDF.js; não existe uma réplica HTML do comprovante.
- O cabeçalho institucional permanece canônico e bloqueado nas duas páginas. Versão, evidências, participantes, eventos, QR/URL, hash e rodapé continuam fornecidos pelo serviço e não são editáveis no navegador.
- A identidade do cabeçalho e o ativo institucional são resolvidos pela RPC a partir da única matriz ativa. O navegador apenas prepara as imagens recebidas; ausência ou ambiguidade da matriz bloqueia a prévia sem usar identidade de contingência.
- Cada página possui marca-d'água independente, podendo usar texto próprio ou uma imagem PNG personalizada exclusiva daquele modelo. A imagem geral dos documentos institucionais não é reutilizada nem alterada. O upload usa bucket privado dedicado, ativo imutável e URL assinada curta; os buckets público de documentos, de rubricas e de PDFs finais não são reutilizados.
- A Página 2 usa cinco blocos jurídicos fixos e ordenados; seus textos são editáveis dentro de limites validados no banco, sem HTML, URLs arbitrárias, criação ou reordenação de blocos.
- O salvamento envia a versão-base e usa lock transacional: se outra sessão publicar antes, o banco rejeita o segundo salvamento e a tela exige recarregar a versão atual, evitando sobrescrita silenciosa.
- A migration incremental `20260818184706_extend_assinatura_eletronica_model_editor_v1.sql` amplia somente o JSON versionado do `MODELO_PADRAO` e as duas RPCs existentes de configuração. Ela não altera RLS, Storage, tabelas operacionais, habilitação jurídica ou criação de envelopes.
- A migration foi aplicada no Supabase em `20260818230318`. A verificação posterior confirmou duas páginas, cinco blocos jurídicos, identidade canônica da matriz, `habilitada=false`, versão ativa 1 e zero envelopes.

## Extensão v2: imagem de marca-d'água personalizada

- O contrato do editor foi elevado para `schemaVersion=2`, preservando leitura do formato anterior. Página 1 e Página 2 possuem `assetId` independente e fonte fechada em `TEXT` ou `CUSTOM_ASSET`.
- O navegador não acessa Storage diretamente. Upload, resolução de prévia, limpeza e reconciliação passam pela Edge Function autenticada e pelas RPCs autorizadas.
- O upload aceita somente PNG estático de até 1 MiB, 4096 px por lado e 12 milhões de pixels. O servidor verifica assinatura, chunks, CRC, decodificação e dimensões, remove metadados e calcula SHA-256.
- Antes de entregar a imagem ao compositor, o cliente baixa a URL assinada sem cache e confere MIME, tamanho, dimensões e SHA-256. Divergência falha fechada.
- Assets usados por uma versão salva são congelados por FK com snapshot e hash. Assets transitórios podem ser removidos pelo usuário; reservas expiradas, pendências e objetos órfãos são retomados por reconciliador idempotente com TTL na próxima chamada autorizada.
- A autorização de negócio ocorre antes de qualquer leitura do multipart, e a leitura do corpo é limitada por streaming mesmo sem `Content-Length`.
- O cabeçalho canônico permanece intocado nas quatro rotas do PDF (comprovante P1/P2 e prévia P1/P2); a marca-d'água é desenhada antes do cabeçalho e atrás do conteúdo.

## Validação da fundação aplicada

- Revisões independentes de SQL/RLS e frontend/PDF, acompanhadas de preflight e compilação transacional no schema remoto.
- Contrato SQL: 10/10; comprovante PDF: 9/9; controle de acesso: 21/21; ESLint focado e TypeScript completo aprovados.
- PDF de limite renderizado em duas páginas A4 e inspecionado visualmente, sem corte ou sobreposição; artefatos temporários removidos.
- Smoke remoto: configuração canônica retornada desabilitada; caixas Pendentes/Assinados vazias; idempotência testada em transação revertida, sem dado residual.
- Privilégios remotos: apenas três RPCs executáveis por `authenticated/service_role`; zero privilégios diretos nas seis tabelas; funções internas fechadas; `anon` sem RPC e sem acesso ao bucket.
- Advisors: três avisos de `SECURITY DEFINER` intencionais para as RPCs com RBAC interno; nenhuma chave estrangeira da fundação permaneceu sem índice. Avisos de índice ainda não utilizado são esperados porque as tabelas operacionais estão vazias.

## Validação da correção local

- Contratos SQL: 17/17; compositor e prévia PDF: 12/12; TypeScript completo e ESLint focado aprovados.
- As duas páginas A4 foram geradas a partir da fábrica real de prévia, renderizadas e inspecionadas visualmente: cabeçalho nas duas páginas, marca-d'água atrás do conteúdo, área de validação preservada e identificação permanente de `PRÉVIA DO MODELO — SEM VALIDADE`.
- Foram testados fallback da versão 1 antiga, duas páginas exatas, ordem fixa dos blocos, independência das marcas-d'água, identidade canônica da matriz, limites de texto, repetição idempotente, conflito de versão concorrente e permanência de `habilitada=false`/`PENDENTE_MATRIZ_JURIDICA` após salvar.
- O smoke autenticado da estrutura visual foi executado posteriormente no Safari: botão Salvar no topo direito, abas P1/P2, editor e prévia simultâneos e ausência do atalho indevido para a Central de Assinaturas. O servidor local respondeu HTTP 200; TypeScript, ESLint focado, contratos SQL e contratos do PDF passaram.

## Validação da extensão v2

- Testes integrados locais: 55/55 aprovados — Edge, reconciliador, fundação, editor, pré-validação e integridade de imagem, compositor e prévia PDF.
- `npx tsc --noEmit`, ESLint focado e `git diff --check` aprovados.
- A migration final foi compilada integralmente no Postgres remoto dentro de `BEGIN/ROLLBACK`; confirmou três novas tabelas com RLS, bucket privado PNG/1 MiB, schema 2 com duas páginas, grants internos fechados, política desabilitada e zero envelopes. O rollback foi confirmado sem resíduos.
- Pós-aplicação: três novas tabelas com RLS, zero grants diretos para papéis da API, policy restritiva no Storage, funções internas exclusivas do `service_role`, RPCs públicas com guarda RBAC, bucket privado e Edge Function ativa com JWT obrigatório.
- Estado remoto após aplicação: configuração ativa continua na versão 1, `habilitada=false`, `PENDENTE_MATRIZ_JURIDICA`; zero envelopes, reservas, assets e vínculos.
- Advisors novos: quatro avisos intencionais de RPC `SECURITY DEFINER` executável por `authenticated`, todas com guarda interna; um índice opcional para FK `criada_por` e índices ainda não utilizados em tabelas vazias são observações de desempenho, não bloqueadores.
- Smoke autenticado visual antes da aplicação confirmou botão Salvar no topo direito, abas reais P1/P2, editor e prévia PDF, cabeçalho bloqueado e ausência da Central de Assinaturas dentro do editor. Após a aplicação, a janela visível do Safari deixou de estar disponível para o controle remoto; o upload/remoção autenticado permanece como único smoke pendente e não foi substituído por gravação de dados de teste.

## Estado de publicação

- Banco da primeira etapa, editor v1, extensão v2 de imagens e Edge Function foram aplicados em produção por autorização explícita.
- Frontend, compositor e documentação permanecem somente no workspace; nenhum commit, PR ou deploy Vercel foi realizado neste lote.
