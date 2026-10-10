# Correção dos avisos de build Vite e npm

Lote independente: 2026-10-10-build-avisos-vite-npm. Versão 4.8.200, revisão 209.
Publicação em produção solicitada pelo usuário em 10/10/2026. Três agentes convocados expressamente pelo usuário revisaram
importação da Secretaria, divisão de chunks e scripts de instalação.
O lote ativo de transferência continua sob a responsabilidade da frente paralela;
A publicação usa main/dd1c1c1, que já contém a entrega de transferência 4.8.199.

## Objetivo e aceite

O log de main/3fa2dc8 concluiu build e deploy, mas apresentou importação mista,
seis chunks JavaScript acima de 500 kB e quatro scripts npm não revisados.
Aceite: corrigir a importação redundante, diminuir os chunks sem aumentar
o limite do aviso e registrar decisões explícitas sobre os scripts de instalação.
Preservar permissões, navegação, dados, compositor e bytes das fontes PDF.

## Correção

- Hook de identificação usa o serviço já importado estaticamente.
- Configurações, abas financeiras e detalhes/formulários/exportação de Parceiros
  usam lazy/Suspense. O modal exportador é montado somente enquanto aberto.
- Vite separa React, helpers e biblioteca/codecs PDF com
  `onlyExplicitManualChunks`, mantendo as dependências do aplicativo automáticas.
- As quatro fontes originais Inter tornam-se assets TTF servidos pelo Vite.
  O mesmo ArrayBuffer alimenta FontFace e a mesma codificação base64 alimenta
  jsPDF. Fetch, resposta vazia e falha de parsing de FontFace permitem nova busca.
  A fonte gerada `inter-ttf.ts` permanece como referência de paridade do teste.
- npm permite apenas `esbuild@0.25.12`; Firebase util, core-js e protobufjs têm
  scripts recusados explicitamente. Dependências e lockfile não foram alterados.
- O verificador de linhas reconhece a extensão binária TTF, como já fazia com
  WOFF/WOFF2, aplicando a exceção de binários do AGENTS sem alterar a política.

## Manifesto explícito

- `package.json`
- `vite.config.ts`
- `modules/gestor/configuracoes/ConfiguracoesPage.tsx`
- `modules/gestor/financeiro/FinanceiroPage.tsx`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/useUpdateDocumentIdentity.ts`
- `modules/gestor/secretaria/certificados/ead-certificate-pdf-fonts.ts`
- `modules/gestor/secretaria/certificados/pdf-assets/inter-fonts.ts`
- `modules/gestor/secretaria/certificados/pdf-assets/Inter-400.ttf`
- `modules/gestor/secretaria/certificados/pdf-assets/Inter-600.ttf`
- `modules/gestor/secretaria/certificados/pdf-assets/Inter-700.ttf`
- `modules/gestor/secretaria/certificados/pdf-assets/Inter-900.ttf`
- `modules/gestor/secretaria/certificados/ead-certificate-pdf-fonts.test.mjs`
- `modules/gestor/secretaria/certificados/ead-curriculum.pdf.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/ead-history-print.ui.test.mjs`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/qualidade/limite-linhas.json`
- `scripts/check-file-line-limits.mjs`
- `ai/operacao/registros/alteracoes/2026-10-10-build-avisos-vite-npm.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versoes-4-8-117-a-4-8-127.md`

Total: 22 arquivos.

## Validação

- Reprodução local por `npm run build`: mesmos avisos do log antes do patch.
- Build corrigido sem avisos de importação mista ou chunks acima de 500 kB;
  zero ciclos estáticos entre chunks, vendors sem importar a entrada principal.
- Chunks antes/depois locais, em kB: Configurações 564,72/25,10;
  Financeiro 623,06/15,41; Parceiros 516,59/78,81; entrada 554,39/318,97.
  O literal Inter de 1.739,53 kB sai do JavaScript; TTFs somam 1.304.596 bytes.
- 18 testes focados passaram: fontes, navegação/permissões financeiras e seleção
  de responsáveis. A frente da Secretaria também validou 5 testes do hook e
  7 testes de integração do contrato de identificação, com IO controlado.
- Matcher real npm verificou decisões sobre os quatro pacotes exatos do lock.
  Smoke esbuild compilou e executou TypeScript. Lint dos sete TS/TSX do manifesto
  passou. TypeScript final passou sem erros.
- Safari: build normal abre login; smoke isolado com páginas reais e IO de leitura
  sintético validou abertura/volta de Status da API, Resumo e A Pagar,
  Parceiros, abertura/reabertura do exportador e cadastro PF/cancelamento.
- Safari carregou os quatro TTFs emitidos pelo Vite e gerou PDF pelo compositor
  nativo `buildEadCertificatePdf`. PDF A4 horizontal, 152.623 bytes, texto com
  acentos extraído corretamente, quatro fontes Unicode embutidas, sem imagens.
  Página renderizada inspecionada. Nenhum documento/matrícula/cobrança real criado.
- `npm run check:file-lines` passou; todos os arquivos manuais deste manifesto
  têm no máximo 499 linhas; os quatro TTFs são binários.
- Preview inicial Vercel concluída sem os avisos originais. CI de segunda via
  identificou ausência de loader TTF no harness; o teste foi adaptado para data URLs
  com os bytes reais. A checagem remota será repetida sobre o candidato corrigido.
- Artefatos e harnesses temporários permanecem em tmp e dist, fora do manifesto.

## Limites e entrega

Entrega local validada e publicação autorizada. Preview, checks remotos e smoke
autenticado serão conferidos antes do fechamento da produção; a sessão de produção não autentica a
origem local. O smoke isolado não comprova autorização ou disponibilidade remota.
A suíte PDF completa que requer fixture SQL real não foi executada; foram usados
paridade binária, jsPDF real e o compositor nativo no Safari no caminho afetado.
O npm local difere do ambiente Vercel e versões instaladas de dependências também
diferem parcialmente do lock: validar instalação limpa na Preview deste lote.

O Git local não funciona por licença Xcode pendente; nenhum aceite foi feito.
Diffs foram conferidos contra backups restritos ao manifesto. Registro separado
preserva o lote paralelo. Changelog arquivado conserva todas as entradas históricas.
Manifesto será publicado em um commit atômico via MCP GitHub e uma Preview Vercel.

Referências primárias: [npm allowScripts](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/),
[Rollup manualChunks](https://rollupjs.org/configuration-options/#output-manualchunks)
e [Vite 6 build](https://v6.vite.dev/config/build-options).
