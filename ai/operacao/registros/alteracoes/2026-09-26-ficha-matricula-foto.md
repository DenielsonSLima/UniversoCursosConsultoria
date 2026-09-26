# Ficha de Matrícula — foto após a primeira emissão

Estado: produção autorizada pelo usuário; backend aplicado, publicação 4.8.97 em andamento.

## Objetivo e causa

A Ficha deve incorporar a foto cadastrada e manter o espaço para colagem quando
não houver foto. A Pasta mantém seu comportamento próprio, sem espaço vazio.

Consulta somente leitura via MCP confirmou ficha antiga com `studentPhotoUrl`
nulo, cadastro com foto e pasta posterior com a foto atual. A emissão da Ficha
reutilizava código e snapshot antigos. O carregador e o compositor da imagem
funcionavam corretamente; não foi alterado o layout nem o fallback histórico.

## Solução

- O lote de emissão atual compara a foto do cadastro com a da ficha original.
- Havendo alteração, deriva no servidor uma referência SHA-256 da URL e cria
  uma versão com código e snapshot próprios pelo emissor canônico.
- Sem alteração, conserva a versão correspondente. Ausência, vazio e placeholder
  padrão são equivalentes para a identificação da foto.
- Retry recupera a referência da operação confirmada antes de avaliar o cadastro.
- Histórico, preparação e reimpressão mantêm a versão selecionada.
- Autorização precede o ledger; locks têm ordem estável; o lote é transacional.
- Ficha original ou versão revogada não pode ser contornada mudando a foto.
- Helpers privados não têm EXECUTE para anon, authenticated ou service_role.

## Manifesto explícito

- `supabase/migrations/20260926200000_add_ficha_photo_revision_issuer.sql`
- `supabase/migrations/20260926200100_route_ficha_photo_revision_reissue.sql`
- `supabase/migrations/20260926200200_capture_ficha_photo_revision_batch.sql`
- `supabase/tests/student_registration_photo.fixture.mjs`
- `supabase/tests/student_registration_photo.isolated.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-ficha-photo.pdf.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-26-ficha-matricula-foto.md`

Total: 10 arquivos.

## Validação

- PostgreSQL em memória/PGlite: 15 cenários aprovados, executando os corpos reais
  das RPCs e triggers com cadastros sintéticos. O primeiro reproduz o defeito.
- Abrange inclusão, troca, remoção e ausência de foto, repetição idempotente,
  modelo divergente, preparação/confirmação histórica, autorização, revogação,
  rollback integral e permissões dos helpers.
- PDF: 23 testes da Ficha/Pasta e contrato do compositor aprovados; extração de texto, inventário de
  imagens isoladas e render da primeira página inspecionados. A moldura permanece
  nas mesmas coordenadas quando a foto está ausente ou falha ao carregar.
- `npm run check:file-lines`: aprovado; manifesto local também limitado a 500 linhas.
- Build 4.8.97 aprovado em cópia isolada da base remota `1aae97f7d8cc9dff57ceeb840f1d6054540b86a6`,
  com somente o manifesto aplicado: 4.053 módulos e 26 páginas de compartilhamento.
  A cópia principal e a versão local do PDV paralelo são preservadas.
- Artefatos temporários estão em `tmp/pdfs/ficha-photo/`; não integram o manifesto.

## Entrega remota

Usuário autorizou expressamente a publicação em 26/09/2026. As três migrations
foram aplicadas por MCP Supabase e seus registros conferidos:

- `20260926172744` — add_ficha_photo_revision_issuer.
- `20260926172747` — route_ficha_photo_revision_reissue.
- `20260926172750` — capture_ficha_photo_revision_batch.

Preflight confirmou as definições abaixo antes da aplicação. Readback confirmou
que helpers continuam sem execução direta para anon e authenticated.

| Função pública | MD5 de pg_get_functiondef consultado |
| --- | --- |
| emitir_ficha_validacao_portal | 4dd7b6002014c71a9e331db7a8d7acb2 |
| reemitir_documento_validacao_portal | c9aa2b40e8daddd538370c07c98e32ec |
| reemitir_fichas_validacao_lote_portal | e06b762faf9d532d1aab5c0811b1af60 |

As fontes históricas e snapshots existentes foram preservados. `LOTE_ATIVO.md`
local permanece com o trabalho paralelo de Outros Créditos; metadata desta
publicação é montada sobre main remoto em `tmp/pdfs/ficha-photo/release-overlay/`.
Nenhuma fonte do índice RAG ou memória foi alterada.

Smoke autenticado em produção aprovado: a emissão atual criou nova versão com a
foto do cadastro; o PDF foi aberto, baixado e renderizado para inspeção visual.
A foto está embutida como imagem isolada 720 × 960; modelo, marca d'água e textos
selecionáveis foram preservados. Readback confirmou snapshot antigo intacto.
Ausência de foto e reabertura histórica foram validadas nos testes isolados;
impressão física não foi executada.
O teste isolado não comprova concorrência real entre conexões nem RLS com usuários
reais. A identidade acompanha alterações da URL, como nos uploads do cadastro.
