# Recuperação do Turnstile web — 4.8.38

Estado: validado internamente para publicação autorizada; smoke visual pendente.

## Objetivo e risco

- Pedido: corrigir a espera indefinida e publicar no GitHub e em produção, sem acessar navegador.
- Domínio crítico: proteção do acesso; alteração limitada ao feedback e ciclo de vida do widget web.
- A verificação voltou espontaneamente antes do patch; a causa externa do incidente não foi determinada.
- Nenhuma alteração de backend, chaves, autorização, CSP ou critério de liberação do login.
- Base remota conferida: `b90d9239f3b9bf2d25ba0421cddd8d2ca7325c77` (4.8.37). Metadados locais coincidem com a base.

## Manifesto explícito

- `modules/shared/auth/TurnstileWidget.tsx`
- `modules/shared/auth/TurnstileWidget.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `package.json`
- `ai/operacao/registros/alteracoes/2026-09-09-recuperacao-turnstile.md`
- `internal/versioning/changelog/2026-08-27-a-2026-08-31.md`

Total: 9 arquivos.

## Aceite implementado

1. Desafio silencioso oferece recuperação manual após 20 segundos do início da verificação.
2. Erros repetidos não reiniciam o prazo de 8 segundos nem escondem a recuperação já disponível.
3. O prazo não remove o desafio; sucesso válido tardio ainda conclui a verificação.
4. Retry manual cria nova tentativa; callbacks antigos são ignorados após limpeza do efeito.
5. Sucesso, incompatibilidade e desmontagem limpam timers; expiração invalida o token.
6. Idioma web normalizado para pt-br; login continua dependendo de token verificado.
7. Testes comportamentais integrados ao comando test:portal-auth executado no CI.

## Validação

- Antes do patch: seis dos sete testes comportamentais falharam, incluindo os dois travamentos reproduzidos.
- Depois do patch: 24 testes aprovados (TurnstileWidget.test.mjs e test-portal-auth-flow.mjs), repetidos pela revisão independente sem achado material.
- TypeScript focado, limite de linhas e diff sem erro aprovados na implementação local.
- Fechamento para publicação: 55 testes de autenticação, TypeScript completo e build 4.8.38 aprovados; manifesto de nove arquivos dentro do teto de linhas.
- Testes executam TSX real com hooks, timers e API simulados, sem rede ou credenciais.
- Smoke visual e integração real com o desafio permanecem pendentes por restrição explícita ao navegador.
- Produção autorizada pelo usuário após apresentação do comportamento e dessa limitação.
- Changelog de 27–31/08 arquivado sem alterar entradas históricas para cumprir o teto de 500 linhas.
- Resultados finais de build, CI, Preview e conferência HTTP da produção constarão no PR da 4.8.38.
