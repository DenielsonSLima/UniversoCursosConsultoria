# Matrícula e identidade nos documentos acadêmicos

Estado: migrations aplicadas via MCP; publicação 4.8.127 autorizada em andamento. Continuação do pedido de documentos públicos, cuja correção foi publicada em 4.8.126 (PR 217).

## Problema e aceite

Pasta/Ficha não gravavam studentMatricula. Modelos repetiam CIN nos campos RG e CPF. Carteirinha não congelava tipo/número de identidade e podia depender do cadastro vivo.

Aceite: preencher matrícula canônica; CIN explícita aparece uma vez, CPF redundante vazio na carteirinha; RG e CPF separados quando selecionados; não reinterpretar tipo legado ambíguo. Preservar modelos configurados, coordenadas, marca d’água, QR e histórico. Atualização do cadastro após emissão deve gerar uma nova versão explícita, sem apagar a original.

## Manifesto explícito

- `modules/shared/utils/student-document-presentation.ts`
- `modules/shared/utils/student-document-presentation.test.ts`
- `modules/shared/secretaria/document-template.helpers.ts`
- `modules/gestor/cadastros/ficha-matricula/registration-identity-presentation.ts`
- `modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoEditor.tsx`
- `modules/gestor/cadastros/modelos-documentos/declaracao/components/declaracao-editor.preview.tsx`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-snapshot.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-identity.pdf.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pasta-enrollment.pdf.test.ts`
- `modules/gestor/secretaria/historico-emissoes/template-parser.ts`
- `modules/gestor/secretaria/shared/SecretariaAcademicDocumentPreview.tsx`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.ts`
- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoSecretaria.tsx`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview.tsx`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaAbsoluteLayout.tsx`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaStandardLayout.tsx`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/components/carteirinha-preview.types.ts`
- `modules/gestor/cadastros/modelos-documentos/carteirinha/carteirinha-identity.rendering.test.tsx`
- `modules/gestor/secretaria/historico-emissoes/preview-utils.ts`
- `supabase/migrations/20260928021516_fix_ficha_enrollment_number_snapshot.sql`
- `supabase/migrations/20260928021502_freeze_student_card_identity_snapshot.sql`
- `supabase/tests/ficha_enrollment_number_snapshot.contract.test.ts`
- `supabase/tests/student_card_identity_snapshot.contract.test.ts`
- `scripts/test-document-identity.mjs`
- `ai/operacao/registros/alteracoes/2026-09-27-documentos-matricula-cin.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/secretaria/historico-emissoes/components/ReprintModal.tsx`
- `modules/gestor/secretaria/historico-emissoes/useUpdateDocumentIdentity.ts`
- `modules/gestor/secretaria/historico-emissoes/document-identity-update.test.ts`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/contract-history-pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `supabase/migrations/20260928021533_add_document_identity_versions.sql`
- `supabase/tests/document_identity_versions.contract.test.ts`

## Validação

- Três agentes com frentes backend, modelos e carteirinha; revisão cruzada.
- Testes PDF completos Pasta/Ficha CIN/RG com extração de texto e páginas renderizadas; matrícula, slots, marca e fotografia preservados.
- Safari no modelo Photoshop institucional real: CIN no campo de identidade e CPF vazio; RG/CPF separados, fundos e posições preservados.
- Backfill de matrícula provado em transação revertida: 130 registros elegíveis, sem alteração em outros campos/snapshots, datas ou códigos.
- TypeScript, ESLint do manifesto, build e 162 testes da consulta pública aprovados.
- Safari interativo do modal real: bloqueio durante operação, abertura do código novo e preservação do original (RPC simulada localmente).
- RPCs reais com transação revertida para Pasta/Ficha/carteirinha: original integralmente idêntico, código novo, replay e chave distinta convergem, identidade e modelo congelados, proveniência registrada. Negativos de acesso/replay/origem e destino revogados aprovados. Lock por identidade protege chaves distintas; sem prova multi-sessão concorrente.
- Pós-aplicação: nenhuma Pasta/Ficha com matrícula ausente; grants e lock corretos. Verificação pública SQL via MCP não executada por falta de privilégio do serviço; consulta já validada no Safari na entrega 4.8.126.
- Todos os arquivos do manifesto <=500 linhas. Check global mantém 12 ausências preexistentes de outros lotes, sem alterações fora do escopo.

Autorização explícita do usuário: “publique autorizado para tudo”, mantida nas correções de documentos adicionadas durante a execução. Ledger: 20260928021502, 20260928021516 e 20260928021533. Base remota 35b730a3f0c99087ea21d830fc07bb82af8911d3.

## Limites e histórico

O tipo antigo CARTEIRA NACIONAL DE IDENTIFICAÇÃO é ambíguo e não é convertido automaticamente. O cadastro mantém CPF canônico e RG residual; apresentação aplica o tipo escolhido. Dados fiscais de IRPF e identidade de responsáveis mantêm CPF.

A segunda via preserva o documento originalmente emitido. Atualizar identificação gera outra emissão, com código novo e cadastro atual. O exportador legado da carteirinha não foi substituído; a correção ocorre no renderer compartilhado entre prévia e saída. Não se declara validação de novo compositor nativo da carteirinha.

Sem dados pessoais em fixtures ou neste registro. Artefatos de QA em tmp não pertencem ao lote. LOTE_ATIVO de outra frente preservado.
