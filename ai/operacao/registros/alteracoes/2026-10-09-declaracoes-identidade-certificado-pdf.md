# Identidade das declarações e segunda via do certificado EAD

Entrega 4.8.191, solicitada e autorizada para produção.

## Causas e correções

O cadastro civil tinha RG, órgão e UF, mas a consulta do histórico omitira o
tipo do documento e os metadados de expedição. O resolvedor de apresentação
recusava interpretar um RG sem tipo. Os parsers substituíam os campos ausentes
por “Não informado”, deixando rótulos e números vazios no texto do modelo.

A projeção autorizada agora inclui os campos completos. Novas declarações de
matrícula e frequência congelam tipo, CPF, RG, órgão, UF e data no backend.
Emissões antigas sem essas chaves continuam usando o cadastro autorizado;
null ou vazio explicitamente congelado continua vazio. Leitura, replay e
reemissão não reescrevem a identidade histórica. O conflito entre primeiras
emissões também preserva o snapshot que venceu. Não reclassificamos cadastros.

As três entradas — primeira emissão do gestor, histórico/segunda via e aluno —
usam a mesma apresentação. CPF/CIN recebem formatação; RG conserva sua grafia.
Cláusulas de identificação ausente são omitidas com seus rótulos, sem texto
“Não informado”. Tipo genérico legado não prova CIN. O modelo salvo continua
controlando texto e posição; órgão, UF e data aparecem quando seus tokens existem.
Documentos fiscais mantêm o rótulo CPF, mesmo para titulares de CIN.

A segunda via EAD gerava PDF pelo exportador DOM genérico, onde a imagem opaca
da assinatura cobria a linha. O botão imprimir ignorava o PDF e imprimia o
modal HTML, incluindo recorte e rolagem. O compositor EAD existente já tinha
a linha vetorial e a mistura correta da assinatura; ele foi reutilizado.

Prévia, download e impressão EAD agora entregam o mesmo Blob canônico A4 em
duas páginas. Mudança de modelo/snapshot invalida o arquivo anterior. A
preparação e confirmação idempotentes da segunda via continuam obrigatórias.
Outras modalidades de certificado mantêm seus caminhos existentes.

Migration `20261009130712_declaration_student_identity` aplicada via MCP,
preservando search_path vazio, permissões mínimas e guardas de polo/Secretaria.
Nenhum cadastro de aluno foi alterado. Fonte aplicada mantida integralmente.

## Manifesto explícito

- `.github/workflows/ead-automatic-certificate.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-09-declaracoes-identidade-certificado-pdf.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/certificados/ead-signature-pdf.assertions.mjs`
- `modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.test.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.types.ts`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/ReprintModal.tsx`
- `modules/gestor/secretaria/historico-emissoes/ead-history-pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/ead-history-print.fixture.mjs`
- `modules/gestor/secretaria/historico-emissoes/ead-history-print.ui.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/template-parser.ts`
- `modules/gestor/secretaria/historico-emissoes/useReissueSession.ts`
- `modules/shared/secretaria/document-template.helpers.ts`
- `modules/shared/utils/declaration-identity-presentation.ts`
- `modules/shared/utils/declaration-identity.integration.test.mjs`
- `modules/shared/utils/student-document-presentation.test.ts`
- `scripts/test-document-validation.mjs`
- `supabase/migrations/20261009130712_declaration_student_identity.sql`
- `supabase/tests/declaration_identity.isolated.test.mjs`
- `supabase/tests/document_validation_idempotent_reissue.contract.test.ts`
- `supabase/tests/document_validation_reissue_delivery.contract.test.ts`
- `supabase/tests/fixtures/declaration-identity-schema.sql`

Total: 29 arquivos.

## Validação

- Três agentes revisaram identidade, linha da assinatura e impressão; revisão
 cruzada confirmou que o compositor canônico resolvia a falha do histórico.
- 10/10 testes SQL da migration e 10/10 de apresentação dos três parsers.
- 5/5 testes do histórico real em navegador controlado: clique, PDF de duas
 páginas, hashes iguais, modelo atualizado, falha do backend e linha vetorial.
- Regressão da assinatura: imagem opaca sobre a linha, traço nativo e cobertura
 visual de 100%; frente/verso renderizados, fundos e grade preservados.
- RPC real sob service_role conferiu os dois documentos relatados: tipo, RG,
 órgão e UF correspondem ao cadastro; snapshots históricos permaneceram intactos.
- ESLint dos arquivos alterados, revisão React, versionamento e teto de 500 linhas.
- Índice RAG atualizado uma vez; CI completo e Preview antes do merge.

Os testes de navegador usam dados sintéticos e componentes reais com serviços
controlados. Confirmam o PDF entregue ao iframe de impressão, sem fingir
aprovação do diálogo do sistema ou impressão física. Não há sessão Safari
autenticada disponível. Declarações receberam ajuste de dados/apresentação;
seu exportador legado não foi refeito neste lote. O check global local depende
dos históricos ausentes no checkout seletivo e é concluído no CI completo.
Recursos temporários, imagens de QA e inventários ficam fora do commit.

A validação geral foi atualizada para seguir a sessão idempotente extraída,
com as mesmas garantias de chave estável e confirmação antes da entrega.
Os contratos de entrega foram separados para manter o teto de 500 linhas.
