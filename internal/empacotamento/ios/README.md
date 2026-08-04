# iOS

## Requisitos para a etapa 2

- Node.js 22 ou superior.
- Xcode 26 ou superior.
- Licença do Xcode aceita e Command Line Tools selecionadas.
- Simulador iOS 15+; para teste físico, Apple Account no Xcode.

## Primeira entrega gratuita

1. Gerar o projeto iOS pelo Capacitor.
2. Sincronizar o `dist` do Vite.
3. Abrir no Xcode usando Swift Package Manager.
4. Testar no simulador.
5. Assinar automaticamente com Personal Team.
6. Instalar no iPhone próprio; a assinatura gratuita expira em sete dias.

## Decisões

- `bundleId`: `br.com.universocc.aluno`.
- Nome exibido: `Universo Cursos e Consultoria`.
- iOS mínimo: 15 conforme suporte atual do Capacitor 8.
- Validar notch, Dynamic Island, teclado e scroll em aparelho real.
- O ícone final precisa ter 1024 × 1024 e não pode ter transparência.

## Pontos obrigatórios antes da App Store

- Exclusão de conta iniciada dentro do aplicativo.
- Política de privacidade facilmente acessível.
- Conta de demonstração válida para a revisão.
- Definição sobre compras de conteúdo digital e possíveis exigências de In-App Purchase.
- Login Google com retorno por Universal Link/custom scheme; avaliar exigência de Sign in with Apple.

## Notificações — etapa posterior

- Registrar exatamente `br.com.universocc.aluno` no Firebase e na Apple.
- Adicionar `GoogleService-Info.plist` ao target, sem duplicações.
- Habilitar Push Notifications e, quando necessário, Background Modes.
- Chave APNs `.p8`, Key ID e Team ID nunca entram no Git.
- Entrega FCM real será validada em iPhone físico com conta Apple Developer.

Consulte também [checklist.md](./checklist.md).
