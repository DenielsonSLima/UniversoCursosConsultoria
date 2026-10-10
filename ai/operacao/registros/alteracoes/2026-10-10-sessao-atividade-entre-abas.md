# Sessão: atividade real e sincronização entre abas

Usuário relatou logout durante uso do portal. A inspeção reproduziu falhas de atividade em eventos que não propagam e corrida entre relógio local da aba e atividade persistida por outra aba. No intervalo do relato houve logout solicitado com HTTP204 e novo login, sem erro de renovação de token; os logs não atribuem sozinhos a causa do incidente.

## Aceite e escopo

Manter a regra de 30 minutos de inatividade real. Capturar interação em painéis internos, sincronizar o relógio persistido antes de expirar e impedir regressão de timestamp por eventos atrasados. Preservar logout explícito, expiração real, escopo local, Auth e autorização. Sem mudança remota de banco ou configuração Auth.

## Validação

Regressões com hook real, relógio e eventos controlados; teste de sessão entre abas e eventos capturados. Cinco regressões falharam antes do patch; após a correção passaram 9 testes do hook real, 4 de escopo do logout e 3 da política de inatividade, além do ESLint focado. Revisão de código preservou o prazo e o comportamento de encerramento explícito. Smoke autenticado permanece para o usuário conforme orientação da conversa. Input interno ao visualizador PDF nativo do navegador não é exposto ao documento pai; não introduzir atividade artificial.

## Manifesto explícito

Total: 8 arquivos.

- `modules/shared/hooks/useInactivityLogout.ts`
- `modules/shared/hooks/useInactivityLogout.behavior.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-sessao-atividade-entre-abas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
