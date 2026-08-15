# Lote ativo

Estado: `PUBLICADO`

## Lote: 2026-08-14-selecao-perfil-institucional

- Objetivo: permitir que uma mesma identidade institucional escolha, no login, se acessa como Professor ou Gestor.
- Escopo incluído: proteção de redirect pelo perfil escolhido; vínculo seguro do Professor à identidade existente de Gestor quando CPF e e-mail coincidem; feedback de vínculo pendente; autorização canônica por `auth_user_id`; cobertura de CI para seleção, autorização e vínculo.
- Fora de escopo: migrations, mudança de RLS, redução de privilégios de backend por perfil visual, alteração do fluxo nativo OAuth, criação de contas ou mudança de senhas.
- Risco e guarda: Auth e Edge Function em produção. A nova ação exige sessão JWT, módulo Parceiros, escopo do parceiro, gestor global e Configurações; o navegador não informa `auth_user_id`.
- Critérios de aceite: escolha Professor/Gestor não aceita deep link do outro portal; CPF/e-mail/identidade precisam coincidir; conflito ou concorrência não conclui o vínculo; a função mantém JWT obrigatório; testes e deploys aprovados.
- Produção Supabase: Edge Function `portal-user-management` v28 ativa, com `verify_jwt=true`; nenhuma migration aplicada.
- Validação: 27 testes Deno, 14 testes de login institucional, TypeScript, controle de versão, qualidade GitHub Actions e Preview Vercel aprovados; fonte remota v28 confirma ação nova, autorização por UID e handler ativo; `/sistema/login` em produção respondeu HTTP 200.
- Smoke autenticado: pendente por não haver sessão institucional de teste disponível neste ambiente; nenhum dado pessoal foi alterado durante a validação.
- Publicação GitHub/Vercel: PR [#75](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/75) mesclada em `main` no commit [`940a576`](https://github.com/DenielsonSLima/UniversoCursosConsultoria/commit/940a576ad31ae2265b171112069e43facf681913); [deploy de Produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/BB3ULE3V3tvWiWqTLAwh8Xs2bwh6) concluído; versão `4.3.3` publicada.
