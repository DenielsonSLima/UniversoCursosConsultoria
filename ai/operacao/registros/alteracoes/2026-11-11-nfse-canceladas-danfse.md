# NFS-e: cancelamento visível no DANFSe e aba Canceladas

## Pedido e aceite

Extensão do lote NFS-e 4.8.287: identificar a nota cancelada no PDF e separar
Canceladas de Emitidas, mantendo o padrão compacto, filtros e downloads. O usuário
reiterou autorização para revisar e publicar no GitHub e em produção.

## Contrato final

- CANCELADA só deriva do estado canônico confirmado, nunca do XML autorizado
  original, justificativa ou intenção de cancelar. Solicitações pendentes não marcam.
- Prévia, impressão, PDF individual e ZIP usam o mesmo compositor/Blob vetorial.
  O texto nativo regular de 80pt, diagonal a 45° e cinza K35 segue a orientação
  da NT008 v1.02, §2.5.1, p.23. Liberation Sans Regular já incorporada é compatível
  em métricas; não se afirma que seja Arial literal. Logo, QR e dados são preservados.
- Emitidas envia ACTIVE; Canceladas envia CANCELLED. A RPC usa o 13º argumento
  opcional p_issued_state; null preserva chamadas legadas e o status EMITIDA da
  autorização histórica. Partição, busca, datas, modalidade, origem, total e
  paginação são resolvidos no servidor, sem filtrar apenas a página do cliente.
- Canceladas exige state=CANCELLED, code=CONFIRMED, evento101101 e XML do evento
  persistido. Sem prova, a projeção é pendente; notas e financeiro não são alterados.
- Cache considera escopo, identidade, estado e cancelamento. O visualizador segue
  atualizações da consulta e o ZIP resolve cada identidade antes de ler/compor.
  Página antiga invalidada ou mais velha não restaura autorização removida da
  lista atual. Ausência fecha a seleção; não se infere um cancelamento.
- Canceladas conserva consulta/PDF/XML/ZIP e não oferece novo cancelamento.
  Realtime invalida ambas as partições; não há polling ou POST fiscal novo.

## Validação e evidência

- Compositor e ponte das três saídas: 2/2; contratos XML/ZIP:18/18; contrato de
  filtros/partição/cache:15/15; interface de sete abas/listas:2/2; SQL isolado:6/6.
  Revisão independente repetiu os casos de pendência/rejeição, cache e ambiente.
- Smoke autenticado da marca: Safari local mostrou situação Cancelada, marca
  CANCELADA e SN12,00%. PDF baixado:82.555 bytes, uma A4, marca nativa rotacionada;
  SHA256 26fcb1f815c0664e354e7913a1de45113f0063ad20294dd70a62a3785fbc6c90.
- Antes da marca, ZIPs reais das duas notas já passaram com dois membros/CRC íntegro;
  ambos os hashes XML continuam idênticos aos originais. Nenhuma nova emissão.
- Migration aplicada via MCP:20261111042040_nfse_cancelled_document_partition,
  SHA256421ae583a958d33fe8fafe63ea3cf91e477344a206e9c398f95ddc0a685328f0.
  Uma RPC13args, somente authenticated EXECUTE; legado revogado e view privada
  sem leitura da aplicação. Estado remoto:0ativas e2canceladas confirmadas.
- Smoke autenticado final: Emitidas=0; Canceladas=2; busca pela nota3=1; menu
  oferece somente Consultar. ZIP real das duas canceladas tem duas marcas nativas
  CANCELADA, uma por PDF/A4. Compositor, consulta e downloads conferidos na sessão.
- Build Node24.22.1 aprovado; CI/Preview do candidato final devem passar antes
  da publicação autorizada. A entrega remota acompanha o PR379.

## Referência oficial

[NT008 v1.02,14/07/2026,§2.5.1,página23](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf).
O XML original não é reescrito; a situação confirmada é uma camada de apresentação.
PDFs baixados antes do cancelamento permanecem artefatos históricos.

## Manifesto explícito

Total: 32 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-producao-individual-cancelamento.md`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-canceladas-danfse.md`
- `internal/versioning/CHANGELOG.md`
- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/canceladas/CanceladasNfseTab.tsx`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/emissao/NfseDailyFlow.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emissao/NfseDocumentOperationMenu.tsx`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedList.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/nfse-download.service.ts`
- `modules/gestor/emissor-nfse/emitidas/useNfseDownloads.ts`
- `modules/gestor/emissor-nfse/queries/nfse.queryKeys.ts`
- `modules/gestor/emissor-nfse/services/nfse-document-filters.ts`
- `modules/gestor/emissor-nfse/services/nfse-documents.contract.test.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.presentation.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/hooks/useNfseIssuedSelection.ts`
- `modules/gestor/emissor-nfse/visualizador/hooks/useNfseIssuedXml.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-cancelled-downloads.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-pdf.service.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-presentation.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.contract.test.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.service-core.ts`
- `supabase/migrations/20261111042040_nfse_cancelled_document_partition.sql`
- `supabase/tests/nfse_cancelled_document_partition.isolated.test.mjs`
