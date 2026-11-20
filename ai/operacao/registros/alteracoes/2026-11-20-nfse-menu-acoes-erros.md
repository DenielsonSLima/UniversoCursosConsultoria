# Menu de ações na aba Erros da NFS-e · 4.8.368

A aba Emitidas carregava o estilo que fixa o menu de ações junto ao botão. Ao entrar direto em Erros, o primeiro item recebia foco fora do painel, a página rolava e o menu era fechado. O estilo agora é carregado com as demais regras compartilhadas do Emissor.

## Manifesto explícito

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-20-nfse-menu-acoes-erros.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `modules/gestor/emissor-nfse/erros/ErrosNfseTab.interaction.test.mjs`
- `modules/gestor/emissor-nfse/nfse.css`

Total: 8 arquivos.

## Validação

- A regressão executa a aba Erros com o CSS compartilhado e verifica o posicionamento fixo e o fechamento por Escape.
- O clique e a confirmação foram exercitados no WebKit local. No Chromium local, o teste usou larguras de desktop e celular e percorreu o menu por teclado. A validação usou registros fictícios.
