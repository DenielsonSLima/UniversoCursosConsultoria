# Correção LGPD - 31/10/2026

Status: PRODUÇÃO AUTORIZADA EM 01/11/2026; BANCO E EDGES APLICADOS, PUBLICAÇÃO EM FECHAMENTO. Três agentes independentes convocados a pedido do usuário; coordenação, IA e aviso público pelo agente principal.

## Objetivo e aceite

Corrigir os seis achados da auditoria de 31/10: fotos pessoais privadas; início sem cadastro completo; vacinas com atribuição explícita; chat/anexos por polo e setor; transcrição bloqueada por padrão e aviso público coerente com os tratamentos.
Aceite técnico: autorização no backend; dados sintéticos; caminhos diretos e legados sem bypass; fotos preservadas por hash antes da remoção pública; nenhuma cobrança, mensagem ou transcrição real em QA.

## Etapas

1. Fotos: bucket privado, referências canônicas, assinatura por sessão/capability documental válida e migração administrativa retomável com quarentena.
2. Cadastros/vacinas: retirada de início/dashboard da leitura completa; aba explícita Gestão/Vacinas, identidade e polo; agregados do painel preservados.
3. Comunicação: RLS/gatilhos/Storage unificados por polo/setor e privilégio global explícito; diretório mínimo de contatos implementado e testado com a restrição de parceiros.
4. IA/aviso: transcrição desligada sem aprovação documentada e confirmação do aviso; nome de arquivo genérico, erros sanitizados e texto efêmero; política pública ampliada.
5. Integração: testes, tipagem, build, revisão cruzada, manifesto e conferência proporcional.
6. Produção: autorizada explicitamente pelo responsável em 01/11/2026, incluindo aplicação integral no Supabase e publicação. Banco e Edges aplicados; conferência operacional em andamento.

## Manifesto explícito

- `.env.example`
- `lib/profile-photo-transport.ts`
- `lib/profile-photo-transport.test.ts`
- `lib/supabase.ts`
- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/shared/vacinas/vacinas.service.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoVacinas.tsx`
- `modules/gestor/comunicacao/components/StartInternalConversationModal.tsx`
- `modules/gestor/comunicacao/components/StartInternalConversationModal.permissions.interaction.test.mjs`
- `modules/gestor/comunicacao/components/whatsapp/inbox/MediaMessageActions.tsx`
- `modules/gestor/comunicacao/components/whatsapp/inbox/MediaMessageActions.privacy.interaction.test.mjs`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp-transcription.service.ts`
- `modules/public/privacy/PrivacyPage.tsx`
- `supabase/functions/whatsapp-media/index.ts`
- `supabase/functions/whatsapp-media/transcription.ts`
- `supabase/functions/whatsapp-media/transcription.test.ts`
- `supabase/functions/whatsapp-media/transcription-route.test.mjs`
- `supabase/functions/profile-photo-access/access.ts`
- `supabase/functions/profile-photo-access/access.test.ts`
- `supabase/functions/profile-photo-access/index.ts`
- `supabase/functions/profile-photo-migration/index.ts`
- `supabase/functions/profile-photo-migration/migrate.ts`
- `supabase/functions/profile-photo-migration/migrate.test.ts`
- `supabase/migrations/20261101030405_lgpd_private_profile_photos.sql`
- `supabase/migrations/20261101030414_lgpd_profile_photo_migration_journal.sql`
- `supabase/migrations/20261101030418_lgpd_partner_purpose_scope.sql`
- `supabase/migrations/20261101030422_lgpd_vaccine_permissions.sql`
- `supabase/migrations/20261101030426_lgpd_internal_chat_scope.sql`
- `supabase/migrations/20261101030430_lgpd_chat_contact_directory.sql`
- `supabase/tests/lgpd_profile_photos.fixture.mjs`
- `supabase/tests/lgpd_profile_photos.isolated.test.mjs`
- `supabase/tests/lgpd_sensitive_data.isolated.test.mjs`
- `supabase/tests/fixtures/lgpd-sensitive-data.sql`
- `supabase/tests/lgpd_internal_chat.fixture.mjs`
- `supabase/tests/lgpd_internal_chat.isolated.test.mjs`
- `docs/security-audit/plano-correcao-lgpd.md`
- `docs/security-audit/conferencia-correcao-lgpd.md`
- `.github/workflows/lgpd-security.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-10-31-correcao-lgpd.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `supabase/migrations/20261101030954_lgpd_profile_photo_operations.sql`
- `supabase/tests/lgpd_profile_photo_operations.isolated.test.mjs`
- `supabase/functions/profile-photo-migration/operation-route.test.mjs`

Total: 46 arquivos.

## Evidências e validação

- Ledger consultado via MCP Supabase, última migration observada: `20261028185541_student_ead_certificate_model`. Os prefixos candidatos deste lote não constam no ledger consultado.
- Fotos: 21 objetos JPEG, maior 176.412 bytes; 2 sem parceiro. Só metadados/contagens foram consultados.
- Backend e Storage testados em PGlite isolado, com dados sintéticos; Edges testadas sem rede externa.
- Revisão cruzada identificou e corrigiu categoria Geral/null e a dependência do modal de contatos no SELECT amplo de parceiros.
- 78 testes únicos aprovados na árvore candidata integral: 27 SQL/PGlite, 25 Node e 26 Deno. TypeScript global, lint global, três Edges e build completo aprovados com Node 24.22.1.
- Manifesto atual: 43 arquivos. Gate global `npm run check:file-lines` aprovado na cópia integral da base remota. Os 36 históricos ausentes na antiga cópia local foram preservados a partir do GitHub, sem excluir registros.
- Safari nativo: smoke dos componentes reais com dados sintéticos e I/O simulado aprovado para aviso/cancelamento/confirmação de IA, categorias autorizadas e política pública. Smoke autenticado do backend novo permanece pendente de implantação.
- Nenhuma migration ou Edge aplicada remotamente; nenhuma foto ou cadastro real alterado. Atualização do GitHub autorizada por branch/PR; produção não promovida.

## Riscos e entrega

Plano de implantação e critérios de aceite: `docs/security-audit/plano-correcao-lgpd.md`.
Perfis de vacinas precisam de atribuição explícita Gestão/Vacinas. Fotos antigas só deixam de ser públicas após a migração e verificação de indisponibilidade/cache.
Os snapshots e o PDF da auditoria original permanecem como evidência histórica; não foram reescritos para aparentar correção em produção.
O candidato financeiro anterior permanece independente no registro `2026-10-27-transferencia-carne-progresso.md`, com seu status preservado; não integra este manifesto.

## Conferência e atualização GitHub

Pedido explícito do usuário: revisar, realizar conferência/testes e atualizar o projeto no GitHub após validação. Três agentes aprovaram as frentes e revisões cruzadas; N+1 de assinaturas e categoria inicial fora do setor foram corrigidos. Ata: `docs/security-audit/conferencia-correcao-lgpd.md`.

Base remota: `8e09334b231e39db5a6bd1cb6b244d29dd1db813` (4.8.243). Candidato preparado em `tmp/lgpd-publication/candidate` com a árvore remota integral e apenas este manifesto sobreposto. Os dois arquivos de versão são derivados da base remota nessa cópia, preservando o histórico e as alterações locais paralelas. Versão candidata: 4.8.244/revisão253. Publicação por MCP GitHub em um commit atômico, branch/PR e Preview. A autorização posterior de 01/11/2026 inclui produção e está registrada abaixo.

## Implantação autorizada — 01/11/2026

O responsável autorizou explicitamente produção e aplicação integral do lote no Supabase. Projeto confirmado `kfekgwyqozhicpfuunpo`, saudável. Sete migrations aplicadas via MCP; os nomes dos arquivos foram alinhados às versões reais do ledger, mantendo o SQL aplicado inalterado: `20261101030405`, `20261101030414`, `20261101030418`, `20261101030422`, `20261101030426`, `20261101030430` e `20261101030954`.

Edges ativas: `profile-photo-access` v1 (capability documental), `profile-photo-migration` v2 (JWT obrigatório e autorização própria), `whatsapp-media` v16 (JWT obrigatório, IA bloqueada por padrão). Não foram habilitados áudios para IA.

A execução MCP usa uma operação de uso único criada exclusivamente pelo proprietário do banco, hash SHA-256, validade de cinco minutos e lotes seriais de até dez objetos. Só o JWT anon público passa pelo gateway; não são extraídas sessões humanas nem copiadas credenciais administrativas. O journal atribui a ação ao UUID da operação MCP, sem simular gestor. Claim e finish são exclusivos de service_role; só contagens são retidas no resultado. O despacho tem URL fixa e SECURITY INVOKER. Revisão adicional de fotos aprovou o mecanismo; sete testes SQL e um do handler foram acrescentados, totalizando 86 testes.

Dry-run remoto HTTP200: 21 fotos, 2 candidatas a quarentena, sem movimentação. Validação remota confirmou quatro políticas de fotos, oito de chat, journal com RLS, sem leitura por anon/authenticated, e diretório negado ao anônimo. Movimentação final, publicação e evidências de aceite serão registradas no fechamento da operação/PR340.

### Compatibilidade do Storage confirmada em produção

O HEAD dos links públicos removidos retornou HTTP400, impedindo o aceite conservador inicial. A Edge agora confere GET da mesma URL somente nesse caso, sem autenticação, parâmetro adicional ou bypass de cache. Aceita o formato legado apenas com Content-Type JSON, corpo máximo4KB, statusCode404 e código NoSuchKey/not_found. GET200/206, rede, redirect e erro genérico mantêm a pendência. A RPC final também exige origem ausente e cópia privada existente. Nove testes novos cobrem os caminhos; total atualizado95 (34 SQL/PGlite,35 Node,26 Deno). Código alinhado à documentação oficial: https://supabase.com/docs/guides/storage/debugging/error-codes.

### Aceite remoto das fotos — 01/11/2026

Migração encerrada:21/21 objetos concluídos,21 hashes SHA-256 verificados,21 cópias privadas presentes,2 em quarentena,19 referências canônicas atualizadas. Zero destinos ausentes, zero origens pessoais no bucket público, zero referências pessoais públicas atuais e zero falhas de objeto. Revogação dos links antigos conferida pela Edge antes de concluir cada job. Nenhuma operação em andamento. Última Edge de migração:v5, alinhada ao código final. Não houve descarte das duas fotos sem cadastro.

Advisors: os dois novos journals privados têm RLS sem políticas por negação intencional; anon/authenticated não os leem. Oito helpers autorizados passaram a constar no aviso genérico de SECURITY DEFINER para authenticated, com guardas e search_path vazio verificados. Os avisos anteriores de search_path(2), funções anônimas(14) e proteção de senhas permanecem fora deste lote; não foi declarada auditoria integral sem pendências.
