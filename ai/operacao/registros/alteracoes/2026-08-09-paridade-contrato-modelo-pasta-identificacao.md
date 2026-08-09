# Alteração — paridade do Contrato com o modelo e a Pasta de Identificação

- Lote: `2026-08-09-paridade-contrato-modelo-pasta-identificacao`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: emissão canônica e histórica do Contrato de Aluno, snapshot institucional, compositor PDF e workspace Individual/Em lote/Personalizado.
- Não alterado: texto jurídico aprovado, regras financeiras, cadastros oficiais, snapshots históricos, outros documentos e publicação GitHub/Vercel.

## Diagnóstico da reunião

Três agentes analisaram frentes separadas: origem do modelo/snapshot, composição do PDF e paridade visual da Secretaria. A revisão conjunta confirmou duas causas independentes:

- o editor de Modelos de Documentos usava o cabeçalho institucional compartilhado e dados vivos da empresa principal, enquanto o PDF do Contrato desenhava um cabeçalho próprio reduzido a logo, nome e CNPJ;
- o workspace de Contratos tinha um hero, abas e uma grade genérica próprios, em vez dos três fluxos já consolidados pela Pasta de Identificação.

A modalidade e a revisão do modelo já eram selecionadas corretamente. A divergência visual nascia depois da seleção, porque o snapshot não carregava todos os dados necessários e o compositor oficial não reproduzia o cabeçalho do editor.

## Resultado documental

- Novas emissões congelam no snapshot nome fantasia, razão social, CNPJ, logo, endereço completo, telefone, e-mail, indicação de Matriz, marca-d'água e `presentationVersion=CONTRATO_A4_INSTITUCIONAL_V2`.
- O compositor V2 reutiliza `drawCanonicalInstitutionalHeader`, a mesma especificação institucional dos demais PDFs oficiais, e trata o campo `cabecalho` do modelo como seção documental separada, sem usá-lo para substituir o nome da instituição.
- Snapshots sem a versão V2 seguem pelo compositor legado. Assim, abrir ou baixar uma emissão anterior não recalcula sua aparência com os offsets e o cabeçalho novos.
- Versões ausentes/V1 são tratadas como LEGACY, V2 usa o compositor novo e qualquer versão futura desconhecida falha explicitamente, sem degradar silenciosamente para outro layout.
- Escala e rotação congeladas da marca-d'água chegam ao PDF, inclusive em imagens proporcionais a A4. O compositor LEGACY mantém a caixa `160 × 172 mm` e a rotação de `35°` usadas antes da V2.
- O histórico reconstrói o Contrato apenas de `templateSnapshot`, `contractSnapshot` e `renderedDocument`; payload parcial é bloqueado. Prévia, download e impressão reutilizam a mesma instância de Blob PDF.
- O Blob do histórico carrega a chave da emissão e cada carregamento recebe um token. Fechar ou trocar de documento invalida promessas anteriores, impedindo que o PDF de um aluno seja associado à emissão de outro.
- Texto, linhas, cabeçalho, cláusulas e rodapé permanecem vetoriais e selecionáveis; QR é um ativo raster pequeno e isolado.

## Resultado da interface

- O shell e as abas de Contratos seguem o padrão visual da Pasta de Identificação, sem hero paralelo ou card intermediário após a emissão.
- **Individual:** busca normalizada a partir de dois caracteres, cartão canônico do aluno, escolha de matrícula e ação central para abrir a prévia.
- **Em lote:** seleção de modalidade, turma ou todos, contagem exata dos elegíveis e bloqueio explícito acima do limite de 100 matrículas.
- **Personalizado:** busca, escolha de matrícula, adição sem duplicatas, lista removível e mensagem complementar opcional.
- Trocar modo, modalidade, turma ou termo remove seleções invisíveis. O sucesso abre diretamente a prévia canônica.
- CPF, RG, foto e matrícula agora fazem parte do payload autorizado do workspace, evitando cartões que afirmavam falsamente “Não informado”. Busca, abas e selects receberam rótulos e estado acessível.

## Banco e segurança

- A migration `20260809154809_freeze_contract_institutional_header_snapshot` foi aplicada pelo MCP Supabase no projeto `kfekgwyqozhicpfuunpo`.
- A migration `20260809155637_extend_contract_workspace_student_identity` foi aplicada pelo mesmo MCP e adicionou somente os dados necessários aos cartões, sem mudar a elegibilidade.
- O emissor continua revalidando polo, matrícula, turma, curso, modalidade, modelo ativo e aprovação jurídica; o frontend não decide elegibilidade nem paginação.
- As funções privadas permanecem sem execução para `public`/`anon`; os grants autorizados do workspace foram preservados.
- Nenhum snapshot histórico foi atualizado ou regravado pelas migrations.

## Validações

- `npx tsc --noEmit --pretty false`: aprovado.
- ESLint focado nos arquivos do lote: aprovado.
- `npm run test:contratos-aluno`: 34/34 aprovados.
- `npm run test:pdf-exports`: aprovado, sem rasterização direta de página A4.
- `npm run build`: aprovado.
- PDF V2 real: uma página A4, texto institucional e conteúdo extraíveis; `pdfimages -list` encontrou somente um QR RGB de 640×640, sem imagem de página inteira.
- Revisões finais independentes da interface, PDF e histórico: nenhum achado crítico, importante ou moderado remanescente.
- Logs Postgres posteriores à aplicação não mostraram falha de execução do fluxo do Contrato.

## Limite conhecido

Não havia navegador controlável exposto nesta sessão para executar o smoke autenticado e a matriz responsiva interativa. A interface foi verificada por revisão estrutural independente, TypeScript, ESLint, testes contratuais e build; o documento foi validado diretamente no Blob PDF real com Poppler.

Não houve commit, PR, Preview Vercel ou publicação de produção neste lote.
