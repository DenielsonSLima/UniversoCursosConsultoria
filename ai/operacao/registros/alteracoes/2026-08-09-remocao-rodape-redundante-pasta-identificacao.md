# Remoção do rodapé redundante da Pasta de Identificação

## Objetivo

Exibir a identidade institucional da Pasta apenas no cabeçalho canônico, removendo da faixa inferior o bloco legado que repetia nome, CNPJ, endereço, telefone e e-mail.

## Causa

O rodapé absoluto `pasta_rodape` fazia parte do modelo legado e foi preservado durante o reparo de geometria. Quando a emissão voltou a abrir, o teste real do usuário mostrou que o PDF já apresentava os mesmos dados no cabeçalho institucional compartilhado, tornando o bloco inferior redundante.

## Resultado

- O modelo padrão da Pasta passou para `v14` e não contém `pasta_rodape`.
- O modelo atual persistido foi atualizado somente depois de um preflight confirmar um único campo, geometria conhecida e os cinco tokens institucionais esperados.
- Snapshots históricos não foram regravados. Para Pasta `v<=13`, o frontend remove somente a assinatura redundante reconhecida da cópia usada na composição.
- Rodapé personalizado, campo duplicado ou geometria desconhecida não são removidos automaticamente.
- O cabeçalho institucional, os blocos do aluno, a marca-d'água, o QR e o código de validação permanecem inalterados.

## Validações

- `npm run test:contratos-aluno`: 44/44.
- Contratos focados do PDF, integração do modelo/histórico e migration: 20/20.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- PDF A4 renderizado com Poppler; extração mostra uma única ocorrência da identidade institucional, somente no cabeçalho.
- `pdfimages -list`: nenhum recurso A4 rasterizado.
- Supabase remoto: template atual `v14`, zero `pasta_rodape`; snapshot histórico mais recente preservado em `v10`, com o campo original em `y=1000`.

## Publicação

Migration aplicada por MCP Supabase como `20260809202910_remove_redundant_pasta_identificacao_footer`. Código, migration, testes e registros seguem em complemento atômico da PR draft #62, sem merge ou deploy do frontend em produção.
