# Correção do Boletim Escolar vetorial

## Objetivo

Eliminar a sobreposição entre o conteúdo acadêmico e o campo `Emitido em`, restaurar o cabeçalho institucional padrão do editor e impedir a criação futura de cabeçalhos privados em exportadores oficiais.

## Resultado

- O boletim passou a compor tabela, resumo e rodapé em faixas vetoriais separadas, com bloqueio explícito de overflow.
- O cabeçalho privado do exportador foi removido. Boletim, Pasta e Ficha usam `canonical-institutional-header-pdf.ts`, com cartão do logo, selo Matriz, CNPJ, contato, endereço, e-mail, divisor e variantes retrato/paisagem.
- O título e o início do corpo foram alinhados à geometria A4 do editor; negritos parciais do conteúdo ativo foram preservados.
- A migração versionada `v3` corrige somente a largura exata do campo legado padrão `boletim_data`, sem reescrever coordenadas personalizadas no compositor.
- Prévia, download e impressão imediatos usam o mesmo Blob; a segunda via no histórico também reutiliza o Blob vetorial já aberto.
- A regra foi adicionada ao `AGENTS.md`, à memória canônica/RAG e à skill `universo-batch-operations`, com teste de contrato contra cabeçalho privado.

## Validações

- Deno do compositor do boletim: 12/12.
- Visualizador, Blob, reemissão e validação documental: 23/23.
- `npm run test:pdf-exports`: aprovado.
- TypeScript, ESLint focado e build Vite: aprovados.
- PDF A4 renderizado com Poppler e inspecionado visualmente.
- `pdftotext -layout`: cabeçalho, tabela, resumo, data e assinatura extraíveis.
- `pdfimages -list`: somente QR Code isolado; nenhuma imagem de página inteira.
- Navegador controlável indisponível; nenhuma operação remota, publicação ou alteração Supabase foi realizada.

## Riscos conhecidos

- Emissões acadêmicas históricas legadas ainda dependem da política de snapshot já existente no backend; este lote não alterou notas, frequência, situação ou regras acadêmicas.
- A validação oficial da skill por `quick_validate.py` não executou porque o ambiente não possui PyYAML; o frontmatter e os campos obrigatórios foram conferidos com o parser YAML do sistema.

## Publicação

Não solicitada. Alteração local pronta para validação visual do usuário.
