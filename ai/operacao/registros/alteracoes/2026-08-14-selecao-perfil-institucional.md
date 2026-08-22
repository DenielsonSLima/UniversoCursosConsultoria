# Alteração — seleção de perfil institucional

- Lote: `2026-08-14-selecao-perfil-institucional`
- Estado no fechamento: `PUBLICADO`

## Resultado

- Uma mesma identidade institucional pode escolher, no login, se acessa como Professor ou Gestor.
- O redirect respeita o perfil escolhido e o vínculo do Professor à identidade de Gestor exige coincidência segura de CPF e e-mail.
- Conflitos permanecem pendentes e a autorização canônica usa `auth_user_id`; o navegador não escolhe a identidade vinculada.

## Escopo e segurança

- Foram incluídos proteção de redirect, vínculo seguro, feedback de vínculo pendente e cobertura de CI para seleção, autorização e vínculo.
- Ficaram fora do lote migrations, mudança de RLS, redução de privilégios de backend por perfil visual, alteração do OAuth nativo, criação de contas e mudança de senhas.
- A ação exige sessão JWT, módulo Parceiros, escopo do parceiro, gestor global e Configurações.

## Produção e validação

- Edge Function `portal-user-management` v28 ativa, com `verify_jwt=true`; nenhuma migration foi aplicada.
- Foram aprovados 27 testes Deno, 14 testes de login institucional, TypeScript, controle de versão, GitHub Actions e Preview Vercel.
- A fonte remota v28 confirmou a ação nova, a autorização por UID e o handler ativo; `/sistema/login` respondeu HTTP 200 em produção.
- O smoke autenticado permaneceu pendente por não haver sessão institucional de teste disponível; nenhum dado pessoal foi alterado.

## Publicação

- PR [#75](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/75) mesclada em `main` no commit [`940a576`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/940a576ad31ae2265b171112069e43facf681913c).
- [Deploy de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/BB3ULE3V3tvWiWqTLAwh8Xs2bwh6) concluído; versão `4.3.3` publicada.
