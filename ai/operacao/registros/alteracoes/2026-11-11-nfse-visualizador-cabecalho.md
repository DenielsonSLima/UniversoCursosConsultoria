# NFS-e: visualizador com cabeçalho compacto

## Pedido e aceite

Remover a faixa “DANFSe da nota emitida · Produção” e colocar Baixar PDF e
Imprimir na linha superior, junto do título e de Fechar, liberando altura
para a prévia. Publicação em produção solicitada pelo usuário.

## Alteração

- Título e as três ações ficam no mesmo cabeçalho; a faixa secundária foi removida.
- Telas pequenas mantêm ações acessíveis, com título flexível e quebra controlada.
- Os mesmos handlers de baixar, imprimir e fechar foram preservados, incluindo
  desabilitação durante carregamento, erro e impressão em andamento.
- PDF, XML, nome do arquivo, conteúdo fiscal, autenticação e banco não mudaram.
- Base remota 8dd87dd1ca8e3cad7b2c41f0966d34f0f02f9173, versão 4.8.288.
- Histórico antigo 4.8.215–217 movido integralmente para arquivo próprio para
  respeitar o teto de 500 linhas, sem apagar entradas.

## Validação

- Teste de interação do componente real com serviços sintéticos: cabeçalho,
  ausência da faixa, estados de carregamento e erro, download repetido,
  impressão sem duplicação, fechar por botão/Escape/fundo, restauração de foco,
  reabertura e aborto da impressão ao desmontar. Aprovado.
- ESLint focado aprovado. Nenhuma chamada fiscal ou cliente real no teste.
- Smoke autenticado pendente: navegador cloud está na tela de login e Mac offline.
- Prévia local de navegador indisponível por restrição ao servidor/processo local.
  Teste DOM não é apresentado como substituto da conferência visual autenticada.
- Build completo, CI e Preview são conferidos remotamente antes de publicar.
  Resultado final é verificável no commit, PR e deployment da 4.8.289.

## Manifesto explícito

Total: 10 arquivos

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-11-nfse-visualizador-cabecalho.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `internal/versioning/changelog/2026-10-13-versoes-4-8-215-a-217.md`
- `modules/gestor/emissor-nfse/visualizador/NfseXmlViewerModal.tsx`
- `modules/gestor/emissor-nfse/visualizador/nfse-xml-viewer.css`
- `modules/gestor/emissor-nfse/visualizador/NfseXmlViewerModal.interaction.test.mjs`
