# Decisão: autenticação nativa e notificações ricas do aluno

Data: 2026-08-04

## Contexto

O portal do aluno roda na Web e dentro dos aplicativos Capacitor para Android e iOS. O fluxo nativo precisa voltar ao aplicativo depois do OAuth, abrir notificações comuns em uma tela de detalhe, encaminhar notificações de chat diretamente à conversa e suportar campanhas com imagem sem colocar regras de negócio no frontend.

## Decisões

- O callback OAuth nativo é `br.com.universocc.aluno://auth/callback`. O bridge registra o processamento antes de aguardar a troca de sessão, deduplica callbacks e preserva o estado pendente quando o navegador externo fecha antes do evento de URL.
- Cloudflare Turnstile usa uma página nativa dedicada, com watchdog e estados explícitos de carregamento, sucesso e erro. O login não confunde um iframe vazio com desafio concluído.
- A rota nativa do Turnstile é reescrita para a entrada Vite isolada `native-turnstile.html`. Ela não carrega React, o splash nem qualquer marca da Universo; o iframe contém exclusivamente o contêiner da Cloudflare, inclusive durante o bootstrap.
- O shell WKWebView/Android WebView não aplica bounce, overscroll ou zoom à página inteira. Login e cadastro usam a altura real de `visualViewport`; somente regiões internas comprovadamente maiores que a área útil podem rolar.
- Notificações comuns abrem `/aluno/?module=notificacoes&notificationId=<uuid>`; quando só existe o job, usam `sourceJobId`. Notificações de chat mantêm o deep link direto à conversa.
- A caixa de notificações usa paginação keyset de 20 itens com `snapshotAt`, `visibleAt` e `id`. Atualizações Realtime invalidam a lista com debounce; o contador não refaz todas as páginas.
- Imagens são recebidas somente pela Edge Function autenticada `push-notification-assets`, validadas por assinatura, dimensões e tamanho, têm metadados removidos e recebem caminho imutável `campaigns|birthday/<uuid>.(jpg|jpeg|png)` no bucket público `push-notification-images`.
- O dispatcher constrói a URL pública canônica; caminhos e URLs fornecidos livremente pelo cliente são ignorados. Android/FCM e APNs recebem imagem rica, mas qualquer erro preserva a notificação textual.
- No iOS, uma Notification Service Extension converte `image_url` em `UNNotificationAttachment`, com HTTPS obrigatório, timeout, limite de tamanho e fallback idempotente.
- Felicitações e comunicados de relacionamento usam finalidade própria `relacionamento`, política `push-relationship-birthday-v1` e escolha explícita Sim/Não sem pré-seleção. A decisão é separada dos Termos e da permissão nativa, permanece auditável e pode ser revogada.
- Publicidade comercial continua na finalidade `marketing`, exige a política independente `push-commercial-marketing-v1`, evidência de escopo comercial e aluno com pelo menos 18 anos. Não existe concessão implícita nem migração automática do consentimento antigo; na ausência do fluxo jurídico específico, campanhas comerciais falham fechado.
- O dispatcher revalida consentimento e política imediatamente antes do envio por uma RPC canônica em lote: aniversário consulta `relacionamento`; campanha genérica consulta `marketing` comercial. Alterações em qualquer uma das finalidades também cancelam de forma antecipada os jobs pendentes que deixaram de ser elegíveis.
- A agenda de aniversário, a seleção de alunos, matrícula elegível, data local `America/Maceio`, regra de 29/02 e idempotência aluno/ano ficam no Postgres. O frontend apenas coleta título, mensagem, horário e imagem e exibe o resultado canônico.
- A configuração de aniversário inicia desativada e exige imagem pronta para ser habilitada. O agendador executa a cada cinco minutos e nunca duplica o envio do mesmo aluno no mesmo ano.

## Limites de validação

- O simulador iOS valida build, callback, navegação e o empacotamento da extensão, mas não comprova a entrega APNs real; isso exige iPhone físico com credenciais APNs/FCM válidas.
- Testes de paginação em produção devem usar registros temporários claramente marcados e removê-los após a evidência.
- O Turnstile deve ser validado em Safari e nos WebViews nativos. Resolver o CAPTCHA continua sendo uma ação humana/confirmada no momento do teste.
- Alterações React/CSS são empacotadas no binário Capacitor. Uma publicação Web/Vercel não atualiza sozinha aplicativos já instalados; é necessário gerar e instalar/distribuir um novo build iOS/Android.
- A referência de build para esta entrega é sistema `2.2.3-beta.26`, iOS build `26`, Android `versionCode 26` e Node.js `24.x`.

## Arquivos centrais

- `modules/shared/auth/NativeAuthBridge.tsx`
- `modules/aluno/native-app/native-app.bridge.ts`
- `modules/aluno/notificacoes/`
- `modules/gestor/comunicacao/notificacoes-push/`
- `supabase/functions/push-notification-assets/`
- `supabase/functions/push-notification-dispatcher/`
- `ios/App/NotificationServiceExtension/`
- `supabase/migrations/20260804145000_paginate_student_notification_inbox.sql`
- `supabase/migrations/20260804151000_create_rich_push_and_birthday_settings.sql`
- `supabase/migrations/20260804203000_separate_relationship_birthday_consent.sql`
