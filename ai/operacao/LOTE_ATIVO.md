# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_7_5`

## Lote: 2026-08-24-restauracao-capa-diario-slots-assinatura

- Pedido: restaurar a capa visual configurada do Diário, corrigir a imagem gravada no destino de contracapa e tornar explícita a posição dos carimbos digitais de Professor e Coordenador.
- Regressão confirmada: PR `#83`, squash `2f6461bf53459e6ab7a9e827c174113173719fc6`, integrado em `2026-08-24 00:29 UTC` (`2026-08-23 21:29 America/Maceio`).
- Causa: o fluxo passou a rejeitar `capaUrl`, retirou o upload de capa e deixou o upload visível associado a `contracapaUrl`; os campos de assinatura continuaram desenhados, mas foram apresentados como linhas manuais em vez de slots dos carimbos digitais. Depois da restauração do upload, uma segunda regressão manteve o PDF no modelo antigo: editor e emissão usavam chaves de cache diferentes, com frescor global de cinco minutos e cache adicional do Blob.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-restauracao-capa-diario-slots-assinatura.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-restauracao-capa-diario-slots-assinatura.md`.
- Publicação: PR `#85` integrada por squash na `main`, commit `eea13ab218a92775a0b5303c34a3b84450d05675`. Migration V3, Edge Function v14 e aplicação web 4.7.5 foram publicadas em Produção após autorização explícita. As URLs de capa atuais foram salvas pelo próprio usuário no banco durante o diagnóstico.

### Critérios de aceite

1. Capa e contracapa possuem upload e persistência separados. `ATENDIDO`.
2. A capa enviada é o modelo visual integral da página 1, sem duplicar logo, título, marca ou slogan; somente campos variáveis são sobrepostos. `ATENDIDO`.
3. A imagem hoje salva em `contracapaUrl` pode ser movida explicitamente para `capaUrl`, limpando o destino incorreto. `ATENDIDO`.
4. Professor e Coordenador possuem botões próprios de seleção, slots arrastáveis, largura configurável e altura segura de 14% na página 2. `ATENDIDO`.
5. O PDF original e o PDF assinado usam a mesma capa congelada por URL, MIME, dimensões, tamanho e SHA-256. `ATENDIDO`.
6. Manifestos V1/V2 históricos permanecem finalizáveis; novas emissões usam V3. `ATENDIDO`.
7. A emissão invalida o cache ao salvar, refaz a consulta ao montar/focar e relê o modelo autoritativo imediatamente antes de compor o PDF. `ATENDIDO`.
8. Upload e salvamento fixam a modalidade de origem, bloqueiam a troca durante a operação e preservam edições concorrentes sem deixar o cache antigo válido. `ATENDIDO`.

### Evidências e validação

- Supabase: a investigação dos modelos foi somente leitura. Na consulta inicial, os três modelos tinham `capaUrl = null` e a imagem enviada estava em `contracapaUrl`; no Técnico, os bytes eram idênticos a `Documentos/Capa-Diario.jpg` (`SHA-256 98bd440ca26bcf14f37743fde3adaa5304afd90a750b582326817aff5197a2d8`). Depois do novo upload feito pelo usuário, `diario_TECNICO`, `diario_LIVRE` e `diario_ESPECIALIZACAO` passaram a possuir `capaUrl` própria; o PDF genérico remanescente confirmou o cache antigo como causa.
- Supabase, limpeza autorizada: o marcador `UCQA-20260823` foi removido dos registros operacionais temporários — 2 turmas (Técnico e Livre), 2 matrículas, 5 parceiros, 6 identidades de acesso, 3 despesas pendentes e vínculos dependentes. Os 3 patrimônios foram excluídos pelo fluxo oficial e ficaram inativos com auditoria imutável. Pós-checagem: zero turma, matrícula, parceiro, acesso, despesa ou patrimônio ativo do marcador.
- Render Poppler: capa configurada sem duplicação, página interna preservada, página 2 íntegra e dois carimbos dentro dos slots de Professor e Coordenador.
- Deno focado: `69/69` testes aprovados.
- Editor, cache, releitura do modelo, fronteira do compositor e snapshot: `23/23` testes aprovados.
- Revisão independente: nenhum `Critical` ou `Important` após os patches finais.
- TypeScript completo, `deno check`, ESLint focado, `git diff --check` e teto de 500 linhas: aprovados.
- GitHub: PR `#85` integrada por squash na `main`; commit assinado `eea13ab218a92775a0b5303c34a3b84450d05675`.
- Supabase: migration remota `20260824145833_freeze_diary_cover_background_assets_manifest_v3`; helper, wrapper V1/V2/V3, trigger V3 e ACLs confirmados; Edge `assinatura-eletronica-diario-artefatos` v14 `ACTIVE`, JWT ativo e bundle `2e360030b749ba34ecc1512ebc277729d6a983a119762aab089d52ff7baea40c`.
- Produção: deployment Vercel `FvuvoteCQdDPttcVvvLnzPR2fXw6` concluído com sucesso; `https://universocc.com.br` respondeu HTTP 200 e o bundle público contém o resumo estável 4.7.5.
- Smoke autenticado da interface: não executado porque a sessão local expirou e o Preview não recebe as variáveis exclusivas de Production; a publicação foi fechada com contratos, renderização real, bundle público, backend remoto e disponibilidade do domínio, sem alegar inspeção autenticada inexistente.

### Fechamento remoto

1. Backend publicado em janela compacta: migration V3 seguida imediatamente da Edge v14, ambos validados antes do merge web.
2. Aplicação publicada pelo squash merge da PR `#85`; Vercel Production e domínio canônico confirmados.
3. Nenhuma variável da Vercel foi alterada e nenhum envelope ou manifesto histórico foi regravado.
4. Uma inspeção autenticada futura pode ampliar a evidência visual, mas não substitui nem invalida os contratos e renders já aprovados neste fechamento.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
