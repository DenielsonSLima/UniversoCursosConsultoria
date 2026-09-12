# Lote ativo

Estado: `AUTOMAÇÃO ATIVADA E TRÊS LOTES VALIDADOS — PUBLICAÇÃO EM PREPARAÇÃO`

## Lote: 2026-09-12-proesc-conciliacao-automatica

- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-proesc-conciliacao-automatica.md`.
- Versão 4.8.46, revisão 55; cinco migrations aplicadas e Edge Proesc v4 ACTIVE.
- 346 vínculos habilitados: 204 pagos, 142 abertos; recebido R$ 53.813,57.
- Quinze baixas, um parcial corrigido e um residual importado; 78 títulos Banese preservados.
- Primeiro lote real HTTP 200: seis consultados e inalterados, sem revisão ou falha.
- Cron confirmado em três lotes, 18 vínculos observados, seis snapshots por lote e sem erros.
- Cron a cada dois minutos, seis vínculos; varredura nominal de cerca de 116 minutos.
- Encargos não comprovados permanecem null; não criar saldo inicial duplicado na Conta Proesc.
- 49 testes Deno e ensaio SQL com rollback/negativos aprovados.
- Publicação GitHub/Vercel 4.8.46 em preparação; smoke histórico/token aprovado.
- PR 139 / 4.8.45 / SHA `3d8c14` publicado com Vercel e smoke Safari autenticado confirmados.
- Caixa/Conta Proesc e recebido T42: R$ 53.813,57; proteção Proesc, trancadas e Banese conferidos.
- Nove turmas seguintes somente após T42; não recriar T42/Radiologia.
- Preservar alterações paralelas do PR 134; skill/documentação da integração em lote separado.
