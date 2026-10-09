# Identidade individual e PDF completo do certificado EAD

Entrega 4.8.188. Continuidade autorizada do certificado EAD.

## Problema e comportamento

O CPF era interpolado sem máscara. As consultas do aluno e histórico omitiam
os campos de identidade. A Secretaria não oferecia download; imprimir HTML
podia descartar o fundo CSS. O download anterior do aluno capturava a página.

O certificado passa a identificar o tipo declarado de cada aluno e formatar
CPF/CIN completos. CIN/CNI explícitos usam o rótulo oficial CIN. RG conserva
letras, zeros e a pontuação cadastrada, pois não existe máscara nacional única.
Tipo antigo ambíguo não é convertido em CIN pelo número ou pela falta de RG.
O modelo salvo não é reescrito. Outras modalidades seguem seu fluxo existente.

Novas emissões EAD congelam seis campos de identidade no backend. Reutilização
respeita valores nulos e campos ausentes do snapshot; FINALIZADO não reemite.
Nenhum cadastro, certificado anterior, código ou contador é alterado pelo lote.
As duas emissões liberadas anteriormente continuam finalizadas.

Secretaria e aluno geram um único Blob PDF para prévia, download e impressão.
Texto, tabela e linhas são nativos; fundo original, logo, QR e assinatura são
recursos isolados. O gerador mede a apresentação A4 do próprio modelo salvo,
sem calcular nota, carga horária, desconto ou elegibilidade no frontend.
Fonte Inter e respectivos pesos usam os mesmos TTF licenciados no DOM/PDF.
Falhas de modelo, grade, fonte ou imagem bloqueiam a ação com erro explícito.

## Manifesto explícito

- `.github/workflows/ead-automatic-certificate.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-ead-identidade-pdf.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/aluno/cursos/CursosPage.tsx`
- `modules/aluno/cursos/ead-certificate.service.ts`
- `modules/aluno/cursos/hooks/useEadLearning.ts`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/certificados/certificate-identity-snapshot.test.mjs`
- `modules/gestor/secretaria/certificados/certificate-identity-snapshot.ts`
- `modules/gestor/secretaria/certificados/components/certificado-preview.utils.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-identity.test.mjs`
- `modules/gestor/secretaria/certificados/components/ead-certificate-identity.ts`
- `modules/gestor/secretaria/certificados/components/ead-certificate-template.test.mjs`
- `modules/gestor/secretaria/certificados/ead-certificate-pdf-fonts.ts`
- `modules/gestor/secretaria/certificados/ead-certificate-pdf-text.ts`
- `modules/gestor/secretaria/certificados/ead-certificate-pdf.ts`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/certificados/ead-identity.integration.test.mjs`
- `modules/gestor/secretaria/certificados/pdf-assets/Inter-OFL.txt`
- `modules/gestor/secretaria/certificados/pdf-assets/inter-ttf.ts`
- `modules/gestor/secretaria/certificados/useEadCertificatePdf.tsx`
- `modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx`
- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `supabase/migrations/20261008220000_snapshot_identity_on_ead_issue.sql`
- `supabase/tests/ead_certificate_identity.isolated.test.mjs`
- `supabase/tests/fixtures/ead-auto-certificate-schema.sql`
- `supabase/tests/fixtures/ead-certificate-test-harness.mjs`

Total: 33 arquivos. Fontes Inter/OFL são recursos de terceiros;
PDFs, imagens de teste, inventário e dados pessoais não entram no repositório.

## Validação

- Revisões independentes de backend, identidade e PDF/interface.
- SQL da identidade: 6 casos; adapter de snapshot: 3; consultas reais: 5.
- Contratos de formatação: 10; template: 4; regressões SQL anteriores: 29.
- Navegação real da Secretaria: 8 casos, desktop/móvel e técnico preservado.
- PDF: 7 casos com modelo/recursos inventariados e 7 com fixture sintética.
- Seis cenários de documento por aluno; extração de texto, fontes incorporadas,
  imagens originais e igualdade dos bytes de prévia/download/impressão.
- Frente/verso do Blob real revisados no PDF.js e comparados ao editor.
  O Poppler local substituía fontes padrão e distorcia seu PNG; a contraprova
  com PDF.js do mesmo arquivo confirmou texto, posições e fundos preservados.
- Modelo real e grade são usados com identidade/assinatura sintéticas.
  Não há sessão autenticada real; o smoke de uma conta de usuário segue pendente.
- Manifesto local respeita 500 linhas por arquivo. CI executa a cobertura
  integral de linhas, lint/build e contratos antes da publicação.

## Publicação e reversão

Um commit e uma Preview para o lote. Após CI/Preview, conferir drift e ledger,
aplicar a migration 20261008220000 via MCP e verificar ACL e dados preservados.
Integrar o PR e confirmar versão pública 4.8.188 na implantação de produção.
A mudança do banco é aditiva nos snapshots futuros; reversão deve conservar
emissões existentes e restaurar a definição anterior por nova migration.
O CI reindexa uma vez as fontes operacionais permitidas, sem dados pessoais.
