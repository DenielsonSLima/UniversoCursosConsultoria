# Certificação EAD automática e separação do registro técnico

## Objetivo e causa

Entrega 4.8.185, autorizada para publicação e liberação dos EAD pendentes pelo
usuário em 08/10/2026. Somente a modalidade EAD pertence a este lote.

A conclusão EAD atualiza a matrícula, mas enfileirava o certificado como PENDENTE.
O finalizador e a Secretaria incluíam EAD na exigência técnica de número, livro
e página. A prévia também ficava dentro de um ancestral com transformação CSS.

Aceite: aprovação acadêmica válida gera certificado EAD FINALIZADO e código de
validação na mesma transação; dispensa registro técnico manual; prévia EAD usa
portal na tela. As demais modalidades preservam o fluxo anterior.

## Implementação

- Helper privado SECURITY INVOKER com EXECUTE revogado de clientes; os wrappers
  existentes mantêm autorização de aluno/gestor antes da emissão.
- Conclusão e replay EAD usam o emissor canônico, com locks, coerência de vínculos
  e proteção contra duplicação, revogação, expiração e conflito de snapshot.
- O finalizador EAD dispensa campos técnicos; o delegate das outras modalidades
  permanece inalterado.
- Secretaria usa o estado canônico do backend, sem recalcular elegibilidade no
  navegador. Pendentes EAD permanecem visíveis, sem a ação técnica Preparar.
- Prévia EAD em portal no body, com viewport, foco, Tab/Escape e restauração da
  rolagem. Modelo e compositor PDF não foram alterados.

## Manifesto explícito

- `.github/workflows/ead-automatic-certificate.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-08-ead-certificado-automatico.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/secretaria/certificados/SecretariaCertificadosPage.tsx`
- `modules/gestor/secretaria/certificados/certificados.service.ts`
- `modules/gestor/secretaria/certificados/components/EadCertificatePreviewPortal.tsx`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.fixture.mjs`
- `modules/gestor/secretaria/certificados/ead-certificates.ui.test.mjs`
- `supabase/migrations/20261008122500_auto_issue_ead_certificate.sql`
- `supabase/migrations/20261008122510_complete_ead_with_automatic_certificate.sql`
- `supabase/migrations/20261008122520_separate_ead_certificate_finalization.sql`
- `supabase/tests/ead_automatic_certificate.isolated.test.mjs`
- `supabase/tests/fixtures/ead-auto-certificate-schema.sql`
- `supabase/tests/fixtures/ead-certificate-original-issuers.sql`

Total: 17 arquivos. Fixtures são sintéticas ou definições SQL sem dados pessoais.

## Validação e revisão

- Três agentes: backend, interface e revisão independente.
- 11 testes SQL comportamentais com PostgreSQL isolado: aprovação, reprovação,
  autorização/sessão, requisitos acadêmicos, rollback, replay, documentos e
  preservação do técnico/livre/especialização.
- 5 grupos de navegador/serviço: campos técnicos preservados, EAD sem preparação,
  portal desktop/mobile, foco e bloqueio de impressão sem snapshot.
- O teste de navegador usa Page, portal e serviço reais, com dados e apresentação
  interna do documento simulados; não equivale a login de produção nem inspeção PDF.
- Backfill ensaiado com dois registros sintéticos: emissão exata, reexecução sem
  escrita, documento revogado bloqueado e rollback total se o segundo falha.
- CI, limite de linhas e Preview devem aprovar o commit exato antes da implantação.
- Sessões reais de aluno/gestor indisponíveis neste ambiente; limitação registrada.

## Regularização controlada e publicação

O inventário de produção encontrou dois certificados EAD PENDENTE com nota 100,
mínima 70, conclusão e respostas conferidas no backend e nenhum documento emitido.
IDs e timestamps revisados ficam apenas no plano privado de execução, fora do Git.

1. Aprovar CI/Preview e conferir ausência de drift nas funções existentes.
2. Aplicar as três migrations novas na ordem 122500, 122510 e 122520; preservar ACLs.
3. Revalidar o inventário e executar a manutenção DML transacional do conjunto
   exato, com locks, comparação de timestamps/nota, gabarito privado e vínculo.
4. Confirmar dois FINALIZADO, documentos ativos únicos e ausência de campos
   técnicos inventados; não reemitir nem alterar documentos existentes.
5. Integrar a branch e conferir versão/domínio da Vercel em produção.

Backups das funções anteriores ficam fora do repositório. Em falha de código,
restaurar somente wrappers afetados por migration nova. Certificados já emitidos
não são apagados/revogados automaticamente por rollback de software.
A implantação e a quantidade efetivamente liberada são confirmadas na entrega.
