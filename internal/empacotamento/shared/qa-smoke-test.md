# Smoke test compartilhado

Executar em Android e iOS a cada release candidata.

## Entrada e sessão

- [ ] Abre diretamente em `/aluno/login-app`.
- [ ] Login por matrícula/e-mail e senha.
- [ ] Cadastro exclusivo do app.
- [ ] Recuperação de senha exclusiva do app.
- [ ] Sessão permanece após fechar e reabrir.
- [ ] Logout retorna ao login do app e encerra a presença do dispositivo.
- [ ] Sessão expirada retorna ao login correto.

## Portal

- [ ] Navegação inferior e botão voltar.
- [ ] Cursos, aulas e vídeos.
- [ ] Agenda e calendário.
- [ ] Financeiro, boletos e checkout externo.
- [ ] Biblioteca, documentos, PDFs e compartilhamento.
- [ ] Comunicação, histórico, anexos e novo chamado.
- [ ] Perfil e edição de dados.

## Dispositivo

- [ ] Teclado não cobre campos ou botões.
- [ ] Notch, Dynamic Island e barras do sistema respeitam safe areas.
- [ ] Links externos abrem no navegador controlado.
- [ ] Comportamento com rede lenta, offline e reconexão.
- [ ] Nenhum service worker PWA controla o container nativo.

## Gates antes da primeira beta

- [ ] Cloudflare Turnstile homologado para a origem do WebView.
- [ ] Google OAuth retorna ao app por deep link ou permanece oculto na primeira versão.
- [ ] Downloads e `window.open` adaptados para plugins nativos.
- [ ] Fluxo de exclusão de conta disponível no aplicativo antes da App Store.
- [ ] Estratégia de compras digitais revisada para as regras da Apple.

