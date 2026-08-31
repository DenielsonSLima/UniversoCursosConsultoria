# Registro de commits e deploys

Registre uma linha por publicação de lote. Não use este ledger para commits intermediários.

| Data | Lote | Commit/PR | Preview Vercel | Produção | Resultado |
| --- | --- | --- | --- | --- | --- |
| 2026-08-06 | `fix-caixa-pdf-vetorial-preview` | PR #60, commit `b9d728d` | Sucesso | Não promovido neste lote | Proteção contra helper ausente validada |
| 2026-08-06 | `operacao-memoria-rag` | PR #61, commit `70e5247` (rascunho aberto) | Sucesso | Não autorizado | Memória/RAG e registros operacionais validados |
| 2026-08-07 | `producao-sincronizacao-completa` | commit `253e40a` + merge `4ee3bf6` (origin/main) via terminal autorizado | — | **Publicado em main** | 1735 arquivos: documentos, secretaria, calendário, patrimônio, financeiro, operação, migrations, testes e módulos. Hotfixes do remote (Turnstile, Pasta/Carteirinha) integrados via merge -X ours. |
| 2026-08-31 | `conta-integral-e-desconto-banese-recebiveis` | [PR #102](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/102), preview `06a4ec1` | [Sucesso](https://universo-cursos-consultoria-git-b991cb-denielson-limas-projects.vercel.app) | **Publicado em main pela Vercel** | Três migrations aplicadas; ACL/RBAC e dados aprovados. Smoke visual autenticado pendente por ausência de navegador conectado. |
