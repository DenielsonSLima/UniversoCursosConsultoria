# NFS-e — fundação local, etapa 1

Data: 2026-11-07.
Status: implementação local; conferência visual parcial. Sem publicação, aplicação de SQL ou emissão.
Classificação: mudança crítica pelo domínio fiscal/financeiro, com escopo desta etapa limitado à interface e aos contratos de dados.

## Objetivo e entrega

Criar Emissor NFS-e imediatamente após Financeiro e NFS-e Portal Contribuinte em Configurações, seguindo o padrão compacto vigente. O submódulo de configuração é apresentado somente no contexto autorizado da matriz e reutiliza o catálogo existente de Polos e Filiais.

O emissor possui Preparar emissão, Pendentes, Emitidas, Erros e Modelos em pastas próprias. TanStack Query, services, hooks, Realtime, tipos e API interna ficam separados. O frontend formata strings monetárias e apresenta totais do contrato; não calcula recebimentos, elegibilidade ou valor fiscal.

As permissões incluem o novo módulo explicitamente; Financeiro e o fallback legado não concedem acesso fiscal por extensão. A autorização no servidor ainda será implementada. A API interna e a emissão não são executáveis nesta etapa.

Participaram três agentes independentes: dados/contratos, telas e configuração. Houve revisão cruzada da integração e revisão final de escopo.

## Etapas e aceite

1. **Fundação local (implementada, smoke parcial):** navegação, cinco abas, configuração por estabelecimento, tipos e contratos RPC, cache por escopo, apresentação compacta e bloqueios operacionais.
2. **Backend/RPC (pendente):** modelar configuração e modelos versionados; resolver CNPJ em Polos e Filiais; autorizar identidade/contexto/polo no SQL; calcular recebimentos confirmados no mês; separar mês recebido de competência fiscal; validar aluno/tomador; reservar recebimentos atomicamente para impedir dupla preparação. Incluir testes de autorização, concorrência e reversão.
3. **Certificado/API (pendente):** armazenamento seguro exclusivamente no servidor, validação do certificado/representação de cada CNPJ, DPS/XML/assinatura e comunicação com API nacional em homologação. Login do portal não substitui autenticação fiscal da API.
4. **Fila e recuperação (pendente):** seleção em lote incluindo páginas não carregadas, snapshot confirmado por RPC, despacho individual, sucesso preservado, erros por documento, consulta antes de reenviar resposta incerta, auditoria e eventos Realtime sanitizados.

Antes de qualquer ativação é necessário validar SQL/RLS, runtime seguro de certificado e fluxo de homologação. Não habilitar apenas as flags. Produção continua fora do escopo autorizado.

## Validação

- Testes focados: 41 aprovados com `node scripts/test-nfse-local-stage1.mjs`.
- TypeScript focado nos dois diretórios novos: aprovado.
- Bundle de prévia com componentes reais e transporte fiscal bloqueado: aprovado.
- Lint de todos os arquivos TypeScript/TSX e do runner no manifesto: aprovado após remover parâmetro de tipo DOM dispensável.
- Revisão adicional: escopos isolados, flags fechadas, valores desconhecidos distintos de zero e destinos do portal rotulados como produção.
- Safari: Preparar, Pendentes, Emitidas, Erros, Modelos e abertura do formulário de modelo conferidos com dados sintéticos. Botões fiscais permanecem desabilitados.
- Pendente: smoke visual de Configurações, troca de filial, seletor de ambiente e viewport 390 px. A aba ativa foi alterada durante o controle do Safari; a revisão automática bloqueou uma leitura completa quando a janela estava no Vercel. O usuário autorizou reservar o Safari, mas as novas tentativas também foram interrompidas por mudanças de aba/foco. Nenhum acesso ao Vercel é necessário para esta entrega.
- Não houve teste contra RPC real, banco, Realtime remoto, certificado ou API nacional.
- O teto de 500 linhas foi conferido nos 48 arquivos do manifesto abaixo; maior arquivo com 401 linhas. A auditoria não foi ampliada para outros lotes.

## Isolamento e limites

`NFSE_BACKEND_ENABLED`, `NFSE_WRITES_ENABLED` e `NFSE_PROVIDER_ENABLED` permanecem falsos. Leitura fiscal, gravação e transmissão falham explicitamente antes da rede. O catálogo existente de polos continua usando seu serviço autorizado, sem alteração de dados.

A prévia temporária em `tmp/nfse-stage1-ui` usa unidades sintéticas, bloqueio de conexão e os componentes reais; não integra o manifesto. Não representa homologação ponta a ponta nem comprova permissão no banco.

O lote de Configurações já existente em LOTE_ATIVO foi preservado. Este registro mantém o manifesto específico da etapa NFS-e. Não foram alterados versão, changelog, registro global de manifestos ou fontes enumeradas no RAG. Não houve reindexação.

Contrato: [nfse-local-stage1](../../../../docs/contracts/nfse-local-stage1.md).
Estudo anterior: [NFS-e Nacional](../../../../docs/estudos/2026-11-07-nfse-nacional.md).

## Manifesto explícito

- `modules/gestor/access-control.ts`
- `modules/gestor/components/GestorModuleContent.tsx`
- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/configuracoes/usuarios/components/user-access-options.tsx`
- `modules/gestor/gestor-navigation.config.ts`
- `modules/gestor/gestor-navigation.config.test.ts`
- `modules/gestor/gestor-navigation.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/api/nfse-api.contract.ts`
- `modules/gestor/emissor-nfse/api/nfse-api.ts`
- `modules/gestor/emissor-nfse/components/NfseDataState.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/components/NfsePager.tsx`
- `modules/gestor/emissor-nfse/components/NfseTabContext.tsx`
- `modules/gestor/emissor-nfse/components/nfse.presentation.test.ts`
- `modules/gestor/emissor-nfse/components/nfse.presentation.ts`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/erros/ErrosNfseTab.tsx`
- `modules/gestor/emissor-nfse/hooks/useNfseMutations.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseRealtime.ts`
- `modules/gestor/emissor-nfse/modelos/ModelosNfseTab.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/nfse-access.contract.test.ts`
- `modules/gestor/emissor-nfse/nfse.css`
- `modules/gestor/emissor-nfse/pendentes/PendentesNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/queries/nfse.queryKeys.ts`
- `modules/gestor/emissor-nfse/realtime/nfse.realtime.ts`
- `modules/gestor/emissor-nfse/services/nfse-contract.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.errors.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/services/nfse.runtime.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `modules/gestor/emissor-nfse/services/nfse.service.ts`
- `modules/gestor/emissor-nfse/services/nfse.validation.ts`
- `modules/gestor/emissor-nfse/types/nfse.scope.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/NfsePortalContribuinteConfig.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseConfigurationForm.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/hooks/useNfsePolos.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/nfse-portal-contribuinte.css`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/queries/nfse-config.queryKeys.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/services/nfse-polos.service.ts`
- `scripts/test-nfse-local-stage1.mjs`
- `docs/contracts/nfse-local-stage1.md`
- `ai/operacao/registros/alteracoes/2026-11-07-nfse-fundacao-local.md`

Total: 48 arquivos.

