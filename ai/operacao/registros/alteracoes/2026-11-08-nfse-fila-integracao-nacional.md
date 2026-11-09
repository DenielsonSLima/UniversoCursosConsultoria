# NFS-e — fila e cadastro A1 seguro — 4.8.273

## Objetivo e aceite

Continuidade solicitada com três agentes: fila acadêmica persistente, configuração fiscal,
certificado seguro, DPS/assinatura e investigação do cancelamento de notas emitidas.
Publicação em produção autorizada pelo usuário em 08/11/2026 para fila, configuração e
cadastro A1 seguro. Emissão e cancelamento continuam bloqueados. Sem certificado real ou
transmissão fiscal nesta entrega. Candidato 4.8.273 sobre main remoto 4.8.272 preserva Despesas.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/fontes-terceiros-nfse.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-fila-integracao-nacional.md`
- `docs/contracts/nfse-local-stage1.md`
- `docs/contracts/nfse-preparation-queue.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCertificateModal.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseConfigurationForm.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseTaxRegimeFields.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseTabContext.tsx`
- `modules/gestor/emissor-nfse/fila/nfse-preparation-attempt.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.contract.test.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.contract.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.presentation.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.service-core.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.service.ts`
- `modules/gestor/emissor-nfse/fila/nfse-queue.types.ts`
- `modules/gestor/emissor-nfse/fila/useNfseQueue.ts`
- `modules/gestor/emissor-nfse/nfse.css`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/hooks/NfsePreparationDraft.tsx`
- `modules/gestor/emissor-nfse/services/configuration/certificate-upload.service.ts`
- `modules/gestor/emissor-nfse/services/configuration/configuration.contract.test.ts`
- `modules/gestor/emissor-nfse/services/configuration/configuration.service-core.ts`
- `modules/gestor/emissor-nfse/services/configuration/configuration.service.ts`
- `modules/gestor/emissor-nfse/services/configuration/configuration.types.ts`
- `modules/gestor/emissor-nfse/services/configuration/useNfseConfigurationMetadata.ts`
- `scripts/check-file-line-limits.mjs`
- `scripts/check-file-line-limits.test.mjs`
- `scripts/file-line-third-party-sources.mjs`
- `supabase/functions/_shared/nfse-national/README.md`
- `supabase/functions/_shared/nfse-national/cancellation-policy.test.ts`
- `supabase/functions/_shared/nfse-national/cancellation-policy.ts`
- `supabase/functions/_shared/nfse-national/deno.lock`
- `supabase/functions/_shared/nfse-national/dps.ts`
- `supabase/functions/_shared/nfse-national/dps.types.ts`
- `supabase/functions/_shared/nfse-national/events.ts`
- `supabase/functions/_shared/nfse-national/live-contract.ts`
- `supabase/functions/_shared/nfse-national/mtls.ts`
- `supabase/functions/_shared/nfse-national/provider.test.ts`
- `supabase/functions/_shared/nfse-national/provider.ts`
- `supabase/functions/_shared/nfse-national/schemas/1.01/DPS_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/NFSe_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/pedRegEvento_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/tiposComplexos_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/tiposEventos_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/tiposSimples_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/1.01/xmldsig-core-schema.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/DPS_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/NFSe_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/pedRegEvento_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/tiposComplexos_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/tiposEventos_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/tiposSimples_v1.01.xsd`
- `supabase/functions/_shared/nfse-national/schemas/prodrest-20261020/xmldsig-core-schema.xsd`
- `supabase/functions/_shared/nfse-national/signature.ts`
- `supabase/functions/_shared/nfse-national/xml.ts`
- `supabase/functions/nfse-certificate-upload/README.md`
- `supabase/functions/nfse-certificate-upload/certificate.test.ts`
- `supabase/functions/nfse-certificate-upload/certificate.ts`
- `supabase/functions/nfse-certificate-upload/deno.json`
- `supabase/functions/nfse-certificate-upload/deno.lock`
- `supabase/functions/nfse-certificate-upload/handler.ts`
- `supabase/functions/nfse-certificate-upload/index.ts`
- `supabase/functions/nfse-certificate-upload/pfx-limits.ts`
- `supabase/functions/nfse-certificate-upload/trust-store.ts`
- `supabase/migrations/20261109015954_nfse_configuration_store.sql`
- `supabase/migrations/20261109020010_nfse_configuration_rpc.sql`
- `supabase/migrations/20261109020012_nfse_certificate_store.sql`
- `supabase/migrations/20261109020015_nfse_certificate_metadata.sql`
- `supabase/migrations/20261109020017_nfse_academic_queue_store.sql`
- `supabase/migrations/20261109020019_nfse_academic_queue_prepare.sql`
- `supabase/migrations/20261109020021_nfse_academic_queue_reads.sql`
- `supabase/tests/nfse_academic_queue.fixture.sql`
- `supabase/tests/nfse_academic_queue.isolated.test.mjs`
- `supabase/tests/nfse_certificate.isolated.test.mjs`
- `supabase/tests/nfse_configuration.isolated.test.mjs`

Total: 85 arquivos.

## Entrega

- Fila acadêmica com snapshot imutável por aluno/turma, versão do modelo, proveniência dos
  recebimentos efetivos e reserva atômica por ambiente. Revalida seleção/valor/contagem na
  própria RPC de origem; qualquer sobreposição ou divergência rejeita todo o lote.
- Tela confirma preparação e consulta Pendentes pelo contrato novo. RequestId preservado
  após resposta incerta; sucesso encerra a tentativa. Valores continuam decimais do servidor.
- Configuração versionada por estabelecimento/ambiente, permissão administrativa da matriz,
  regimes XSD e referência de certificado por empresa/raiz CNPJ.
- Canal A1 dedicado: autorização antes do corpo/parse, limites de tamanho e KDF, correspondência
  RSA/chave/certificado, política A1, SAN CNPJ, validade e cadeia ICP-Brasil revisada. PEM no Vault,
  senha/PFX não persistidos, auditoria/getters/respostas sem material ou referência do segredo.
- Builder DPS doméstica, incluindo imunidade explicitamente confirmada, substituição e pedidos
  101101/101103. XMLDSig real, validação XSD antes/depois pela porta de validação e adapter mTLS.
- Política de cancelamento somente com evidência municipal/eventos atual e coerente. Não
  inventa prazo nacional; análise pendente não equivale a cancelamento confirmado.
- Documentação da fundação atualizada e regressões offline incorporadas ao CI.

## Validação e revisão

212 testes aprovados: 97 frontend/contratos, 86 SQL isolados, 14 provider/policy, 7 cadastro A1,
7 contratos do checker de terceiros e 1 PDF. Tipagem focada do módulo, lint do manifesto frontend e `deno check` da Edge aprovados.
Testes Deno reproduzidos com lock congelado e certificados sintéticos. Teste SQL usa PGlite:
comprova contrato/ACLs/rollback/replay, mas não a contenção entre sessões PostgreSQL reais.
O smoke Safari da fila usa somente dados sintéticos e transporte isolado: seleção de dois
alunos, perda de resposta após salvar e recuperação da mesma preparação sem duplicação;
Pendentes exibiu dois documentos e R$400,50. Não comprova RPC nova instalada nem emissão real.
Smoke autenticado SQL do backend concluído no projeto autorizado: configuração/replay,
autorização de upload, fila/replay, total canônico, duplicidade e imutabilidade. Todas as
mutações de teste revertidas; sete tabelas novas permanecem vazias. Vault real confirmou
criptografia, atualização e decriptação de segredo sintético, sem resíduo após ROLLBACK.
Edge nfse-certificate-upload v1 publicada com verify_jwt=true. Smoke Safari do candidato
e confirmação final da produção compõem o recibo operacional de publicação.

Teto proporcional validado no manifesto. Os 14 XSDs foram conferidos byte a byte contra os
ZIPs oficiais; o checker agora reconhece exclusivamente esses terceiros por path, hash e
procedência, sem ignorar a extensão globalmente. Seus sete testes recusam alteração e origem
indevida. Permanecem 39 referências históricas ausentes no checkout local; CI usa a árvore
remota completa. Build final será validado no CI/Preview com Node institucional, pois o Node
local 24.19.0 é anterior ao mínimo 24.22.1. Metadados de versão/changelog/manifestos são
reconciliados em overlay temporário com main, sem sobrescrever os arquivos locais paralelos.

Revisão independente encontrou e corrigiu: reaproveitamento de requestId após sucesso,
limite de precisão no mapper, POST mTLS sem guard obrigatório, datas impossíveis normalizadas
na política, respostas de upload sem whitelist e corrida upload/configuração antes do Vault.

## Fontes, integridade e limites

XSDs oficiais de produção e homologação foram preservados sem alterações; são fontes de
terceiros e exceção ao teto de linhas pelo AGENTS.md. Origem, SHA256 dos ZIPs e divergência
reproduzida da série DPS de produção estão no README do provider. Raízes ICP-Brasil são
certificados públicos do ITI com procedência/hash no README do cadastro; nenhuma chave real
ou dado pessoal faz parte do manifesto. Os lockfiles são arquivos gerados.

A fila não é o ledger de notas autorizadas/tentativas/eventos. Competência, tomador legal e
prestação não são inferidos do pagamento. Reserva não impede estorno posterior; futura
transmissão exige revalidar a origem. Nova preparação de candidato parcialmente reservado
no mesmo mês é bloqueada até seleção por ambiente que mostre só os recibos disponíveis.

Rollout de configuração ativado após migrations e publicação da Edge. Fila só libera
preparação após getter novo válido; o acesso piloto e governança matriz continuam exigidos.
Todo POST fiscal é bloqueado antes de socket com CONTRACT_UNVERIFIED: perfil criptográfico
vigente, envelope JSON/compressão e divergência do XSD de produção não foram encerrados.
Exportação e IBS/CBS permanecem sem suporte no builder; campos desconhecidos são rejeitados.
Assinatura offline não prova aceitação SEFIN, cadeia não prova revogação/representação e
visualizador XML não comprova autorização fiscal. Nenhum botão de cancelamento transmite.

As sete migrations aplicadas foram renomeadas conforme ledger, sem alterar conteúdo; SHA-256
remoto e local conferem. RLS e ACLs negam acesso direto às tabelas novas; helpers privados
não são executáveis pelo cliente e o writer Vault é exclusivo service_role. Nenhum segredo
foi adicionado para deploy: o runtime usa as credenciais institucionais já existentes.

Permanecem pendentes para emissão: certificado real/CRL-OCSP/representação, contrato SEFIN
vigente, confirmação fiscal/worker/ledger e autorização/consulta em homologação. Esta entrega
libera o ambiente para o usuário cadastrar seu certificado posteriormente. Cadastro não
habilita emissão. Recibos de migrations, Edge, commit, CI, Preview e produção ficam em tmp.
