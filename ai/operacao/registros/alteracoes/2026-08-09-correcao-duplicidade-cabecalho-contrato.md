# Alteração — duplicidade do cabeçalho no Contrato de Aluno

- Lote: `2026-08-09-correcao-duplicidade-cabecalho-contrato`
- Estado no fechamento local: `PRONTO_PARA_VALIDACAO`
- Escopo: editor do modelo de Contrato, cabeçalho institucional compartilhado, renderer canônico do banco, compositor PDF V2, renderer React e testes.
- Não alterado: texto jurídico, aprovação do modelo, dados cadastrais da instituição, compositor LEGACY, snapshots históricos, outros documentos e publicação GitHub/Vercel.

## Diagnóstico

As capturas mostravam três nomes antes do conteúdo: nome fantasia, razão social e novamente o nome fantasia como subtítulo. A causa era composta:

- o canvas do editor usava o fallback literal `UNIVERSO CURSOS E CONSULTORIA` quando `cabecalho` estava vazio;
- a revisão técnica ativa ainda contém esse mesmo nome no campo `cabecalho`, como dado legado;
- o cabeçalho V2 do PDF exibia também a razão social, embora o cabeçalho do editor do Contrato não a exibisse.

O modelo correto já era selecionado. A divergência ocorria na interpretação e na composição do campo depois da seleção.

## Resultado

- `cabecalho` passou a ser tratado como subtítulo documental opcional, e não como uma segunda identidade institucional.
- Valor vazio permanece vazio em novos modelos e na prévia do editor; não existe mais fallback institucional.
- Valores iguais ao nome fantasia, nome institucional ou razão social são normalizados para vazio no editor, no RPC e no PDF V2.
- Um subtítulo realmente diferente, como `DOCUMENTO ACADÊMICO OFICIAL`, continua preservado e exibido.
- O Contrato V2 oculta a razão social no cabeçalho, mas o comportamento padrão dos outros documentos que usam `DocumentHeader` e `drawCanonicalInstitutionalHeader` permanece inalterado.
- O compositor LEGACY não foi modificado, preservando o visual de contratos históricos.

## Banco e segurança

- A migration `20260809163000_suppress_redundant_contract_header.sql` foi aplicada pelo MCP Supabase como `suppress_redundant_contract_header`.
- Smoke remoto confirmou `UNIVERSO CURSOS E CONSULTORIA` renderizado como subtítulo vazio e `DOCUMENTO ACADÊMICO OFICIAL` preservado.
- `renderizar_contrato_aluno_documento` permanece sem permissão de execução para `anon`, `authenticated` e `service_role`; é consumido internamente pelo emissor `SECURITY DEFINER`.
- A revisão técnica aprovada e os documentos históricos não foram atualizados ou regravados.

## Validações

- `npm run test:contratos-aluno`: 37/37 aprovados.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- `npm run test:pdf-exports`: aprovado.
- `npm run build`: aprovado.
- PDF V2 real: uma página A4, texto selecionável e uma única ocorrência extraível de `UNIVERSO CURSOS E CONSULTORIA` no cabeçalho.
- `pdfimages -list`: apenas um QR RGB 640×640; nenhuma imagem de página inteira.
- Renderização PNG inspecionada: nome institucional único, sem linha de razão social e título posicionado logo após o divisor/acento.
- Caso personalizado inspecionado por `pdftotext`: subtítulo próprio preservado antes do título.

Não houve commit, PR, Preview Vercel ou publicação de produção neste lote.
