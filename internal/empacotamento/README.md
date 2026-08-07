# Empacotamento do aplicativo Universo Cursos e Consultoria

Esta pasta concentra decisões, fontes visuais e checklists do aplicativo do aluno. Ela não é uma segunda aplicação: Android e iOS usarão o mesmo `dist` produzido pelo Vite.

## Identidade aprovada para desenvolvimento

- Nome exibido: `Universo Cursos e Consultoria`
- Nome funcional: `Portal do Aluno`
- Application ID Android: `br.com.universocc.aluno`
- Bundle ID iOS: `br.com.universocc.aluno`
- Entrada do app: `/aluno/login-app`
- Bundle web: `dist`
- Cor institucional: `#001a33`

O identificador deve ser considerado definitivo antes de cadastrar o aplicativo no Firebase ou nas lojas.

## Estrutura

```text
internal/empacotamento/
├── shared/              decisões e recursos usados nas duas plataformas
├── android/             roteiro, requisitos e QA Android
├── ios/                 roteiro, requisitos e QA iOS
├── setup-macos.md       estado e preparação local do Mac
└── check-prerequisites.mjs
```

O Capacitor foi configurado na raiz do repositório. As pastas desta área continuam sendo a documentação operacional e não afetam o site. Os projetos nativos serão gerados somente depois que o diagnóstico de pré-requisitos estiver totalmente aprovado.

## Etapas

1. **Preparação:** validar Node, Xcode e Android Studio; fechar identidade e fontes visuais.
2. **Scaffold Capacitor:** instalar versões compatíveis e criar a configuração na raiz. A geração dos projetos nativos encerra esta etapa depois que os pré-requisitos forem aprovados.
3. **Ponte nativa:** conectar Device, App, Preferences, Browser e o contrato `window.UniversoNativeApp`.
4. **Android primeiro:** build, sincronização, emulador, aparelho físico e APK de debug.
5. **iOS:** simulador, iPhone com Personal Team e correções específicas de WKWebView.
6. **Gates funcionais:** Turnstile, retorno do login Google, links externos, PDFs, downloads e pagamentos.
7. **Notificações:** FCM Android; depois APNs/FCM iOS.
8. **Publicação:** assinatura definitiva, políticas das lojas e builds de produção.

## Regra de atualização

- Dados do Supabase e serviços de backend chegam ao aplicativo imediatamente.
- Alterações de React, CSS, ícones ou plugins exigem `build`, sincronização e nova versão do aplicativo.
- O aplicativo de produção deve empacotar o `dist`; não deve usar `server.url` apontando para o site.

## Próximo comando de diagnóstico

```bash
node internal/empacotamento/check-prerequisites.mjs
```

Esse diagnóstico não instala nem altera ferramentas.

## Comandos preparados

```bash
npm run app:check
npm run build
npm run app:sync
npm run app:doctor
```

Use `npm run app:open:android` ou `npm run app:open:ios` somente depois da criação dos respectivos projetos nativos.

O estado atual da máquina e o passo administrativo pendente estão documentados em [`setup-macos.md`](./setup-macos.md).
