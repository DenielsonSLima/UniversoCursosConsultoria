# Restauração da capa do Diário e slots digitais — 2026-08-24

Estado: `PUBLICACAO_GITHUB_AUTORIZADA_SEM_MERGE_PRODUCAO`

## Diagnóstico

A capa não se perdeu por falha aleatória do navegador. A regressão foi introduzida pelo PR `#83`, integrado em `2026-08-24 00:29 UTC` (`2026-08-23 21:29 America/Maceio`) no squash `2f6461bf53459e6ab7a9e827c174113173719fc6`. A implementação removeu o caminho de `capaUrl`, passou a bloquear a capa configurada no compositor e deixou o upload disponível associado à contracapa. A mesma mudança conservou os dois campos de assinatura na página 2, mas os descreveu como linhas manuais, ocultando que são os destinos dos carimbos digitais.

A consulta remota foi somente leitura. Inicialmente, nos modelos `diario_TECNICO`, `diario_LIVRE` e `diario_ESPECIALIZACAO`, `capaUrl` estava nulo e existia upload recente em `contracapaUrl`. O arquivo do Técnico era byte a byte a capa oficial `Documentos/Capa-Diario.jpg`. Depois que o usuário reenviou as capas, os três registros passaram a possuir `capaUrl`; como o PDF continuou genérico, ficou confirmada a segunda causa: editor e emissão usavam caches diferentes e o Blob podia preservar o template antigo.

## Correção local

- Uploads e cartões de capa/contracapa voltaram a ter destinos independentes.
- A capa configurada é tratada como visual integral; o compositor e a prévia não redesenham logo, título, marca-d'água ou slogan sobre ela. Campos acadêmicos variáveis continuam nativos e posicionáveis.
- Quando a capa foi salva na contracapa, o editor oferece `Corrigir destino: mover esta imagem para a capa`; a ação copia para `capaUrl` e limpa `contracapaUrl`, mas só persiste ao salvar conscientemente.
- A página 2 expõe `Selecionar Professor` e `Selecionar Coordenador do curso`. Cada slot reserva 14% da altura, pode ser arrastado e tem largura, linha e alinhamento configuráveis.
- O pipeline assinável usa manifesto de ativos V3 para congelar a capa por URL exata, MIME, dimensões, tamanho e SHA-256. V1/V2 continuam apenas para finalização histórica.
- O modo `EM_BRANCO` também preserva a capa integral e não acrescenta selo fixo sobre uma arte configurada.
- O refetch do upload não sobrescreve uma edição feita enquanto o salvamento estava pendente.
- Salvar ou enviar a capa invalida também todas as leituras de emissão, que antes eram indexadas por UUID de curso em uma chave diferente.
- A consulta documental ignora o frescor global de cinco minutos, refaz a leitura ao montar/focar e o gerador consulta novamente o modelo autoritativo imediatamente antes de compor. O cache do Blob só é reutilizado quando a assinatura integral do modelo continua igual.
- A modalidade de origem é congelada durante upload/salvamento; as abas ficam bloqueadas enquanto a operação está pendente, evitando gravar a capa de uma modalidade em outra. Havendo edição concorrente, o cache é invalidado sem refetch imediato e será relido na próxima abertura.

## Validação

- `69/69` testes focados de editor, compositor, snapshot, fidelidade, manifesto V3, finalização e slots digitais.
- `deno check` do adaptador web e da finalização Edge.
- ESLint focado nos componentes e hook alterados.
- Editor, cache/releitura, fronteira do compositor e snapshot `23/23`; TypeScript completo aprovado.
- Renderização real: capa, página interna, contracapa e página assinada inspecionadas; sem duplicação ou colisão.
- Revisão independente final sem `Critical` ou `Important`.
- Teto de 500 linhas aprovado.
- Índice RAG operacional regenerado e contrato de agentes aprovado.
- Smoke autenticado da interface pendente por indisponibilidade de navegador controlável.
- Limpeza operacional autorizada do marcador `UCQA-20260823`: 2 turmas temporárias (Técnico e Livre), 2 matrículas, 5 parceiros, 6 identidades de acesso, 3 despesas pendentes e seus vínculos foram removidos. Os 3 patrimônios temporários foram excluídos pelo fluxo oficial e permanecem somente como registros inativos com trilha imutável de auditoria. A verificação final encontrou zero registro operacional ativo do marcador.

## Manifesto explícito

Total: 38 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-24-restauracao-capa-diario-slots-assinatura.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/cadastros/modelos-documentos/diarios/DiariosPage.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioBackCoverSettingsPanel.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/components/DiarioFieldPropertiesPanel.tsx`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios-editor.contract.test.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios-editor.types.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/diarios.service.ts`
- `modules/gestor/cadastros/modelos-documentos/diarios/hooks/useDiarioTemplateEditor.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-assets.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-cover-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.fixtures.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-server-boundary.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.browser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-validation-flow.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioClasse.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/hooks/useDiarioPdfDownload.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-back-cover-assets.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-back-cover-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-cover-background.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-cover-background.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-final-assets.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-finalization.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-original-assets.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/artifact-original.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-manifest.test.ts`
- `supabase/functions/assinatura-eletronica-diario-artefatos/supabase-adapter-manifest.ts`
- `supabase/migrations/20260824080000_freeze_diary_cover_background_assets_manifest_v3.sql`
- `supabase/tests/diary_cover_background_asset_manifest_v3.contract.test.ts`
- `supabase/tests/diary_document_model_fidelity.contract.test.ts`

## Limites

- A limpeza de dados temporários do marcador `UCQA-20260823` foi a única mutação remota executada. Eventos de auditoria/Realtime e os patrimônios oficialmente excluídos foram preservados por desenho; migration, Edge Function e aplicação web não foram implantadas no Supabase ou na Vercel.
- A publicação solicitada limita-se ao manifesto deste lote em branch/PR no GitHub. Merge em `main` e Produção continuam sem autorização.
- A correção dos três modelos não deve ser automatizada em lote: o botão de mover precisa ser usado apenas quando a imagem atual da contracapa for de fato a capa.
- Artefatos temporários de renderização não integram o lote.
