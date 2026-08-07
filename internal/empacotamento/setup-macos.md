# Preparação do Mac para empacotamento

## Estado atual

- Node.js `22.23.2`: instalado e definido como padrão no NVM.
- Capacitor `8.5.0`: instalado, configurado e sincronizado.
- Xcode `26.6`: instalado, licença aceita e preparação inicial concluída.
- Android Studio `2026.1.3`: instalado.
- Android Platform Tools/ADB `37.0.1`: instalado.
- Android SDK/API 36 e Build Tools 35/36: instalados.
- OpenJDK 21 LTS: instalado para o Gradle.
- Projeto Android: criado e APK de debug compilado.
- Projeto iOS: criado e sincronizado; build de simulador aguarda concluir a resolução inicial do Swift Package Manager.

## Preparação concluída

Confirme o estado dentro do repositório com:

```bash
nvm use
npm run app:check
```

Para recompilar o APK de debug depois de atualizar o site:

```bash
npm run build
npm run app:sync
npm run app:build:android
```
