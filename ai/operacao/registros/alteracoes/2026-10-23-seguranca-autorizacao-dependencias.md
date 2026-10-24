# Segurança: autorização financeira, runtime e dependências — 2026-10-23

## Objetivo e aceite
Correção solicitada pelo responsável após revisão com três agentes. Negar RPC financeira a anon e identidades ausentes; restringir resultados, totais e facetas aos polos autorizados; preservar gestor global e serviço. Atualizar Capacitor, Vite, DOMPurify e PDF.js com testes dos consumidores. Preservar gate Node da PR326 e validar separadamente a versão efetiva da Function. Não declarar runtime corrigido somente pelo build.

## Manifesto explícito
- `package.json`
- `package-lock.json`
- `deno.lock`
- `.nvmrc`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
- `modules/aluno/secretaria/internship-badge.browser.test.mjs`
- `modules/professor/financeiro/professor-financeiro-receipt.pdf.test.ts`
- `modules/aluno/secretaria/aluno-declaration.browser.test.mjs`
- `modules/aluno/secretaria/aluno-bulletin.test.mjs`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.fixtures.ts`
- `modules/shared/pdf/PdfPagePreview.tsx`
- `modules/aluno/financeiro/aluno-financeiro-receipt.pdf.test.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.contract.fixtures.ts`
- `modules/gestor/secretaria/carteirinhas/student-card.browser.test.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-identity.pdf.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-ficha-photo.pdf.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pasta-enrollment.pdf.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-document.pdf.contract.fixtures.ts`
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim-template-read.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-typography.pdf.test.ts`
- `modules/gestor/secretaria/contratos-aluno/contract-identity.pdf.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-pasta-photo.pdf.test.ts`
- `modules/gestor/financeiro/outros-creditos/pdv-receipt.test.ts`
- `modules/gestor/biblioteca/components/file-preview/PdfCanvasPreview.tsx`
- `api/social-preview.js`
- `scripts/check-node-security.mjs`
- `scripts/check-node-security.test.mjs`
- `supabase/migrations/20261024001907_secure_secretaria_banese_document_scope.sql`
- `supabase/migrations/20261024001916_pin_financial_schedule_search_path.sql`
- `supabase/tests/secretaria_banese_document_scope.isolated.test.mjs`
- `supabase/tests/fixtures/secretaria-banese-document-scope.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-23-seguranca-autorizacao-dependencias.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/secretaria/contratos-aluno/pdf/legibility.pdf.test.mjs`
Total: 39 arquivos.

## Ambiente e autorização
Base remota observada: main de719aa28184471fb49783b03c9c5660f412876e (4.8.232). Workspace local contém mudanças anteriores e não será publicado em bloco. Somente arquivos deste manifesto podem integrar o commit. Banco alvo: Universo kfekgwyqozhicpfuunpo; todas operações por MCP. Nenhuma mudança persistente de banco ou produção aplicada nesta etapa.

## Evidência inicial
RPC SECURITY DEFINER executável por PUBLIC/anon passou com auth.uid nulo em transação somente leitura, usando busca sem correspondência. Nenhum registro pessoal retornado. Function social-preview em produção registrou Node v24.21.0 em 23/10 às 23:07:41 UTC, abaixo do piso 24.22.1. O build da PR326 não garante o patch do runtime gerenciado pela Vercel.

## Validação e limites
- Onze testes de autorização/Node aprovados (cinco cenários SQL e seis Node); revisão independente sem bloqueadores. Arrays de polos com NULL também negam polo não autorizado.
- Vinte e oito testes Node de documentos e quatro Deno aprovados. PDF.js 6 exige destruição por loadingTask; duas prévias reais e seus testes/fixtures adaptados. Smoke sintético renderizou canvas, extraiu texto e liberou recursos; smoke autenticado no Safari permanece pendente.
- TypeScript e build completos aprovados usando Node 24.22.1 oficial, com SHA256 conferido. Node temporário usado na validação; .nvmrc fixa 24.22.1.
- Audit de 21 para 16 pacotes, zero críticos. Capacitor 8.5.1, DOMPurify 3.4.17, Vite 6.4.5 e PDF.js 6.2.108 sem alertas no escopo. Os 16 demais incluem dependências indiretas e ferramentas, sem upgrade amplo neste lote.
- Resolução iOS pelo Xcode aprovada com Capacitor 8.5.1; binários Android/iOS não recompilados, assinados ou distribuídos. Instalações existentes continuam exigindo novos binários.
- Manifesto atual inteiro abaixo de 500 linhas por arquivo manual. Checker agregado local encontrou arquivos ausentes em manifestos antigos/mais recentes que esta cópia; essa dívida não foi varrida nem corrigida.
- Correção do banco requer validação contratual remota após aplicação; fixtures isoladas não substituem esse smoke. Migrations antigas preservadas.
- Node da Function é controlado pela Vercel; não há seleção de patch pelo projeto. A correção do build já publicada na PR326 não comprova o runtime. Confirmar log privado em Preview/produção; se persistir 24.21.0, remediação depende da plataforma.
- Algumas suítes adicionais não executaram por harnesses existentes (import.meta.env/resolução TypeScript/PGlite); não declarar cobertura integral.
- Preview inicial READY, build Node 24.22.1, porém Function observada em Node 24.21.0 às 23:20:06 UTC: patch do runtime continua pendente da Vercel. PR 327 em rascunho; nenhuma promoção feita.
- CI inicial exigiu avanço da versão; candidata passa a 4.8.233/revisão 242. CI também revelou consumidor PDF remoto ausente nesta cópia: teste de legibilidade adaptado com a mesma mudança de cleanup. Histórico remoto do changelog é preservado no PR e o histórico local anterior permanece no workspace.

## Aplicação autorizada
Usuário autorizou aplicar e publicar em 23/10/2026. Migrations aplicadas pelo MCP no projeto confirmado kfekgwyqozhicpfuunpo; ledger UTC: 20261024001907 e 20261024001916. Arquivos renomeados para os identificadores efetivos, sem alterar SQL. Validação remota e publicação registradas no PR 327.
