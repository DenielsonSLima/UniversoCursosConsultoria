# Despesas — descrição padronizada e recibo compacto

- Data: 2026-11-09. Candidata: 4.8.277, revisão 286.
- Base: main 1e5391f5ef6d19d74c2b3fc071a4533f40cab78e, preservando a publicação NFS-e paralela.
- Classificação: mudança crítica em financeiro, banco e PDF oficial.
- Implementação em overlay temporário, sem substituir alterações paralelas do checkout.

## Aceite e contratos

- Digitação, sugestão, clone e edição normalizam descrição em maiúsculas com acentos; demais campos permanecem intactos.
- Trigger de INSERT/UPDATE e correção retroativa cobrem despesas_lancamentos. Leitura inicial encontrou 35 linhas, cinco descrições fora do padrão.
- Backfill altera somente descrição/updated_at; não cria despesa, baixa, pagamento, parcela ou rateio.
- Sete assinaturas de criação normalizam também a comparação de replay; catálogo é limitado a quatro nomes e conta exata de sete funções, com falha atômica em divergência.
- Assinaturas, OIDs e ACL preservados. Hashes históricos de edição/convênio não são reescritos.
- Snapshot autorizado transporta parceiroVinculado baseado no ID real, turmaNome e turmaCodigo do mesmo polo.
- Nenhuma assinatura inferida de nome ou CPF. Sem parceiro mantém somente a assinatura financeira.
- PDF nativo usa o cabeçalho institucional e os quatro parâmetros existentes da marca d'água.
- Recibo compacto preserva todos os campos: alturas variáveis, texto integral sem reticências, observação/narrativa completas e assinaturas após o conteúdo.
- Conteúdo incompatível com uma página falha explicitamente; não há paginação arbitrária nem corte silencioso.
- Prévia, download e impressão continuam usando o mesmo Blob do compositor existente.
- Catálogo React/HTML de recibo acompanha os campos e a assinatura condicional.

## Validação

- 14 testes de sugestão/clone e 10 testes SQL isolados aprovados, incluindo backfill sem mudanças financeiras, retry legado, acentos, ACL e acesso negativo.
- Revisão independente do banco: guard nullable do recibo corrigido; sem outros achados concretos.
- Quatro PDFs gerados pelo compositor real com dados sintéticos: parceiro, sem parceiro, nome longo com turma/observação e pendente.
- PDF.js confirmou texto vetorial, turma/código, assinatura condicional, conteúdo sem reticências e imagem isolada.
- Poppler: texto extraído, recursos inspecionados e página renderizada conferida. Marca d'água real configurada da Matriz; logo local oficial na fixture.
- Sem alterações no cabeçalho compartilhado ou no caminho de configuração da marca.
- TypeScript e ESLint focados aprovados antes do fechamento; execução final/CI validará a candidata completa.
- Smoke autenticado/interativo permanece pendente por indisponibilidade do controle Chrome (Sky Computer Use native pipe startup failed); render local de PDF não é apresentado como smoke do site.
- Checagem global local tem 39 caminhos históricos ausentes já conhecidos. Manifesto próprio respeita teto de 500 linhas; CI usa checkout remoto completo.
- Histórico 4.8.199–202 arquivado integralmente para manter changelog abaixo do teto.
- Fontes RAG não alteradas; sem reindexação de registros ou artefatos.

## Manifesto explícito

- `modules/gestor/financeiro/despesas/despesas-descricao.ts`
- `modules/gestor/financeiro/despesas/components/despesa-sugestao.model.ts`
- `modules/gestor/financeiro/despesas/hooks/useDespesaSugestao.ts`
- `modules/gestor/financeiro/despesas/components/DespesaEditModal.tsx`
- `modules/gestor/financeiro/despesas/despesas.types.ts`
- `modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview.tsx`
- `modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPage.tsx`
- `modules/gestor/financeiro/despesas/components/despesa-recibo.pdf.ts`
- `supabase/migrations/20261109031500_expense_descriptions_uppercase.sql`
- `supabase/migrations/20261109031600_expense_receipt_partner_signature.sql`
- `supabase/tests/expense_description_legacy_raw.baseline.sql`
- `supabase/tests/expense_description_legacy_wrapper.baseline.sql`
- `supabase/tests/expense_description_legacy_split.baseline.sql`
- `supabase/tests/expense_descriptions_uppercase.isolated.test.mjs`
- `supabase/tests/expense_receipt.isolated.test.mjs`
- `supabase/tests/expense_receipt.fixture.sql`
- `modules/gestor/financeiro/despesas/components/despesa-sugestao.model.test.ts`
- `scripts/test-despesa-recibo-native.mjs`
- `.github/workflows/despesas-recibos.yml`
- `ai/operacao/registros/alteracoes/2026-11-09-despesas-descricao-recibo.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-versoes-4-8-199-a-202.md`

Total: 24 arquivos.

## Publicação

- Duas migrations novas preparadas, ainda não aplicadas. Migrations anteriores permanecem imutáveis.
- GitHub somente por MCP, commit atômico e Preview antes de produção.
- Produção depende da autorização explícita do usuário após revisão e verificações da candidata.
