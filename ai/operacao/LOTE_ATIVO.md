# Lote ativo

Estado: `PUBLICACAO_GITHUB_AUTORIZADA_SEM_MERGE_PRODUCAO`

## Lote: 2026-08-24-restauracao-capa-diario-slots-assinatura

- Pedido: restaurar a capa visual configurada do Diário, corrigir a imagem gravada no destino de contracapa e tornar explícita a posição dos carimbos digitais de Professor e Coordenador.
- Regressão confirmada: PR `#83`, squash `2f6461bf53459e6ab7a9e827c174113173719fc6`, integrado em `2026-08-24 00:29 UTC` (`2026-08-23 21:29 America/Maceio`).
- Causa: o fluxo passou a rejeitar `capaUrl`, retirou o upload de capa e deixou o upload visível associado a `contracapaUrl`; os campos de assinatura continuaram desenhados, mas foram apresentados como linhas manuais em vez de slots dos carimbos digitais. Depois da restauração do upload, uma segunda regressão manteve o PDF no modelo antigo: editor e emissão usavam chaves de cache diferentes, com frescor global de cinco minutos e cache adicional do Blob.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-restauracao-capa-diario-slots-assinatura.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-restauracao-capa-diario-slots-assinatura.md`.
- Publicação: solicitada para branch/PR atômica no GitHub. Merge em `main`, migration V3, Edge Function e aplicação web em Produção não foram autorizados e continuam pendentes. As URLs de capa atuais foram salvas pelo próprio usuário no banco durante o diagnóstico.

### Critérios de aceite

1. Capa e contracapa possuem upload e persistência separados. `ATENDIDO_LOCALMENTE`.
2. A capa enviada é o modelo visual integral da página 1, sem duplicar logo, título, marca ou slogan; somente campos variáveis são sobrepostos. `ATENDIDO_LOCALMENTE`.
3. A imagem hoje salva em `contracapaUrl` pode ser movida explicitamente para `capaUrl`, limpando o destino incorreto. `ATENDIDO_LOCALMENTE`.
4. Professor e Coordenador possuem botões próprios de seleção, slots arrastáveis, largura configurável e altura segura de 14% na página 2. `ATENDIDO_LOCALMENTE`.
5. O PDF original e o PDF assinado usam a mesma capa congelada por URL, MIME, dimensões, tamanho e SHA-256. `ATENDIDO_LOCALMENTE`.
6. Manifestos V1/V2 históricos permanecem finalizáveis; novas emissões usam V3. `ATENDIDO_LOCALMENTE`.
7. A emissão invalida o cache ao salvar, refaz a consulta ao montar/focar e relê o modelo autoritativo imediatamente antes de compor o PDF. `ATENDIDO_LOCALMENTE`.
8. Upload e salvamento fixam a modalidade de origem, bloqueiam a troca durante a operação e preservam edições concorrentes sem deixar o cache antigo válido. `ATENDIDO_LOCALMENTE`.

### Evidências e validação

- Supabase: a investigação dos modelos foi somente leitura. Na consulta inicial, os três modelos tinham `capaUrl = null` e a imagem enviada estava em `contracapaUrl`; no Técnico, os bytes eram idênticos a `Documentos/Capa-Diario.jpg` (`SHA-256 98bd440ca26bcf14f37743fde3adaa5304afd90a750b582326817aff5197a2d8`). Depois do novo upload feito pelo usuário, `diario_TECNICO`, `diario_LIVRE` e `diario_ESPECIALIZACAO` passaram a possuir `capaUrl` própria; o PDF genérico remanescente confirmou o cache antigo como causa.
- Supabase, limpeza autorizada: o marcador `UCQA-20260823` foi removido dos registros operacionais temporários — 2 turmas (Técnico e Livre), 2 matrículas, 5 parceiros, 6 identidades de acesso, 3 despesas pendentes e vínculos dependentes. Os 3 patrimônios foram excluídos pelo fluxo oficial e ficaram inativos com auditoria imutável. Pós-checagem: zero turma, matrícula, parceiro, acesso, despesa ou patrimônio ativo do marcador.
- Render Poppler: capa configurada sem duplicação, página interna preservada, página 2 íntegra e dois carimbos dentro dos slots de Professor e Coordenador.
- Deno focado: `69/69` testes aprovados.
- Editor, cache, releitura do modelo, fronteira do compositor e snapshot: `23/23` testes aprovados.
- Revisão independente: nenhum `Critical` ou `Important` após os patches finais.
- TypeScript completo, `deno check`, ESLint focado, `git diff --check` e teto de 500 linhas: aprovados.
- Smoke autenticado da interface: pendente porque nenhuma sessão de navegador automatizável estava disponível; não foi substituído por uma alegação de sucesso.

### Pendências após a publicação autorizada no GitHub

1. Aguardar CI e Preview da branch/PR; não mesclar em `main` sem nova autorização explícita.
2. Em uma autorização de Produção separada, publicar a migration `20260824080000_freeze_diary_cover_background_assets_manifest_v3.sql`, a nova Edge Function de artefatos e a aplicação web.
3. Após a publicação da aplicação, executar o smoke autenticado de `Modelos Documentos`, abrir novamente o `PDF preenchido` e confirmar que a faixa vermelha e toda a arte da capa salva aparecem; não substituir as URLs atuais.
4. Não regravar envelopes ou manifestos históricos.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
