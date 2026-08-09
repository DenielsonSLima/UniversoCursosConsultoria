# Alteração — formatação semântica da minuta no Contrato de Aluno

- Lote: `2026-08-09-formatacao-semantica-minuta-contrato`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: análise da minuta PDF, editor do modelo, prévia estrutural, renderer React, compositor PDF vetorial V2 e testes.
- Não alterado: conteúdo jurídico aprovado, status/revisão do modelo no banco, compositor LEGACY, snapshots históricos, identidade institucional e publicação GitHub/Vercel.

## Diagnóstico

A minuta de sete páginas usa uma hierarquia editorial que não existia no contrato emitido pelo sistema: rótulos jurídicos em negrito e dados/condições críticas em vermelho. O corpo canônico chegava ao frontend como uma única string e era desenhado em fonte normal; por isso qualquer ênfase se perdia. As áreas amarelas vistas nas capturas são marcações de revisão do Word, não parte do documento final.

O título `— continuação` e o traço vermelho também eram desenhados em todas as folhas pelo compositor V2, embora a prévia estrutural do modelo já reservasse esses elementos à primeira página.

## Resultado

- Foi criada uma camada semântica pura, sem HTML, que conserva o texto caractere por caractere e devolve trechos com os atributos `bold` e `accent`.
- `ALUNO`, `CONTRATANTE`, `CONTRATADA`, `OBJETO DO PRESENTE INSTRUMENTO`, `CLÁUSULA` e `PARÁGRAFO` recebem negrito automaticamente.
- Curso, modalidade, carga horária, datas e valores/condições financeiras presentes no snapshot congelado recebem vermelho automaticamente.
- O modelo passou a expor `destaquesCriticos`, uma lista editável de expressões exatas que devem ficar vermelhas. A lista inicial deriva das condições destacadas na minuta e não altera o texto jurídico.
- Editor, canvas estrutural, renderer React e compositor PDF usam a mesma função semântica.
- O PDF usa Times normal/bold e cor vetorial; não há captura de DOM nem imagem A4.
- No V2, o traço e o título do documento aparecem apenas na primeira folha. As folhas seguintes mantêm cabeçalho institucional, marca-d'água e conteúdo, sem repetir `continuação`.
- O layout LEGACY permanece intacto para reemissões históricas.

## Banco e segurança

Nenhuma migration foi necessária. A apresentação é derivada apenas do modelo e do snapshot que já foram preparados e congelados pelo backend; elegibilidade, conteúdo, paginação, aprovação, QR e validade continuam sob autoridade das RPCs existentes. Nenhum modelo ativo ou histórico foi regravado.

O único MCP Supabase exposto nesta sessão apontava para outro projeto (`hlmhlltmgwxlibklyrzc`), diferente do projeto Universo (`kfekgwyqozhicpfuunpo`); depois da verificação de identidade, nenhuma consulta mutável ou migration foi executada nele.

## Validações

- `npm run test:contratos-aluno`: 39/39 aprovados.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- `npm run test:pdf-exports`: aprovado.
- `npm run build`: aprovado.
- PDF sintético real: sete páginas A4, título extraído uma única vez e nenhuma ocorrência de `continuação`.
- `pdftotext`: conteúdo completo e selecionável.
- `pdffonts`: Times-Roman e Times-Bold presentes, além das fontes do cabeçalho.
- `pdfimages -list`: somente um QR RGB 640×640 na última página; nenhuma folha rasterizada.
- PNGs das páginas 1, 2 e 7 inspecionados: primeira página com traço/título; continuações sem ambos; negrito e vermelho preservados; encerramento apenas na última folha.

O navegador integrado não tinha instância conectada nesta sessão. Não houve commit, PR, Preview Vercel ou publicação de produção.
