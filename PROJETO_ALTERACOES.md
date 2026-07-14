# Histórico de Alterações do Projeto

> Arquivo mantido automaticamente pelo Claude/Antigravity.
> Cada entrada registra o que foi feito, o contexto e o impacto.

---

## 2026-07-13 — Cadastro Publico Sincronizado Com Auth

**O que foi feito:**
- Removido o teste `bruna.alves0999@gmail.com` de `parceiros` e `auth.users` via MCP Supabase para permitir reteste limpo do fluxo.
- Confirmado que o modulo Parceiros usa TanStack Query (`useQuery`, `useMutation`, `useQueryClient`) e Realtime (`postgres_changes` na tabela `parceiros`) para invalidar cache e atualizar a tela.
- Criada e aplicada via MCP Supabase a migration `20260714015500_sync_public_signup_auth_to_partner.sql`.
- A RPC `finalizar_cadastro_publico_aluno` agora grava `polo_id` e `polo_ids` da Matriz, evitando aluno criado fora do escopo visivel no gestor.
- Criado trigger `trg_sync_public_aluno_auth_profile` em `auth.users` para criar/atualizar automaticamente o registro do aluno em `parceiros` quando o Auth recebe metadata do fluxo `cadastro_publico_ead`.

**Por que:**
- Quando a confirmacao de e-mail esta ativa, `auth.signUp` cria o usuario no Auth mas pode nao devolver sessao para o frontend finalizar a RPC. Isso deixava usuario em Auth sem perfil em `parceiros`, e o gestor nao enxergava o aluno.

**Arquivos afetados:**
- `supabase/migrations/20260714015500_sync_public_signup_auth_to_partner.sql`
- `PROJETO_ALTERACOES.md`

**Validacao:**
- Bruna removida: `parceiros=0`, `auth.users=0`.
- Trigger `trg_sync_public_aluno_auth_profile` ativo em `auth.users` para `INSERT` e `UPDATE`.
- `finalizar_cadastro_publico_aluno`: `authenticated` executa e `anon` nao executa.
- Modulo Parceiros confirmado com `useParceirosQueries`, `useParceirosMutations` e `useParceirosRealtime`.

---

## 2026-07-13 — Cadastro Publico de Aluno Sem Insert Anonimo

**O que foi feito:**
- Revisado o fluxo de cadastro publico do aluno na tela de login.
- Removida a tentativa do navegador anonimo inserir/atualizar diretamente a tabela `parceiros`.
- Criada e aplicada via MCP Supabase a RPC autenticada `finalizar_cadastro_publico_aluno`, responsavel por validar CPF, telefone, e-mail, termos e finalizar/criar o perfil de aluno.
- Ajustado o frontend para salvar os dados do cadastro no metadata do Supabase Auth e finalizar o perfil por RPC quando houver sessao autenticada.
- Adicionado fallback para e-mail ja criado pelo fluxo anterior com falha: se a senha confere, o sistema entra e conclui o perfil do aluno.
- Ajustadas as policies de insert em `parceiros` para separar cadastro self-service de aluno e cadastro por gestor.

**Por que:**
- O cadastro falhava apos `auth.signUp` porque o cliente anonimo tentava inserir em `parceiros` e batia em RLS/function sem grant, gerando `permission denied for function is_partner_in_gestor_scope`.

**Arquivos afetados:**
- `modules/public/login/aluno-public-auth.service.ts`
- `supabase/migrations/20260713183000_fix_public_aluno_signup_flow.sql`
- `PROJETO_ALTERACOES.md`

**Validacao:**
- Migration aplicada com sucesso pelo MCP Supabase.
- RPC existe como `SECURITY DEFINER`; `authenticated` executa, `anon` nao executa.
- `anon` nao possui mais grants diretas de `SELECT/INSERT/UPDATE` em `parceiros`.
- `./node_modules/.bin/eslint modules/public/login/aluno-public-auth.service.ts --plugin react-hooks --rule react-hooks/rules-of-hooks:error`
- `npm run build`

---

## 2026-07-13 — Regra Absoluta Supabase Somente Via MCP

**O que foi feito:**
- Criado `AGENTS.md` na raiz do projeto com a regra critica: nenhuma chamada `supabase ...` deve ser executada neste projeto.
- Atualizados os arquivos de memoria e skills para deixar explicito que banco, migrations, logs, Auth, Storage, RLS e Edge Functions devem usar somente MCP Supabase.
- Removidas instrucoes auxiliares que ensinavam comandos da Supabase CLI em documentos de ambiente/FAQ/CI.
- Registrada a mesma proibicao na skill global `supabase-postgres-best-practices`.

**Por que:**
- O projeto ja possui MCP Supabase autorizado e a Supabase CLI ja apresentou falha `401 Unauthorized`; tentar a CLI quebra o fluxo e contradiz a regra operacional do projeto.

**Arquivos afetados:**
- `AGENTS.md`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`
- `pasta sem título/memory/SKILL.md`
- `pasta sem título/Acesso/SKILL.md`
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/senior-dev-skill-v2-2/AMBIENTE.md`
- `pasta sem título/senior-dev-skill-v2-2/FAQ.md`
- `pasta sem título/senior-dev-skill-v2-2/capitulos/17-ci-cd-automacao.md`
- `/Users/denielson/.agents/skills/supabase-postgres-best-practices/SKILL.md`

---

## 2026-07-12 — Automacoes WhatsApp Recolhidas e Modalidades por Aviso

**O que foi feito:**
- Os cards de automacao financeira do WhatsApp agora ficam recolhidos por padrao.
- Cada aviso possui botao proprio de salvar, evitando salvar todas as regras de uma vez.
- Adicionada selecao de modalidades por aviso: EAD, Tecnico, Livres, Especializacao e Superior.
- O salvamento das automacoes foi separado da configuracao sensivel da API; token e credenciais continuam pela Edge Function, enquanto regras de aviso gravam apenas campos nao sensiveis em `mensageria_config`.
- Criada migracao para armazenar as modalidades permitidas de cada automacao no Supabase.
- A aba de Configuracoes do WhatsApp passou a consumir o resumo financeiro calculado no banco pela RPC `whatsapp_usage_summary`, sem calculo de custo no frontend.
- Aplicadas no Supabase remoto as migracoes de modalidades e resumo de uso mensal do WhatsApp.

**Arquivos afetados:**
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `modules/gestor/configuracoes/mensageria/mensageria.service.ts`
- `modules/gestor/configuracoes/mensageria/MensageriaConfig.tsx`
- `modules/gestor/comunicacao/components/whatsapp/WhatsAppSettingsPanel.tsx`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp.service.ts`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp.types.ts`
- `supabase/functions/whatsapp-config/index.ts`
- `supabase/migrations/20260712235000_whatsapp_usage_billing_server_side.sql`
- `supabase/migrations/20260713001000_whatsapp_automation_modalities.sql`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Comunicação Como Submódulos no Menu Lateral

**O que foi feito:**
- O módulo **Comunicação** passou a usar submódulos expansivos no menu lateral, seguindo o mesmo padrão de **Cadastros**.
- Criados os submódulos **Mensagem** e **WhatsApp** dentro de Comunicação.
- Removida a barra superior interna que alternava entre Interna/WhatsApp/Atendimentos/Configurações.
- A tela de Mensagem abre diretamente os atendimentos internos; a tela de WhatsApp abre diretamente o atendimento externo e automações.
- Compactado o cabeçalho do WhatsApp para remover títulos e descrições duplicadas, mantendo apenas a barra operacional com conversas, automações, atrasados, status da API e iniciar conversa.
- Removido o painel lateral informativo do início do WhatsApp, incluindo status da API, avisos ativos, atrasos, automações, ver atrasados e webhook.
- Adicionada seleção de conversas WhatsApp, seleção em massa do filtro atual e ação para apagar conversas selecionadas com confirmação.

**Por quê:**
- A navegação duplicada no topo deixava a tela confusa. Separar os canais no menu lateral deixa claro que Mensagem e WhatsApp são áreas diferentes dentro de Comunicação.

**Arquivos afetados:**
- `modules/gestor/gestor.page.tsx`
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Automação WhatsApp Separada por Evento Financeiro

**O que foi feito:**
- Remodelada a aba **Automações** do WhatsApp em cartões verticais separados: aviso de vencimento, aviso de recebimento, aviso de atraso e múltiplas parcelas em atraso.
- O aviso de vencimento agora deixa claro que só deve disparar para aluno com parcela aberta/ainda não paga e mantém configuração de dias antes do vencimento.
- O aviso de recebimento fica separado e representa a mensagem enviada na confirmação/baixa do pagamento.
- O aviso de atraso comum mantém dias após vencimento e texto próprio para parcela vencida.
- Criada a regra **Múltiplas parcelas em atraso**, com quantidade mínima configurável de parcelas vencidas e template próprio usando `{{quantidade_parcelas}}` e `{{valor_total_atrasado}}`.
- Diferenciada a leitura visual de cada regra: vencimento, recebimento, atraso e múltiplas parcelas agora usam cor, numeração, gatilho, público-alvo e variáveis próprias.
- Aplicadas migrations remotas para os novos campos em `mensageria_config` e republicada a Edge Function `whatsapp-config` para persistir os novos templates.

**Por quê:**
- A tela anterior agrupava três comportamentos diferentes em um único bloco e só permitia personalizar o texto de atraso, dificultando entender quando cada aviso seria enviado.

**Arquivos afetados:**
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `modules/gestor/configuracoes/mensageria/MensageriaConfig.tsx`
- `modules/gestor/configuracoes/mensageria/mensageria.service.ts`
- `supabase/functions/whatsapp-config/index.ts`
- `supabase/migrations/20260712214000_whatsapp_automation_templates.sql`
- `supabase/migrations/20260712221000_whatsapp_multiple_overdue_automation.sql`
- `supabase/migrations/20260712222000_normalize_whatsapp_student_placeholders.sql`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Segurança dos Segredos WhatsApp Meta

**O que foi feito:**
- Criada e aplicada a migration `20260712174000_secure_whatsapp_meta_secrets.sql`, com RPCs `whatsapp_set_secret` e `whatsapp_get_secret` restritas ao `service_role` para armazenar tokens no Supabase Vault.
- Movido o access token da Meta para o Vault e zerada a coluna `mensageria_config.wa_token`; a conferência remota retornou `token_removido_da_tabela=true` e `token_no_vault=true`.
- Atualizada e republicada a Edge Function `whatsapp-send` (versão 3, `verify_jwt=true`) para ler `whatsapp_meta_access_token` via Vault/RPC, sem buscar token na tabela.
- Criada e publicada a Edge Function `whatsapp-config` (versão 1, `verify_jwt=true`) para salvar configuração do WhatsApp e gravar/substituir tokens diretamente no Vault.
- Ajustado `mensageria.service.ts` para chamar `whatsapp-config` ao salvar WhatsApp, impedindo novas gravações de token pela tela em `mensageria_config`.

**Por quê:**
- Tokens da Meta são segredos de servidor e não podem ficar disponíveis em tabela comum, payload público de configuração ou chamada direta do navegador.

**Arquivos afetados:**
- `modules/gestor/configuracoes/mensageria/mensageria.service.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/functions/whatsapp-config/index.ts`
- `supabase/migrations/20260712174000_secure_whatsapp_meta_secrets.sql`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Modal de Iniciar Conversa WhatsApp

**O que foi feito:**
- Removida a aba operacional **Iniciar conversa** do WhatsApp e substituída por botão direto que abre modal de busca.
- O modal permite digitar e selecionar aluno, exibindo nome, CPF formatado, telefone formatado, e-mail, polo/cidade e campo de mensagem antes do envio.
- O aluno deixa de ser selecionado automaticamente; a seleção acontece somente por clique do usuário.
- Melhorado o tratamento de erro do envio WhatsApp para tentar exibir a mensagem real retornada pela Edge Function/Meta.
- Adicionado aviso contextual sobre teste da Meta: destinatário precisa estar liberado no painel de teste e, fora da janela de atendimento, o envio inicial deve usar template aprovado.

**Por quê:**
- A aba separada confundia o fluxo principal. Para o usuário comum, iniciar conversa deve ser uma ação rápida a partir da caixa de conversas, com conferência clara dos dados do aluno.

**Arquivos afetados:**
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Webhook e Caixa Real do WhatsApp

**O que foi feito:**
- Criada e aplicada a migration `20260712182000_whatsapp_conversations_and_webhook_events.sql` com as tabelas `whatsapp_conversas`, `whatsapp_mensagens` e `whatsapp_webhook_events`.
- Criado módulo compartilhado `supabase/functions/_shared/whatsapp.ts` para normalização de telefone, vínculo com aluno, criação de conversa e gravação de mensagens.
- Publicada a Edge Function `whatsapp-webhook` (versão 1, `verify_jwt=false`) para verificação GET da Meta e recebimento POST de mensagens/status.
- Republicada a Edge Function `whatsapp-send` (versão 4, `verify_jwt=true`) para gravar mensagens enviadas na caixa externa.
- Configurado o verify token temporário do webhook no Vault e testada a URL pública com `hub.challenge`, retornando corretamente o desafio de validação.
- Modularizado o frontend WhatsApp em `components/whatsapp/` com `whatsapp.service.ts`, `whatsapp.types.ts`, `whatsapp.utils.ts` e `WhatsAppInbox.tsx`.
- A tela WhatsApp agora lê conversas reais de `whatsapp_conversas`, histórico de `whatsapp_mensagens` e usa Realtime para atualizar a caixa.
- Removidos botões grandes duplicados de iniciar conversa; ficou apenas o botão principal no topo e um ícone discreto na lista.

**Por quê:**
- O envio pela API não bastava para atendimento externo: respostas do aluno só entram no sistema quando a Meta chama um webhook publicado e esse webhook grava a conversa no banco.

**Arquivos afetados:**
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `modules/gestor/comunicacao/components/whatsapp/WhatsAppInbox.tsx`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp.service.ts`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp.types.ts`
- `modules/gestor/comunicacao/components/whatsapp/whatsapp.utils.ts`
- `supabase/functions/_shared/whatsapp.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/migrations/20260712182000_whatsapp_conversations_and_webhook_events.sql`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Iniciar Conversa no Módulo Comunicação

**O que foi feito:**
- Adicionado o fluxo **Iniciar conversa** no canal interno do módulo Comunicação, listando alunos diretamente do cadastro e criando/abrindo atendimento em `comunicacao_chats` sem exigir telefone.
- O botão fica no painel de atendimentos internos; ao iniciar, grava a primeira mensagem do gestor em `comunicacao_mensagens`, seleciona o atendimento pendente e mantém o fluxo Supabase Realtime já existente.
- Ajustado o canal WhatsApp para ter aba **Iniciar conversa** focada em alunos, com busca por aluno/telefone/CPF/cidade e envio externo usando o telefone do aluno.
- Criada e publicada no Supabase remoto a Edge Function `whatsapp-send`, que valida gestor ativo, lê a configuração em `mensageria_config`, mantém o token fora do navegador e chama a Meta Cloud API `/messages`.
- Confirmado que o módulo Parceiros não recebeu alteração funcional para esse fluxo.

**Por quê:**
- O fluxo de conversa deve pertencer ao módulo Comunicação. Atendimento interno não depende de telefone porque ocorre dentro do portal; WhatsApp depende do número do aluno e deve passar por backend seguro para usar a API oficial da Meta.

**Arquivos afetados:**
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `modules/gestor/comunicacao/components/StartInternalConversationModal.tsx`
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `supabase/functions/whatsapp-send/index.ts`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Remodelagem Visual da Central de Comunicação

**O que foi feito:**
- Remodelada a hierarquia visual da Central de Comunicação para priorizar conversas, inspirada em uma caixa de entrada de WhatsApp clara.
- A comunicação interna recebeu lista lateral mais legível, filtros com contadores, mensagens com bolhas maiores e campo de resposta mais parecido com mensageria.
- A primeira aba do WhatsApp deixou de ser um painel de cards e passou a ser uma caixa de entrada com coluna de conversas, área central de chat e painel lateral de ações/status.
- Reduzidos `font-black`, `tracking-widest` e microtextos no módulo Comunicação, aproximando o padrão tipográfico do Dashboard/Início do gestor.
- Ajustadas também as telas auxiliares do módulo, incluindo modal de iniciar conversa, configurações e automações.

**Por quê:**
- A tela anterior misturava atendimento, configurações, API e indicadores financeiros no primeiro contato, deixando confuso onde ver conversas abertas e responder alunos. A nova estrutura deixa o uso diário mais direto: escolher conversa, responder e acionar tarefas secundárias quando necessário.

**Arquivos afetados:**
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `modules/gestor/comunicacao/components/StartInternalConversationModal.tsx`
- `modules/gestor/comunicacao/components/ComunicacaoConfig.tsx`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-12 — Fase 1 da Integração WhatsApp Meta Cloud API

**O que foi feito:**
- Reorganizada a tela de Configurações > Mensageria para virar uma configuração dedicada de **WhatsApp Business API**.
- Removida a aba de SMTP da tela de mensageria e adicionadas abas **Resumo** e **Configurar API**.
- Adicionados campos próprios da Meta Cloud API: WABA ID, Phone Number ID, App ID, versão Graph API, número exibido, verify token do webhook, token de acesso, qualidade, limite de mensagens, moeda e saldo estimado.
- Criado painel operacional em Comunicação com separação entre **Interna** e **WhatsApp**.
- Mantido o fluxo interno atual de chamados aluno/professor sem alteração de comportamento.
- Adicionada aba WhatsApp no módulo Comunicação com conversas, automações e lista de parcelas em atraso para disparo futuro.
- Criada migração local `20260712170000_whatsapp_meta_messaging_config.sql` com os novos campos de configuração e regras de automação.

**Por quê:**
- O app da Meta já foi criado e o próximo passo é sair de uma configuração genérica de provedores não oficiais para uma base compatível com a documentação oficial da WhatsApp Business Platform.
- O envio real precisa passar por Supabase Edge Function/webhook para proteger o token da Meta, registrar tentativas e receber mensagens/status por webhook.

**Arquivos afetados:**
- `modules/gestor/configuracoes/mensageria/MensageriaConfig.tsx`
- `modules/gestor/configuracoes/mensageria/mensageria.service.ts`
- `modules/gestor/configuracoes/mensageria/components/WhatsAppSummaryTab.tsx`
- `modules/gestor/configuracoes/mensageria/components/WhatsAppApiConfigTab.tsx`
- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/comunicacao/ComunicacaoPage.tsx`
- `modules/gestor/comunicacao/components/WhatsAppCommunicationPanel.tsx`
- `supabase/migrations/20260712170000_whatsapp_meta_messaging_config.sql`
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`

---

## 2026-07-03 — Otimização de URLs Canônicas para SEO (Google Search Console)

**O que foi feito:**
- Atualizado o gerador de links canônicos em `SeoManager.tsx` para remover automaticamente a barra final (trailing slash) dos caminhos (ex: `/contato/` se torna `/contato`), exceto na raiz `/`.
- Esta alteração garante alinhamento absoluto com as URLs listadas em `public/sitemap.xml`.

**Por quê:**
- Resolver avisos do Google Search Console sobre "Páginas com redirecionamento" ou "Página alternativa com tag canônica adequada" geradas por divergências de barras finais e garantir a correta indexação das páginas principais.

**Arquivos afetados:**
- `modules/public/components/SeoManager.tsx`

---

## 2026-06-27 — Ledger MCP de Migrations Financeiro/Biblioteca

**O que foi feito:**
- Registrado em `ai/rag`, `ai/memoria` e `ai/skil` o ledger das migrations ja aplicadas/validadas no Supabase remoto via MCP.
- Documentada a regra de consultar `list_migrations` pelo MCP antes de aplicar ou marcar como pendente qualquer migration local.
- Removidas migrations locais nao rastreadas desta leva que ja estavam aplicadas/validadas no remoto, para evitar falso positivo de pendencia local.
- Ajustado o formulario de Transferencias para preencher por padrao a descricao `Transferência entre contas` apenas em novo lancamento.

**Por quê:**
- Evitar repeticao do erro operacional de reaplicar migrations antigas ou reportar como pendente algo que ja existe no remoto.
- Manter o modulo financeiro seguindo a regra de calculos por RPC no banco, com o frontend apenas visual/cache.

**Arquivos afetados:**
- `modules/gestor/financeiro/transferencias/TransferenciasTab.tsx`
- `ai/rag/supabase-mcp-operacoes-remotas.md`
- `ai/memoria/supabase-mcp-operacoes-remotas.md`
- `ai/skil/supabase-mcp-operacoes-remotas.md`

---

## 2026-06-26 — Regra Obrigatória de Supabase Remoto via MCP

**O que foi feito:**
- Reforçada no RAG a regra de que operações remotas do Supabase devem usar MCP, não Supabase CLI.
- Documentado que erro `401 Unauthorized` da CLI não é bloqueio quando o MCP Supabase está disponível e autorizado.
- Atualizada a skill de acesso Supabase para incluir deploy/listagem/leitura de Edge Functions via MCP.
- Atualizada a skill de memória persistente para registrar a regra como comportamento obrigatório.
- Atualizada a skill sênior com a nova Regra 19: Supabase remoto sempre via MCP.
- Ajustado o documento de ambiente para deixar Supabase CLI como ferramenta local opcional, nunca caminho de deploy remoto.
- Criado registro específico em `ai/rag/supabase-mcp-operacoes-remotas.md`.

**Por quê:**
- Evitar repetição do erro operacional em que o agente tenta usar Supabase CLI, encontra `401 Unauthorized` e trata isso como bloqueio, apesar de o MCP ter autorização para migrations e Edge Functions.

**Arquivos afetados:**
- `PROJETO_CONTEXTO.md`
- `PROJETO_ALTERACOES.md`
- `ai/rag/supabase-mcp-operacoes-remotas.md`
- `pasta sem título/Acesso/SKILL.md`
- `pasta sem título/memory/SKILL.md`
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/senior-dev-skill-v2-2/AMBIENTE.md`

---

## 2026-06-26 — Supabase MCP, RLS de Templates e Deploy Asaas

**O que foi feito:**
- Registrada no RAG a decisão operacional de usar MCP Supabase para operações remotas e evitar Supabase CLI neste projeto.
- Aplicada via MCP a migration `secure_documentos_templates_rls`, ativando RLS em `public.documentos_templates`.
- Criadas políticas para manter leitura pública apenas dos registros `validation_%` usados pelo validador público, e leitura/escrita de templates para usuários autenticados.
- Deploy via MCP das Edge Functions `asaas-webhook` e `asaas-api`.

**Impacto:**
- O alerta crítico de RLS desativado em `documentos_templates` foi corrigido sem bloquear o validador público.
- As regras novas de Asaas para desconto, multa e juros por tipo de cobrança passam a estar publicadas na function remota.

**Arquivos afetados:**
- `PROJETO_CONTEXTO.md`
- `supabase/migrations/20260626213000_secure_documentos_templates_rls.sql`
- `supabase/functions/asaas-api/index.ts`
- `supabase/functions/asaas-api/shared.ts`
- `supabase/functions/asaas-api/asaas-http.ts`
- `supabase/functions/asaas-webhook/index.ts`

---

## 2026-06-20 — Migração de Templates e Configurações para o Supabase

**O que foi feito:**
- Migração total de persistência de `localStorage` para a tabela online `documentos_templates` no Supabase.
- Atualização do `carteirinha.service.ts`, `declaracao.service.ts`, `irpf.service.ts`, `estagio.service.ts`, `cracha.service.ts` e `diploma.service.ts` para ler e salvar direto no Supabase.
- Criação do `academicos.service.ts` para gerenciar parâmetros globais de matrícula e templates de texto de certificados.
- Sincronização dos parâmetros em `useEffect` nas páginas `AcademicosConfig.tsx` e `SecretariaCarteirinhasPage.tsx`.
- Remoção de alertas nativos do navegador (`alert()`) no painel de configurações acadêmicas, substituídos pelo hook e componente `ToastNotification`.
- Inclusão da regra de ouro de não usar `localStorage` para dados estruturais nos arquivos de Skill (`senior-dev-skill-v2-2/SKILL.md` e `memory/SKILL.md`).

**Por quê:**
- Garantir que diferentes usuários e navegadores em uma plataforma escolar online acessem exatamente as mesmas configurações e layouts sincronizados em tempo real, sem perdas locais de dados.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service.ts`
- `modules/gestor/cadastros/modelos-documentos/declaracao/declaracao.service.ts`
- `modules/gestor/cadastros/modelos-documentos/irpf/irpf.service.ts`
- `modules/gestor/cadastros/modelos-documentos/estagio/estagio.service.ts`
- `modules/gestor/cadastros/modelos-documentos/cracha/cracha.service.ts`
- `modules/gestor/cadastros/modelos-documentos/diploma/diploma.service.ts`
- `modules/gestor/configuracoes/assinaturas/assinaturas.service.ts`
- `modules/gestor/configuracoes/academicos/academicos.service.ts`
- `modules/gestor/configuracoes/academicos/AcademicosConfig.tsx`
- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/memory/SKILL.md`

---

## 2026-06-20 — Atualização de Padrões de RAG, Skills de Engenharia Sênior e Contexto

**O que foi feito:**
- Atualização do Guia de Engenharia Sênior (`senior-dev-skill-v2-2/SKILL.md`) elevando as Regras de Ouro de 16 para 18 regras:
  - **REGRA 12:** Proibição explícita de cálculos de negócio/financeiros no cliente, exigindo delegação via Supabase RPC.
  - **REGRA 16:** Expansão da proibição de `localStorage` para qualquer dado de negócio ou persistência estrutural.
  - **REGRA 17:** Proibição absoluta de mensagens nativas no navegador (`alert`, `confirm`, `prompt`), padronizando o uso das notificações toast da UI.
  - **REGRA 18:** Normas para atuação cooperativa com subagentes e atualização constante do RAG.
- Atualização da Skill de Memória do Agente (`memory/SKILL.md`) adicionando as mesmas obrigações de comportamento na tabela de protocolos.
- Atualização do arquivo de contexto (`PROJETO_CONTEXTO.md`) para registrar formalmente a arquitetura com Supabase RPC, Realtime, TanStack Query e as proibições correspondentes.

**Por quê:**
- Garantir que qualquer agente autônomo subsequente ou desenvolvedor humano siga o mesmo modelo rigoroso de segurança, UX de notificação, realtime e integridade multitenant do banco de dados sem persistência no navegador.

**Arquivos afetados:**
- `pasta sem título/senior-dev-skill-v2-2/SKILL.md`
- `pasta sem título/memory/SKILL.md`
- `PROJETO_CONTEXTO.md`

---

## 2026-06-26 — Modularização Complementar de Turmas Técnicas

**O que foi feito:**
- Separação da grade curricular da turma técnica em service, types e hooks:
  - queries de grade, professores, aulas e métricas ficam em `turma-grade.service.ts`.
  - mutações de docente, conclusão de disciplina e aulas ficam em `useTurmaGrade.ts`.
- Separação do módulo de estágio em service, types e hooks:
  - carregamento de disciplinas/alunos, avaliações salvas, checklist e ficha inicial saiu do componente.
  - cálculo e salvamento da avaliação usam hooks com invalidação pelo TanStack Query.
- Separação do diário de classe:
  - queries e mutations migradas para `diario-classe.service.ts` e `useDiarioClasse.ts`.
  - realtime do diário isolado em `useDiarioRealtime.ts`.
  - query keys centralizadas em `diario-classe.keys.ts`.
- Separação da configuração financeira da turma:
  - leitura/salvamento/RPC e geração de cronograma migrados para `financeiro-config.service.ts`.
  - hooks de configuração, cálculo financeiro e salvamento em `useFinanceiroConfig.ts`.
- Separação da aba de alunos da turma técnica:
  - tabela, modal de matrícula, modal de confirmação financeira e modal de movimentação acadêmica migrados para componentes próprios.
  - `TurmaAlunos.tsx` ficou responsável apenas por orquestrar estado, hooks e ações de alto nível.
- Separação da Edge Function `asaas-webhook`:
  - entrypoint reduzido para roteamento, autenticação e dispatch de eventos.
  - handlers de recebíveis e links de pagamento movidos para `handlers.service.ts`.
  - helpers compartilhados e cliente HTTP do Asaas movidos para `shared.ts` e `asaas-http.ts`.

**Validação:**
- `npm run build` executado após cada bloco principal, mantendo o build verde.
- Bundle local do `asaas-webhook` validado via esbuild.
- Deploy remoto do `asaas-webhook` feito via MCP Supabase, confirmado como versão 8 ativa e `verify_jwt=false`.

**Arquivos afetados:**
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-grade.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaGrade.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaEstagio.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/turma-estagio.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/turma-estagio.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaEstagio.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.keys.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-classe.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioClasse.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfig.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-config.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useFinanceiroConfig.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/TurmaAlunosTable.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/MatricularAlunoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/ConfirmarMatriculaModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/academic-lifecycle.keys.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/asaas-webhook/handlers.service.ts`
- `supabase/functions/asaas-webhook/asaas-http.ts`
- `supabase/functions/asaas-webhook/shared.ts`

---

## 2026-06-26 — Modularização de Turmas, Financeiro Técnico, EAD e Asaas API

**O que foi feito:**
- Separação do detalhe de turma EAD em camadas de `types`, `keys`, `service`, hooks de queries/mutations e hook de realtime.
- Extração da listagem financeira de alunos da turma técnica para `financeiro-alunos.service.ts` e `useFinanceiroAlunos`, removendo fetch direto do componente.
- Ajuste do realtime da turma técnica para invalidar também a chave `financeiro-alunos` usada pelo TanStack Query.
- Separação da Edge Function `asaas-api` em módulos locais:
  - `billing.service.ts` para cliente Asaas, payload de cobrança, desconto, multa, juros e sincronização de recebíveis.
  - `online.service.ts` para reconciliação de pagamentos online e geração de links de cursos EAD/livres/especializações.
  - `carnet.service.ts` para montagem de carnês oficiais em PDF.
  - `asaas-http.ts` para chamadas HTTP e download de arquivos oficiais do Asaas.
  - `shared.ts` para CORS, ambiente, secrets, CPF e helpers compartilhados.
- Validação local com `npm run build`, bundle da Edge Function via esbuild e `git diff --check`.

**Observação operacional:**
- A refatoração local do `asaas-api` foi validada sem Supabase CLI. Qualquer deploy remoto posterior dessa Edge Function deve ser feito exclusivamente via MCP Supabase, enviando os arquivos necessários pela ferramenta `deploy_edge_function` ou equivalente. Erro `401 Unauthorized` da CLI não deve ser tratado como bloqueio para esse fluxo.

**Arquivos afetados:**
- `modules/gestor/gestao/ead/detalhes/TurmaEadDetalhes.tsx`
- `modules/gestor/gestao/ead/detalhes/ead-turma.types.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.keys.ts`
- `modules/gestor/gestao/ead/detalhes/ead-turma.service.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadQueries.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadMutations.ts`
- `modules/gestor/gestao/ead/detalhes/hooks/useTurmaEadRealtime.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-alunos.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useFinanceiroAlunos.ts`
- `modules/gestor/gestao/tecnicos/detalhes/hooks/useTurmaTecnicoRealtime.ts`
- `supabase/functions/asaas-api/index.ts`
- `supabase/functions/asaas-api/billing.service.ts`
- `supabase/functions/asaas-api/online.service.ts`
- `supabase/functions/asaas-api/carnet.service.ts`
- `supabase/functions/asaas-api/asaas-http.ts`
- `supabase/functions/asaas-api/shared.ts`

---

## 2026-06-20 — Correção do Modo de Mesclagem da Assinatura no Preview

**O que foi feito:**
- Correção da aplicação do modo de mesclagem (`mix-blend-mode: multiply`) no componente `CarteirinhaPreview.tsx`.
- Adicionado o estilo `mixBlendMode` ao `div` container pai absoluto da assinatura do diretor, além de mantê-lo na imagem (`img`).

**Por quê:**
- O `div` container absoluto cria um novo contexto de empilhamento (stacking context). Se o `mix-blend-mode` for aplicado apenas à imagem filha, ele mesclará com a cor transparente do `div` pai absoluto em vez da imagem de fundo do cartão. Aplicando no container absoluto, a mesclagem ocorre corretamente com o fundo da carteirinha.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview.tsx`

---

## 2026-06-20 — Correção do Carregamento de Assinatura Centralizada nos Editores

**O que foi feito:**
- Correção no carregamento das assinaturas centralizadas nos editores de Declaração, IRPF e Estágio (`DeclaracaoEditor.tsx`, `IRPFEditor.tsx` e `EstagioEditor.tsx`).
- O método `assinaturasService.getSignatures()` foi modificado para ser chamado com `await` dentro de um `onClick` declarado como `async`.

**Por quê:**
- O método `getSignatures()` é uma função assíncrona que retorna um `Promise<AssinaturasData>`. No código anterior, a chamada estava síncrona, fazendo com que o objeto de assinaturas fosse tratado como um objeto `Promise` e a URL da assinatura correspondente (`sigs[role.id]`) retornasse `undefined`. Com isso, a aplicação sempre exibia a mensagem de erro afirmando que a assinatura correspondente não estava cadastrada.

**Arquivos afetados:**
- `modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/irpf/components/IRPFEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/estagio/components/EstagioEditor.tsx`

---

## 2026-06-20 — Correção do Filtro de Status de Parceiros (ATIVO em Caixa Alta)

**O que foi feito:**
- Correção das queries que filtravam registros na tabela `parceiros` com `status = 'ativo'` (em letras minúsculas). As consultas foram atualizadas para buscar `status = 'ATIVO'` (em caixa alta).
- Arquivos modificados:
  - `TurmaGrade.tsx` (na busca de professores para vincular à turma).
  - `CalendarioPage.tsx` (na busca de professores para filtros da agenda).
  - `ComunicacaoConfig.tsx` (na busca de alunos e professores para o simulador de chatbot).

**Por quê:**
- No banco de dados PostgreSQL do Supabase, o status dos registros na tabela `parceiros` é armazenado em caixa alta (`'ATIVO'` e `'INATIVO'`), diferentemente das tabelas `polos` e `cursos` que utilizam minúsculas. Como as consultas faziam correspondência exata com `.eq('status', 'ativo')`, as buscas retornavam vazias.

**Arquivos afetados:**
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaGrade.tsx`
- `modules/gestor/calendario/CalendarioPage.tsx`
- `modules/gestor/comunicacao/components/ComunicacaoConfig.tsx`

---

## 2026-06-21 — Implementação do Histórico de Emissões (Secretaria Digital)

**O que foi feito:**
- Criação do submódulo **Histórico de Emissões** na Secretaria, listando todas as emissões oficiais de documentos com códigos de validação.
- Organização em abas por tipo de documento (`carteirinha`, `cracha_estagio`, `declaracao_matricula`, `declaracao_frequencia`, `declaracao_irpf`, `boletim`, `historico_escolar`, `rematricula`, `termo_estagio`, `transferencia`) com suporte a paginação de 10 registros por página.
- Adicionados filtros de busca em tempo real por nome do aluno, CPF ou código validador (buscando nativamente no JSONB de `dados_emissao`), além de filtro por Turma.
- Mapeamento dinâmico do ID do operador (`emitido_por`) com a tabela `usuarios_sistema` para exibir o nome do usuário que emitiu o documento. Caso seja nulo (emissões pelo portal do estudante), exibe "Aluno (Auto-emissão)".
- Implementação de um visualizador modal para geração de **Segunda Via** dos documentos:
  - Reutiliza `CarteirinhaPreview` e `CrachaPreview` para carteirinhas e crachás.
  - Renderiza layouts A4 universais mesclando placeholders como `{{ALUNO_NOME}}`, `{{ALUNO_CPF}}`, `{{CURSO_NOME}}` e montando chaves QR Code e assinaturas com base nas coordenadas absolutas do template.
  - Ao imprimir ou baixar a segunda via, o contador de emissões no banco de dados é incrementado de forma transacional e a lista é atualizada.
- Substituição de popups nativos do navegador (`alert()`) por notificações `ToastNotification` seguindo a regra de ouro do RAG.
- Criação de migração SQL (`20260621180000_grant_select_documentos_validacao.sql`) para conceder permissões de SELECT para o role `anon` na tabela `documentos_validacao` e ajustar a política de RLS, visto que a sessão administrativa atua localmente sob o token público (`anon`) nos cadastros de demonstração.

**Por quê:**
- Permitir controle detalhado e auditoria de todos os documentos gerados pela instituição, além de fornecer um canal centralizado para que a secretaria emita segundas vias oficiais (preservando o código de validação original e apenas registrando a quantidade de reemissões).

**Arquivos afetados:**
- `modules/gestor/secretaria/secretaria.service.ts`
- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/components/SecretariaDashboard.tsx`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `supabase/migrations/20260621180000_grant_select_documentos_validacao.sql`
- `PROJETO_ALTERACOES.md`


---
