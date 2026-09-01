# Registro de commits e deploys

Registre uma linha por publicação de lote. Não use este ledger para commits intermediários.

| Data | Lote | Commit/PR | Preview Vercel | Produção | Resultado |
| --- | --- | --- | --- | --- | --- |
| 2026-08-06 | `fix-caixa-pdf-vetorial-preview` | PR #60, commit `b9d728d` | Sucesso | Não promovido neste lote | Proteção contra helper ausente validada |
| 2026-08-06 | `operacao-memoria-rag` | PR #61, commit `70e5247` (rascunho aberto) | Sucesso | Não autorizado | Memória/RAG e registros operacionais validados |
| 2026-08-07 | `producao-sincronizacao-completa` | commit `253e40a` + merge `4ee3bf6` (origin/main) via terminal autorizado | — | **Publicado em main** | 1735 arquivos: documentos, secretaria, calendário, patrimônio, financeiro, operação, migrations, testes e módulos. Hotfixes do remote (Turnstile, Pasta/Carteirinha) integrados via merge -X ours. |
| 2026-08-31 | `conta-integral-e-desconto-banese-recebiveis` | [PR #102](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/102), preview `06a4ec1` | [Sucesso](https://universo-cursos-consultoria-git-b991cb-denielson-limas-projects.vercel.app) | **Publicado em main pela Vercel** | Três migrations aplicadas; ACL/RBAC e dados aprovados. Smoke visual autenticado pendente por ausência de navegador conectado. |
| 2026-08-31 | `hotfix-layout-valor-desconto-recebiveis` | [PR #103](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/103), versão `4.8.17` | [Sucesso](https://universo-cursos-consultoria-git-a35db4-denielson-limas-projects.vercel.app) | **Autorizado para main/Vercel** | Grade desktop corrigida; cards responsivos e regras financeiras preservados. Smoke visual autenticado pendente por ausência de navegador conectado. |
| 2026-09-01 | `reemissao-bolepix-ead-banese` | [PR #106](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/106), versão `4.8.20` | [Sucesso](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/6tCtqzfvc811dSqRuCsYkBQKT4Tg) | **Supabase publicado; main/Vercel pelo merge do PR** | Nove migrations e oito Edge Functions ativas; `000097299` pago foi preservado e `000097302` foi substituído uma vez por `000097329` com Pix oficial. Técnico intacto; smoke visual exato pendente por falta de sessão Aluno. |
