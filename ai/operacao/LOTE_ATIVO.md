# Lote ativo

Estado: BANCO APLICADO E CREDENCIAIS ARMAZENADAS — EM PUBLICAÇÃO — PROESC V1/V2 (4.8.69)

## Lote: 2026-09-18-proesc-conexoes-v1-v2

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-18-proesc-conexoes-v1-v2.md`.

- Usuário autorizou aplicar, armazenar e publicar, com V2 focada em dados/pessoas. Parcelas seguem na V1.
- V1 preservada; V2 com token e WAF próprios no Vault. Sem fallback.
- Migration 20260919002500 aplicada via MCP, teste SQL com rollback aprovado e RPC real conferida.
- Consulta real people V2 HTTP200 usando Bearer e x-proesc-waf. Nenhum campo eleitoral observado na primeira página de 20 registros.
- 37 testes backend e quatro frontend aprovados; smoke com transporte sintético realizado. TypeScript, lint, build e teto aprovados.
- Versão 4.8.69/revisão 78 em publicação; CI/Preview/deploy e smoke integrado serão registrados no PR.
- Segredos não constam dos arquivos. Nenhum cron, parcela ou aluno foi alterado.
- Entrega anterior 4.8.68 preservada no registro correspondente.
