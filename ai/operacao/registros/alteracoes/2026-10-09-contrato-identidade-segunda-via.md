# Identidade dos contratos e segunda via de declarações

Versão: 4.8.193. Base: 638f21a377f85e382dcf52495e551cdc3e65f5a5.
Escopo autorizado: corrigir a identidade individual no contrato e a segunda via
bloqueada de matrícula/cursando, incluindo os documentos anteriormente emitidos.

## Causas e correções

O snapshot do contrato omitia o tipo documental e o renderer substituía CPF e RG
independentemente. Agora o backend escolhe CIN/CNI explícita ou CPF e RG legados
conforme o aluno, formata os números e omite dados ausentes. Não infere CIN pelo
comprimento do número. Dados de responsável e demais cláusulas não são substituídos.
Novas emissões congelam tipo, números e metadados, inclusive ausências explícitas.

Na leitura de contratos antigos sem tipo no snapshot, a RPC autorizada acrescenta
somente metadados faltantes de identidade e usa o modelo e condições congelados.
Não regrava emissões, cadastros, preços, contadores, datas nem códigos. Qualquer
contrato com envelope de assinatura conserva o conteúdo integral anterior.
A consulta por código aplica a mesma projeção às versões antigas do contrato.
Arquivos já baixados precisam ser baixados novamente; não são alterados remotamente.

As declarações de matrícula/cursando ainda usavam a preparação de camada de texto
que envolvia o HTML em spans e provocava alteração de layout. O novo caminho usa o
modelo configurado numa página A4 isolada e o compositor vetorial existente, sem
reescrever os nós de texto. Cabeçalho, marca d'água, assinaturas, linhas e QR são
preservados. Prévia, download e impressão usam o mesmo PDF completo. Não altera IRPF.
O lote remonta a página a cada emissão para não herdar camadas ocultas da anterior.
O dispatcher `emission-browser-pdf.ts` isola o renderer que mede o DOM no navegador.
O compositor nativo `emission-document.pdf.ts` foi restaurado à base, sem dependência
de React/DOM, preservando seu uso nos testes Deno e nos demais documentos. O histórico
usa o dispatcher, e o teste EAD mantém a guarda do caminho canônico do certificado.
Nenhum cálculo acadêmico ou financeiro foi movido para o frontend.

## Backend aplicado e conferência remota

Migrations aplicadas via MCP Supabase em 2026-10-09, preservadas sem alterações:

- `20261009163050_contract_student_identity_render.sql`
- `20261009163100_contract_student_identity_snapshot.sql`
- `20261009163109_contract_student_identity_history.sql`

Os três contratos reais do caso retornaram CIN única formatada, sem CPF/RG duplicado,
com sete páginas, mesmos códigos/IDs, modelo, financeiro e demais cláusulas.
Os hashes dos registros originais dos três contratos e da declaração reportada
permaneceram iguais. Nenhuma assinatura estava vinculada aos três contratos do caso.
Helpers internos privados, permissões dos wrappers e autorização por polo preservadas.
Advisors comparados por achado e metadata: 657 antes e depois, nenhum novo.

## Validação

- SQL isolado: 11 testes com migrations e funções reais, cobrindo identidade,
  idempotência, autorização, ausência explícita, dados imutáveis e assinatura.
- Consulta por código: 7 testes cobrindo versões antigas, identidade da emissão,
  erros de permissão e isolamento de outros documentos.
- Contrato SQL para PDF nativo: 3 testes com CIN, CPF/RG e CPF, extração de texto e
  igualdade entre preparação e segunda via; mais 3 usando o modelo real configurado
  com dados sintéticos. Páginas 1, 4 e 7 renderizadas e inspecionadas.
- Declaração: 4 testes de navegador aprovados, com texto nativo, A4, ativos originais,
  CIN, rejeição de corte real, lote com imagens distintas e igualdade dos bytes entre
  prévia, download e impressão. A execução em origem HTTPS controlada também aguarda
  o término da ação Imprimir e confirma ausência de erro. Revisão visual em PDF.js
  aprovada; o Poppler local substitui incorretamente fontes padrão, por isso não foi
  a referência visual final.
- ESLint do manifesto, versão e teto de 500 linhas aprovados.
- Build completo, TypeScript, lint, manifestos e testes de regressão compõem o CI.
  A separação entre navegador e compositor nativo corrige a dependência React detectada
  no teste Deno; a nova execução do CI e a Preview ainda precisam ser confirmadas.

## Limitações

Checkout local seletivo: a verificação global de manifestos históricos depende do CI.
Safari autenticado e impressora física não estão disponíveis; os testes de interação
usam Chromium completo controlado e dados sintéticos. Não se declara smoke autenticado.
PDFs/PNGs gerados, modelos temporários e dumps não integram o manifesto.

## Manifesto explícito

Total: 26 arquivos.

- `.github/workflows/document-identity-history.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-contrato-identidade-segunda-via.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/secretaria/contratos-aluno/contract-identity.pdf.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/historico-emissoes/contract-history-identity.integration.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/declaration-document.pdf.tsx`
- `modules/gestor/secretaria/historico-emissoes/declaration-pdf.fixture.mjs`
- `modules/gestor/secretaria/historico-emissoes/declaration-pdf.ui.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/ead-history-print.fixture.mjs`
- `modules/gestor/secretaria/historico-emissoes/ead-history-print.ui.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-browser-pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.constants.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `supabase/migrations/20261009163050_contract_student_identity_render.sql`
- `supabase/migrations/20261009163100_contract_student_identity_snapshot.sql`
- `supabase/migrations/20261009163109_contract_student_identity_history.sql`
- `supabase/tests/contract_student_identity.isolated.test.mjs`
- `supabase/tests/fixtures/contract-identity-boundaries.sql`
- `supabase/tests/fixtures/contract-identity-harness.mjs`
- `supabase/tests/fixtures/contract-identity-pagination.sql`
- `supabase/tests/fixtures/contract-identity-schema.sql`
