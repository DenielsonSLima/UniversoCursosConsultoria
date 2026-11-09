# NFS-e — serviços para parceiros e visualizador XML

## Objetivo e aceite

Aba Serviços para parceiros permite preparar serviços a pessoas/empresas cadastradas, inclusive órgãos públicos, sem matrícula acadêmica. Modal institucional com parceiro pesquisável, modelo, descrição final, data da prestação e valor. Gerar contas a receber é decisão explícita, padrão Não; Sim permite criar um título ou vincular um existente compatível. Backend calcula/valida, autoriza antes do replay e conserva idempotência, auditoria e escopo por polo. Não cria boleto, baixa nem transmissão fiscal.

O visualizador recebe XML nacional, reproduz o DANFSe de referência em PDF vetorial, usando o mesmo Blob para prévia, download e impressão. Nome/forma nacional solicitados prevalecem sobre cabeçalho institucional genérico. XML e PDF reais enviados servem só à conferência local e não são fixtures nem arquivos publicados. Nenhuma assinatura ou autorização é declarada validada apenas pelo upload.

## Manifesto explícito

- `modules/gestor/emissor-nfse/parceiros/NfsePartnerFinancialFields.tsx`
- `modules/gestor/emissor-nfse/parceiros/NfsePartnerServiceModal.tsx`
- `modules/gestor/emissor-nfse/parceiros/ServicosParceirosNfseTab.tsx`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServiceDialog.ts`
- `modules/gestor/emissor-nfse/parceiros/hooks/useNfsePartnerServices.ts`
- `modules/gestor/emissor-nfse/parceiros/nfse-partner-services.css`
- `modules/gestor/emissor-nfse/parceiros/nfse-partner-services.presentation.ts`
- `modules/gestor/emissor-nfse/parceiros/queries/nfse-partner-services.keys.ts`
- `modules/gestor/emissor-nfse/parceiros/realtime/useNfsePartnerServicesRealtime.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.test.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.contract.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.service-core.ts`
- `modules/gestor/emissor-nfse/parceiros/services/nfse-partner-services.service.ts`
- `modules/gestor/emissor-nfse/parceiros/types/nfse-partner-services.types.ts`
- `modules/gestor/emissor-nfse/visualizador/NfseXmlViewerModal.tsx`
- `modules/gestor/emissor-nfse/visualizador/assets/LIBERATION-LICENSE.txt`
- `modules/gestor/emissor-nfse/visualizador/assets/LiberationSans-Bold.ttf`
- `modules/gestor/emissor-nfse/visualizador/assets/LiberationSans-Regular.ttf`
- `modules/gestor/emissor-nfse/visualizador/assets/README.md`
- `modules/gestor/emissor-nfse/visualizador/assets/nfse-national-logo.png`
- `modules/gestor/emissor-nfse/visualizador/danfse.assets.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf-layout.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf-parties.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf-taxes.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.presentation.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.projection.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.xml.test.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.xml.ts`
- `modules/gestor/emissor-nfse/visualizador/hooks/useDanfseProjection.ts`
- `modules/gestor/emissor-nfse/visualizador/nfse-xml-viewer.css`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-projection.contract.test.ts`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-projection.service-core.ts`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-projection.service.ts`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/access/useNfsePilotAccess.ts`
- `modules/gestor/emissor-nfse/access/nfse-access.contract.ts`
- `modules/gestor/emissor-nfse/access/nfse-pilot-access.test.ts`
- `.github/workflows/nfse-regressions.yml`
- `supabase/migrations/20261108234843_nfse_partner_services_store.sql`
- `supabase/migrations/20261108234854_nfse_partner_services_reads.sql`
- `supabase/migrations/20261108234906_nfse_partner_services_save.sql`
- `supabase/migrations/20261109000433_nfse_danfse_projection.sql`
- `supabase/tests/nfse_partner_services.fixture.sql`
- `supabase/tests/nfse_partner_services.isolated.test.mjs`
- `supabase/tests/nfse_danfse_projection.isolated.test.mjs`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-parceiros-visualizador.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 56 arquivos.

## Validação

83 testes frontend, 55 testes SQL isolados e 1 teste do PDF aprovados. TypeScript do módulo e lint focado aprovados. As quatro migrations novas foram aplicadas pelo MCP Supabase; ledger e conteúdo preservados. Smoke Postgres real por identidade/contexto do piloto e ROLLBACK validou preparação, criação canônica, replays, ACLs e polo; zero títulos ou preparações de teste persistidos. Projeção fiscal também executada em transação READ ONLY, com cálculo decimal e recusa de polo estrangeiro.

Smoke Safari local: modalidades Não, Criar nova e Vincular existente salvaram e retornaram a lista com total do backend. XML fornecido produziu DANFSe com texto selecionável; download confirmado e diálogo de impressão A4/uma página aberto e cancelado. Modais do visualizador e de serviços conferidos em 390px. Artefatos e dados pessoais permanecem em tmp/Downloads fora do manifesto.

Pedido adicional de piscada ao trocar aba: gate de acesso invalidava a liberação durante todo isFetching. A decisão válida da mesma identidade permanece enquanto revalida; recusa/erro/troca de identidade bloqueiam. QueryObserver com foco e smoke Safari do hook real confirmaram rascunho preservado, 1 montagem/0 desmontagens durante foco e renovação; recusa bloqueou após resposta. RPCs continuam autorizando cada operação.

## Contratos, fontes e limites

- Serviços usam parceiros PF/PJ ativos e títulos avulsos elegíveis OUTROS_CREDITOS. Gerar conta exige autorização financeira, cria uma conta local PENDENTE ou vincula uma existente compatível; nunca baixa nem emite boleto. Idempotência por usuário/requisição e bloqueio de título já vinculado.
- NFS-e API continua sem transmissão ativa. Este lote entrega preparação e visualização; preparar um serviço não declara nota autorizada.
- Projeção DANFSe: NT 008 v1.02 de 14/07/2026, pp.19–20, e XSD oficial v1.01. Apenas componentes monetários explícitos e indicadores vão à RPC; XML bruto, chave e dados pessoais ficam no navegador. Somatórios e retenções são calculados em NUMERIC no servidor.
- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf
- https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip
- O compositor preserva o modelo nacional vetorial A4 e não declara validação de assinatura. Liberation Sans livre substitui Arial/Microsoft Sans Serif; máscara do QR pode variar. Valores ausentes no XML permanecem ausentes, mesmo quando o PDF externo mostra zeros. Municípios sem nome no XML são identificados pelo código disponível. Conteúdo que exceda uma página falha explicitamente, sem corte silencioso.
- Teto de linhas validado no manifesto. O check global local encontra 39 referências antigas ausentes neste checkout; o checkout completo de CI é o gate final. Build completo ocorre em CI/Preview com Node exigido, pois o Node local é anterior ao mínimo de segurança.
- Publicação com manifesto fechado sobre main remoto atual; sem sobrescrever alterações paralelas de metadados locais. Recibo de commit, checks, Preview e produção em tmp.

Pesquisa de alternativas: `nfse-nacional/danfse-php`, `wedigibrasil/notaas-danfse` e `RicardoBiazin/nfse-nacional` no GitHub oferecem renderização nacional. Nenhum código desses projetos foi copiado; o compositor usa o pipeline jsPDF do produto e o documento fornecido como referência visual.
