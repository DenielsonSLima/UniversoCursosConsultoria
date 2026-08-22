# Ambiente Local e Configuração

Status: CANÔNICO. Última revisão: 2026-08-12.

## Pré-requisitos

- Node.js 24, conforme .nvmrc e package.json.
- npm.
- Acesso autorizado ao projeto Supabase, GitHub e Vercel quando a tarefa
  exigir operação remota.
- Ferramentas nativas apenas para Android ou iOS.

## Inicialização web

1. Instale dependências com npm install.
2. Copie somente os valores públicos de .env.example para .env.local.
3. Configure URL e chave pública do Supabase.
4. Execute npm run dev.
5. Abra a aplicação local e valide a rota do módulo em alteração.

Não copie .env.local, .env.production ou arquivos de segredo para a
documentação, commits, capturas de tela ou chats.

## Matriz de configuração

| Onde configurar | Conteúdo permitido |
| --- | --- |
| .env.example | Nomes e exemplos fictícios de variáveis públicas. |
| .env.local | Valores locais privados, nunca versionados. |
| Frontend VITE_ | Somente valores seguros para o navegador. |
| Supabase Vault e Edge Functions | Credenciais de serviço, gateway, webhook e APIs externas. |
| Supabase Auth | URLs de redirecionamento, provedores e regras de sessão. |
| Vercel | Variáveis de build, domínio, headers e rewrites. |
| Firebase e APNs | Configuração de push e assinatura do aplicativo. |
| Capacitor | Identidade e comportamento do app, sem segredos. |

## Variáveis públicas conhecidas

Consulte .env.example para os nomes oficiais. Os grupos atuais incluem:

- modo da aplicação e URL pública;
- URL e chave pública do Supabase;
- chave de site do Turnstile;
- URL do desafio Turnstile nativo;
- origens permitidas para redirecionamento.

Nomes de segredos podem ser registrados como categoria no guia, mas seus
valores, chaves privadas, tokens bancários, service role e dados pessoais
nunca devem ser registrados.

## Supabase local e remoto

supabase/config.toml descreve o ambiente local, Auth, Realtime, Storage e
migrations. Migrations são uma história ordenada do banco e não devem ser
editadas após aplicação.

Pela política deste projeto, banco, Auth, Storage, migrations e Edge Functions
remotos são operados somente pelos conectores autorizados do Supabase. Não
substitua esse caminho por script local, REST direto ou CLI para produção.

## Aplicativo nativo

Use npm run app:check antes de sincronizar o Capacitor. Os comandos de cópia,
sync e build estão em package.json e internal/empacotamento/. Nunca publique
chaves de assinatura, arquivos locais de plataforma ou credenciais push.

