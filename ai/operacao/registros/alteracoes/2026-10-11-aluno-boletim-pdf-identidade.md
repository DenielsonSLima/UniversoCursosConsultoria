# Boletim imediato do aluno e identidade documental

Mudança crítica de documentos acadêmicos: interface, payload SQL e PDF oficial. O usuário pediu três agentes e confirmou emissão imediata, sem pedido para aprovação da secretaria. A autorização de produção do lote de acesso anterior não abrange este domínio novo; esta entrega prepara patch, contratos, revisão e Preview para aprovação concreta.

## Reprodução e resultado

- A captura do portal do aluno mostra o boletim em modal de consulta sem emissão. A página não fornecia ação de PDF ao modal compartilhado. A ação passa a emitir o módulo iniciado selecionado, com carregamento, erro e cancelamento ao trocar o contexto autenticado.
- A segunda via do gestor imprimia o UUID interno por fallback de ALUNO_MATRICULA. O payload canônico passa a fornecer a matrícula humana pelo formatador acadêmico existente. Falta de matrícula válida bloqueia o documento.
- O corpo padrão vigente v3 não contém documentos pessoais. Apenas esse corpo integral reconhecido evolui para v4, acrescentando a identificação adaptável. Corpos personalizados, campos absolutos, coordenadas, QR, assinatura e marca d’água são preservados.
- CPF e RG aparecem separados quando disponíveis; CIN/CNI usa a identificação única; ausências não deixam rótulos órfãos. Snapshot com null explícito não é substituído por dados atuais.

## Aceite

| Caso | Resultado |
| --- | --- |
| Aluno próprio, matrícula técnica elegível e módulo iniciado | Gerar o PDF oficial imediatamente. |
| Módulo planejado, de outra turma ou aluno sem vínculo | Recusar antes da emissão. |
| Prévia, download e impressão | Reutilizar o mesmo Blob vetorial e código. |
| Matrícula | Exibir número canônico legível, nunca UUID. |
| CPF/RG/CIN/ausência | Adaptar o texto aos dados presentes. |
| Modelo configurado | Transportar o objeto completo, assinatura e quatro parâmetros da marca d’água. |
| Replay e documento histórico | Preservar código e snapshots; recusar conteúdo incompatível. |
| Nova emissão após mudança de notas ou modelo | Gerar outro código para o conteúdo atual, preservando a emissão anterior. |
| Histórico do aluno e gestor | Reproduzir o mesmo snapshot acadêmico no mesmo código. |
| Impressão cancelada antes de iniciar | Encerrar a preparação ao fechar ou trocar o contexto do modal. |
| Data da emissão e ano | Usar a data canônica de America/Maceio congelada no snapshot. |
| CIN em corpo personalizado | Preservar nome, matrícula e estilo em div, parágrafo e célula de tabela. |

## Manifesto explícito

- `modules/aluno/secretaria/SecretariaPage.tsx`
- `modules/shared/secretaria/AcademicResultsModal.tsx`
- `modules/aluno/secretaria/components/AlunoBulletinDialog.tsx`
- `modules/aluno/secretaria/aluno-bulletin.test.mjs`
- `modules/aluno/secretaria/aluno-bulletin.fixture.mjs`
- `supabase/migrations/20261011150000_canonical_academic_document_identity.sql`
- `supabase/migrations/20261011150100_student_bulletin_template_snapshot.sql`
- `supabase/migrations/20261011150200_student_bulletin_pdf.sql`
- `modules/aluno/secretaria/aluno-bulletin.service.ts`
- `modules/aluno/secretaria/aluno-bulletin.service.test.mjs`
- `supabase/tests/student_bulletin_pdf.isolated.test.mjs`
- `supabase/tests/fixtures/student-bulletin-harness.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-snapshot.ts`
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim.service.ts`
- `modules/gestor/cadastros/modelos-documentos/shared/documentVariables.ts`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.types.ts`
- `modules/gestor/secretaria/historico-emissoes/academic-preview.ts`
- `modules/gestor/secretaria/historico-emissoes/academic-preview-snapshot.test.mjs`
- `modules/gestor/secretaria/shared/pdf-blob-print.ts`
- `modules/gestor/secretaria/shared/pdf-blob-print.test.ts`
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim-template-read.test.mjs`
- `modules/shared/utils/student-document-presentation.ts`
- `modules/shared/utils/student-document-presentation.test.ts`
- `.github/workflows/document-identity-history.yml`
- `ai/operacao/registros/alteracoes/2026-10-11-aluno-boletim-pdf-identidade.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-28-a-2026-09-30-versoes-4-8-128-a-4-8-137.md`

Total: 30 arquivos.

## Validação e entrega

Três frentes independentes: interface, backend e fidelidade documental, com revisão cruzada. Os testes usam identidades sintéticas. PDFs e PNGs gerados, caches, build e harnesses temporários não entram no manifesto.

A validação anterior passou em 60 casos Node, 12 contratos Deno de impressão, lint, TypeScript e build 4.8.210. A revisão seguinte passou em 26 casos SQL, 16 de modelo/PDF, 14 de identidade/ficha/pasta e três do PDF canônico de contratos. Os demais contratos seguem como evidência dos caminhos não alterados. O manifesto contém 30 arquivos, limitados a 500 linhas. O workflow de identidade executa histórico congelado, cancelamento de impressão e identidade nos modelos personalizados.

No fechamento deste delta, TypeScript e build 4.8.210 passaram novamente, e o novo step esbuild do workflow compilou os sete testes diretos; esses sete e os 16 testes de modelo/PDF passaram. YAML válido. O build local inclui também o cadastro ainda não publicado; o CI de cada head isolado é necessário para validar sua composição exata.

Cinco PDFs sintéticos de identidade (RG, CIN, CNI, somente CPF e sem número) foram extraídos e renderizados: uma página A4 vetorial, seis componentes, matrícula humana, recursos isolados e nenhuma colisão de assinatura/QR. A interface também gerou PDF real pelo compositor do gestor, com sete componentes. Revisão cruzada aprovada pelas três frentes.

Readback MCP somente leitura confirmou schema, vínculos e os corpos efetivos preservados. O harness usa o emissor aplicado 20261009130712, idêntico ao remoto, e pgcrypto real para o fingerprint. As três migrations novas estão ausentes do ledger. Os corpos e grants efetivos serão conferidos novamente antes/depois de qualquer aplicação autorizada.

CI e Preview do candidato corrigido precisam passar antes da promoção; o resultado verde do candidato anterior não valida estes deltas. Seus resultados finais ficam na PR304. O controle Safari permitiu smoke da aba Acesso publicada 4.8.209; emissão/impressão real do aluno permanecem pendentes da aplicação autorizada da RPC nova.

## Achados corrigidos na revisão adicional

- P1: solicitar após mudança de notas reutilizava o primeiro boletim. O SHA256 do conteúdo canônico e da data local passa a distinguir versões; conteúdo/data iguais reutilizam código, validade e snapshots.
- P1: histórico do gestor relia notas atuais no código congelado do aluno. Snapshot acadêmico presente passa a ser obrigatório e a preservar ordem e resumo; documentos antigos sem a chave mantêm o comportamento legado.
- P2: marca congelada nula, array ou objeto vazio era aceita. A guarda recusa estruturas inválidas e preserva URL ausente legitimamente configurada, opacidade zero e rotação falsa.
- P2: fechar ou trocar contexto durante a preparação podia abrir a impressão anterior. AbortSignal cancela somente antes de print; recursos permanecem vivos durante o diálogo iniciado.
- P1: o adapter de CIN apagava um bloco personalizado que misturava nome, matrícula e CPF. Remove apenas a cláusula redundante reconhecida e altera o rótulo associado ao token; sete disposições em div, parágrafo e célula de tabela mantêm texto e estilos. Tokens fiscais e do responsável conservam seu tratamento.
- P2: emissão às 21h30 locais imprimia o dia seguinte por usar UTC. Novas emissões congelam documentIssueDate no banco e o PDF usa esse valor para datas e ano; presença inválida é recusada e documentos legados mantêm a leitura anterior.

O fingerprint normaliza timestamps em UTC e usa a data de America/Maceio. Regressões exercitam fusos de sessão distintos, mudança de identidade/modelo/instituição/marca, validade e preservação byte a byte do documento anterior. Revisão cruzada dos três agentes aprovada no manifesto final.

## Limites

- PGlite testa funções SQL reais com fronteiras substituídas para Auth e resultados acadêmicos; não simula disputa de locks entre duas sessões de produção.
- Não há redefinição de senha, aceite de termos, alteração financeira ou ampliação do acesso do gestor neste lote.
- Novas emissões congelam modelo, instituição, marca e dados acadêmicos. Documentos antigos sem esses snapshots continuam usando a leitura canônica existente, sem reescrever o registro histórico.
- A correção do adapter melhora a reprodução de modelos anteriores sem modificar seus snapshots; não promete bytes idênticos ao PDF antigo que continha a falha.
- O runner amplo de identidade mantém duas falhas anteriores, reproduzidas com o helper do head anterior: DOMPurify.addHook e uma asserção obsoleta da fonte de carteirinha. Os contratos diretamente afetados estão verdes; essas duas falhas não foram incluídas no escopo.
