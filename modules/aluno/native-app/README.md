# Ponte do aplicativo do aluno

Este módulo prepara o portal web para o empacotamento Android/iOS sem carregar o Firebase no navegador.

O runtime Capacitor injeta `window.UniversoNativeApp` ao montar o React, com:

- `getDeviceInfo()`: retorna `installationId` aleatório e persistente, plataforma e versão do app;
- `getPushStatus()`: consulta a permissão atual sem abrir o diálogo do sistema;
- `requestPushPermission()`: solicita permissão somente após o toque do aluno;
- `openNotificationSettings()`: opcional, abre os ajustes do sistema quando a permissão foi negada.

O token FCM é enviado somente às funções protegidas do banco. Ele não integra respostas do painel administrativo e não deve ser armazenado no navegador.

## Arquivos externos obrigatórios

O código nativo está preparado, mas o Firebase só inicializa depois de cadastrar os dois apps com o identificador exato `br.com.universocc.aluno`:

- Android: baixar `google-services.json` e colocá-lo em `android/app/google-services.json`.
- iOS: baixar `GoogleService-Info.plist`, colocá-lo em `ios/App/App/GoogleService-Info.plist` e marcar o arquivo no target **App** do Xcode.
- iOS/Firebase: enviar a chave APNs `.p8` em **Firebase > Configurações do projeto > Cloud Messaging**, junto com Key ID e Team ID.
- Apple Developer/Xcode: manter a capability **Push Notifications** habilitada para o App ID e para o target.

A chave `.p8` e credenciais de servidor nunca devem ser copiadas para o repositório. A entrega deve ser validada em um aparelho físico; o simulador não comprova o fluxo completo APNs/FCM.

## Contrato de deep link do push

O payload pode enviar `deep_link`, `deepLink`, `route`, `path` ou `url` em `data`. Somente destinos internos sob `/aluno` são aceitos. Exemplos:

- `/aluno/comunicacao?chatId=<uuid>`
- `/aluno/?module=financeiro`
- `/aluno/?module=calendario&date=2026-08-10`
