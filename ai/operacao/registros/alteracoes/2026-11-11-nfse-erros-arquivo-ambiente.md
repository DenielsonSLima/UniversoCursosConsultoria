# NFS-e: arquivo de erros e ambiente fiscal coerente

## Pedido e aceite

O usuário pediu seleção e remoção na aba Erros e apontou Configurações em
Homologação enquanto o Emissor estava em Produção. A autorização de revisar e
publicar o domínio NFS-e permanece vigente; esta entrega corresponde à 4.8.288.

## Comportamento final

- Erros permite selecionar um ou vários registros elegíveis e Remover da lista.
  Arquivados permite consultar e restaurar individualmente ou em lote. Confirmação
  e retorno visual usam os componentes do sistema; falhas preservam a seleção.
- A remoção é metadado reversível e auditado. Não apaga operações, XMLs, origem,
  recebimentos, reserva fiscal, financeiro ou sequência DPS. Só uma rejeição
  definitiva sem número/chave/XML autorizado pode ser arquivada. Pendências,
  bloqueios e resultados incertos não são elegíveis.
- RPC autentica e autoriza o escopo, limita a cem IDs únicos e rejeita o lote
  misto integralmente. RequestId é idempotente por ator e operação; locks das
  operações são compatíveis com CLAIM/FINISH. Arquivo/restauração usa auditoria
  privada sem grants diretos da aplicação e com RLS.
- Partição ACTIVE/ARCHIVED, total e paginação são resolvidos no servidor. A RPC
  de documentos passa a quatorze argumentos opcionais compatíveis; a sobrecarga
  anterior foi retirada da aplicação. Query keys incluem archiveMode. Mutação e
  Realtime invalidam o escopo; nenhum polling ou POST fiscal foi introduzido.
- O defeito de ambiente era local: Configurações iniciava HOMOLOGACAO, Emissor
  PRODUCAO. Ambos agora usam a mesma preferência por contexto e polo, Produção
  por padrão, preservando uma escolha explícita de Homologação na sessão.
  sessionStorage contém só o nome do ambiente, sem credenciais/dados fiscais.
- O painel informa histórico autorizado no ambiente consultado e cancelamento
  confirmado da última nota. Histórico não se converte em READY nem comprova
  autorização corrente. Falhas e troca de escopo não reutilizam o histórico antigo.
- A emissão conserva validações de escopo, configuração/fingerprint, certificado,
  assinatura, DPS e tpAmb=1. Nenhum parâmetro de homologação foi copiado para
  produção; a inscrição municipal específica de cada ambiente foi preservada.

## Banco aplicado e conferido

MCP Supabase, projeto autorizado, duas migrations imutáveis:

- 20261111091445_nfse_error_archive:
  SHA256 2243bd8314412e65b730cb9f6b54fbb63b9fa018831c7fd8cb160c134f379359.
- 20261111092451_nfse_error_archive_without_identity:
  SHA256 784239c2f58bb33128e5c0eec4627878e201c2ef289664b3bb28701fb4224b2d.

A segunda fecha o caso de identidade vazia, com revisão independente prévia.
Conferência: uma RPC de leitura pública de quatorze argumentos, EXECUTE somente
para authenticated; sobrecarga legada revogada, tabelas privadas protegidas.
Zero registros reais arquivados e zero solicitações de arquivo; uma rejeição
ativa elegível, duas autorizações históricas e DPS alocada até três preservadas.

## Validação

- Contratos NFS-e: 249/249; SQL isolado: 6/6, repetido independentemente.
- Ambiente: quatro contratos de armazenamento e cinco testes DOM com consumidores
  reais, painel de configuração e numeração. Escopos/cache, troca, remontagem,
  storage indisponível e erro sem histórico residual conferidos.
- Erros DOM cobre seleção, confirmação, erro, replay idempotente, restauração,
  última página e legado sem origem navegável. Fluxo diário e Emitidas passaram.
- TypeScript e lint focados sem diagnóstico. Build completo Node24.22.1 aprovado.
- Reprodução autenticada anterior ao patch no Safari publicado: consulta em
  Produção mostrou última NFS-e3 cancelada, DPS3 e próxima4; Homologação sem nota.
  Nenhum salvamento fiscal foi executado nessa conferência.
- Smoke nativo final da interface nova permanece pendente: cgWindowNotFound
  persistiu após o usuário deixar o Portal visível. Testes DOM não são apresentados
  como substituto desse smoke. Não houve nova emissão, cancelamento ou arquivo real.
- Publicação: candidato atômico via MCP GitHub; CI e Preview devem estar aprovados
  antes da integração autorizada. Resultado final de deployment será registrado no PR.

## Manifesto explícito

Total: 28 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-erros-arquivo-ambiente.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCompanyPanel.tsx`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationAction.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationMenu.tsx`
- `modules/gestor/emissor-nfse/erros/ErrosNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/erros/ErrosNfseTab.tsx`
- `modules/gestor/emissor-nfse/erros/nfse-error-archive.contract.test.ts`
- `modules/gestor/emissor-nfse/erros/nfse-error-archive.contract.ts`
- `modules/gestor/emissor-nfse/erros/useNfseErrorArchive.ts`
- `modules/gestor/emissor-nfse/hooks/nfse-environment.store.test.ts`
- `modules/gestor/emissor-nfse/hooks/nfse-environment.store.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseEnvironment.interaction.test.mjs`
- `modules/gestor/emissor-nfse/hooks/useNfseEnvironment.ts`
- `modules/gestor/emissor-nfse/queries/nfse.queryKeys.ts`
- `modules/gestor/emissor-nfse/services/nfse-document-filters.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `supabase/migrations/20261111091445_nfse_error_archive.sql`
- `supabase/migrations/20261111092451_nfse_error_archive_without_identity.sql`
- `supabase/tests/nfse_error_archive.isolated.test.mjs`
