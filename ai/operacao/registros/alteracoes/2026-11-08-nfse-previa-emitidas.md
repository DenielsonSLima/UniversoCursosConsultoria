# NFS-e — prévia e downloads das notas emitidas

## Objetivo e aceite

Correção solicitada: retirar o pedido de XML no computador e abrir a prévia da nota emitida
na própria lista. Fluxo de leitura, sem migration ou alteração do compositor.
Extensão autorizada em 09/11/2026: opções PDF/XML no menu da nota e seleção para downloads ZIP.
Produção explicitamente autorizada em 09/11/2026 após revisão por três agentes. Mudança crítica
por publicação: candidato 4.8.276 sobre main 4.8.275. Emissão e cancelamento continuam bloqueados.
Aceite: menu e seleção por nota/página sem upload; PDF/XML e ZIP com identidade/hash conferidos;
preservação do compositor e dos gates fiscais, sem afirmar recuperação remota já implantada.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-previa-emitidas.md`
- `docs/contracts/nfse-issued-preview.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/components/NfseDocumentsList.tsx`
- `modules/gestor/emissor-nfse/emitidas/EmitidasNfseTab.tsx`
- `modules/gestor/emissor-nfse/emitidas/NfseDocumentActions.tsx`
- `modules/gestor/emissor-nfse/emitidas/nfse-download.contract.test.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-download.core.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-download.service.ts`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `modules/gestor/emissor-nfse/emitidas/useNfseDownloads.ts`
- `modules/gestor/emissor-nfse/preparar/useNfseStudentsDialog.ts`
- `modules/gestor/emissor-nfse/visualizador/NfseXmlViewerModal.tsx`
- `modules/gestor/emissor-nfse/visualizador/danfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.xml.ts`
- `modules/gestor/emissor-nfse/visualizador/hooks/useNfseIssuedXml.ts`
- `modules/gestor/emissor-nfse/visualizador/nfse-xml-viewer.css`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.contract.test.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.service-core.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-xml.service.ts`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-pdf.service.ts`

Total: 25 arquivos.

## Implementação e limites

Ação individual por documento e modal sem importação de arquivos. Consulta sob demanda isolada
por escopo e identidade, cancelamento de leitura/projeção e comparação de número, chave,
ambiente e SHA-256. O compositor nacional e o Blob único de prévia/download/impressão permanecem.
O helper de foco passa a aceitar botão, preservando o padrão input dos demais consumidores.

O menu de três pontos usa portal e teclado/foco. Download XML conserva os bytes UTF-8 do
artefato validado; PDF individual e ZIP usam o mesmo pipeline de prévia. Seleção restrita à
página corrente é limpa na busca/paginação; contextos e operações em andamento são isolados.
ZIPs têm dois leitores concorrentes, cancelamento/progresso e limites de 100 notas/50 MiB.
Qualquer falha aborta o lote; não há ZIP incompleto ou omissão silenciosa de documentos.

Foi confirmado que a lista fiscal central ainda está bloqueada e não existe ledger de XMLs
autorizados. O consumidor da RPC proposta get_nfse_authorized_xml_secure permanece sob o mesmo
gate desativado. A recuperação real depende desse backend e da homologação; a interface não
inventa uma emissão nem oferece upload como substituto. Contrato detalhado em docs/contracts.

## Validação

113 testes do módulo aprovados, incluindo oito contratos de identidade/escopo/hash/artefato e
oito contratos de download com ZIP real. Contrato PDF nativo (1 teste), tipagem e lint focados
aprovados. Revisão independente da extensão não encontrou bloqueante de segurança/escopo ou
arquivo parcial; o blur do menu foi ajustado para ignorar retorno ao próprio botão de opções.
Revisão independente detectou retenção da prévia quando uma revalidação termina em erro:
corrigido com descarte dos dados nessa condição, cancelamento da impressão e bloqueio das
ações durante erro/nova leitura. O compositor não foi alterado.

Manifesto de implementação com 23 arquivos existentes, nenhum manual acima de 500 linhas;
publicação acrescenta versão/changelog (25 no total), reconciliados com main em overlay
temporário para preservar arquivos locais paralelos. O checker geral
continua somente com as mesmas 39 referências históricas ausentes no checkout, fora deste lote.
Smoke visual pendente: getApp Safari retornou Sky Computer Use native pipe startup failed.
Nenhum navegador alternativo foi usado; os contratos automatizados não substituem esse smoke.
Revisão completa repetiu 221 testes: 113 frontend, 1 PDF, 14 provider, 7 A1 e 86 SQL isolados.
Sem novo bloqueante de segurança/escopo identificado. Supabase confirmado por leitura: Edge A1
ativa com JWT, RPCs de configuração/fila instaladas, nenhum certificado real ou nota fiscal.
CI/Preview e implantação final serão conferidos pelo commit exato; recibo sanitizado fica em tmp.
Sem migration ou nova operação remota Supabase neste lote. Nenhuma nota será transmitida.
