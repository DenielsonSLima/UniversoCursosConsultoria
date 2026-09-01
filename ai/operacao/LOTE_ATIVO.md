# Lote ativo

Estado: `PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA — VALIDAÇÃO FINAL`

## Lote: 2026-09-01-reemissao-bolepix-ead-banese

- Pedido: padronizar a captura do BolePix Banese, recuperar os títulos EAD já
  emitidos sem Pix e, somente quando o GET oficial continuar sem `QrCode`,
  cancelar e substituir `000097299` e `000097302` um por vez.
- Autorização: GitHub, Produção, baixa dos dois títulos antigos e reemissão
  explícitas pelo usuário em 01/09/2026.
- Risco: crítico — financeiro, Supabase, Edge Functions, PDF e publicação.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-09-01-reemissao-bolepix-ead-banese.md`.

### Contrato do lote

1. O retorno original do POST é preservado atomicamente; `QrCode` oficial é
   validado como EMV/CRC e convertido em imagem sem fabricar conteúdo.
2. Boleto existente usa GET no próprio convênio/Nosso Número e consulta de
   pagamentos; identidade divergente, situação terminal ou pagamento bloqueiam
   qualquer recuperação e qualquer baixa.
3. A substituição excepcional é restrita a EAD, usa lease/CAS, registra a
   intenção antes do PUT, confirma situação 5 e usa um novo Nosso Número.
4. POST ambíguo nunca é repetido; a retomada usa somente GET.
5. Técnico, CNAB, históricos e PDFs compartilhados ficam fora da mutação.

### Evidência antes da publicação

- As seis imagens mostram proteção contra duplicidade no título EAD antigo e
  uma emissão EAD nova concluída com Pix na tela e no PDF do mesmo título.
- Produção mantém os dois alvos pendentes, sem Pix local, sem pagamento e com
  uma transação canônica cada; nenhuma mutação remota foi feita na preparação.
- Validação local: 8 `deno check`, 152 testes integrados, TypeScript global,
  build de produção, controle de versão 4.8.20 e teto de 500 linhas aprovados.
- Processamento obrigatório: concluir e validar o primeiro título antes de
  enfileirar o segundo.

### Aceite para encerramento

- Cada título novo, quando necessário, possui identidade bancária e Pix
  próprios; o título antigo fica baixado no Banese e arquivado localmente.
- O PDF autenticado abre e o QR é visualmente legível para cada retorno Pix.
- Checksums das cobranças e transações Técnicas permanecem idênticos.
- PR final contém somente o manifesto e recebe CI/Preview aprovados antes do
  merge em `main`.
