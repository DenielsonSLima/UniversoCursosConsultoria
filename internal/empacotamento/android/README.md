# Android

## Compilação local

```bash
npm run build
npm run app:sync
npm run app:build:android
```

O APK de teste é gerado em `android/app/build/outputs/apk/debug/app-debug.apk`.

## Requisitos para a etapa 2

- Node.js 22 ou superior.
- Android Studio e SDK Android.
- Emulador com Google APIs ou aparelho com depuração USB/Wi-Fi.
- Capacitor Android na mesma versão de `core` e `cli`.

## Primeira entrega

1. Gerar o projeto Android pelo Capacitor.
2. Sincronizar o `dist` do Vite.
3. Abrir no Android Studio.
4. Testar em emulador.
5. Testar em aparelho físico.
6. Gerar APK `debug`, sem conta Google Play.

## Decisões

- `applicationId`: `br.com.universocc.aluno`.
- Android mínimo: API 24 conforme suporte atual do Capacitor 8.
- O botão voltar percorre o histórico do aluno antes de fechar o app.
- `versionCode` será inteiro e sempre crescente.
- Keystore e senhas ficam fora do Git, com backup seguro.

## Notificações — etapa posterior

- Plugin `@capacitor/push-notifications`.
- `google-services.json` fora desta fase inicial.
- Solicitar permissão somente após o toque em “Ativar notificações”.
- Android 13+ exige permissão em tempo de execução.
- Configurar canal, ícone monocromático e abertura em `/aluno/comunicacao`.
- Atualizar o backend sempre que o token FCM for renovado.

Consulte também [checklist.md](./checklist.md).
