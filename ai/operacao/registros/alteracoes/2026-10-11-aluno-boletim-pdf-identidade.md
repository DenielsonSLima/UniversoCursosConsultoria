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
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim-template-read.test.mjs`
- `.github/workflows/document-identity-history.yml`
- `ai/operacao/registros/alteracoes/2026-10-11-aluno-boletim-pdf-identidade.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-28-a-2026-09-30-versoes-4-8-128-a-4-8-137.md`

Total: 25 arquivos.

## Validação e entrega

Três frentes independentes: interface, backend e fidelidade documental, com revisão cruzada. Os testes usam identidades sintéticas. PDFs e PNGs gerados, caches, build e harnesses temporários não entram no manifesto.

Validação local: 56 casos Node (19 SQL, 9 serviço, 7 interface e 21 modelo/histórico), 40 contratos Deno do compositor, TypeScript, lint focado e build 4.8.210 passaram. O gate confirma todos os 25 arquivos deste manifesto dentro do teto de 500 linhas; a maior implementação é SecretariaPage.tsx, com 410. O workflow existente de identidade passa a executar os três testes novos do aluno usando dependências isoladas, e sua sintaxe YAML foi conferida.

Cinco PDFs sintéticos de identidade (RG, CIN, CNI, somente CPF e sem número) foram extraídos e renderizados: uma página A4 vetorial, seis componentes, matrícula humana, recursos isolados e nenhuma colisão de assinatura/QR. A interface também gerou PDF real pelo compositor do gestor, com sete componentes. Revisão cruzada aprovada pelas três frentes.

Readback MCP somente leitura confirmou schema, vínculos e os corpos efetivos preservados. O harness usa o emissor aplicado 20261009130712, idêntico ao remoto; os 19 casos SQL foram repetidos após esse alinhamento. As três migrations novas estão ausentes do ledger. Os corpos e grants efetivos serão conferidos novamente antes/depois de qualquer aplicação autorizada.

CI e Preview precisam passar antes da promoção; seus resultados finais ficam na PR de entrega. O smoke autenticado no Safari será realizado quando o controle do navegador estiver disponível. A RPC nova ainda não foi aplicada ao banco remoto; emissão real permanece pendente dessa aplicação autorizada.

## Limites

- PGlite testa funções SQL reais com fronteiras substituídas para Auth e resultados acadêmicos; não simula disputa de locks entre duas sessões de produção.
- Não há redefinição de senha, aceite de termos, alteração financeira ou ampliação do acesso do gestor neste lote.
- Novas emissões congelam modelo, instituição, marca e dados acadêmicos. Documentos antigos sem esses snapshots continuam usando a leitura canônica existente, sem reescrever o registro histórico.
