# Lote ativo

Estado: `BACKEND PRODUTIVO CONCLUÍDO — PR FINAL EM VALIDAÇÃO`

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

### Evidência de produção

- As seis imagens mostram proteção contra duplicidade no título EAD antigo e
  uma emissão EAD nova concluída com Pix na tela e no PDF do mesmo título.
- `000097299` recebeu confirmação bancária de pagamento integral via API antes
  da substituição; por contrato, permaneceu pago e não foi cancelado/reemitido.
  A projeção EAD deixou de regravar recebíveis já pagos; após duas retentativas
  transacionais sem alteração financeira, o pós-baixa concluiu e a fila ficou
  `DONE`, sem marcador pendente.
- `000097302` continuou pendente e sem Pix, passou no dry-run com `ROLLBACK` e
  foi substituído uma única vez pelo Nosso Número `000097329`.
- O novo título possui linha/código 047 coerentes, Pix EMV/CRC válido, imagem
  PNG gerada do `QrCode` oficial e uma única transação/inscrição canônicas.
- Dez migrations e oito Edge Functions foram publicadas. A auditoria de
  segurança permaneceu no baseline e a migration final não criou alerta novo.
- Validação local: 8 `deno check`, 152 testes integrados, TypeScript global,
  build de produção, controle de versão 4.8.20 e teto de 500 linhas aprovados.
- Técnico preservado: 691 recebíveis e 325 transações; nenhuma linha Técnica
  foi atualizada durante o rollout.

### Aceite para encerramento

- Título pago não é substituído. Título elegível recebe identidade bancária e
  Pix próprios; o título antigo fica baixado no Banese e arquivado localmente.
- O PDF autenticado abre e o QR é visualmente legível para cada retorno Pix.
- Cobranças e transações Técnicas permanecem sem alteração no rollout.
- PR final contém somente o manifesto e recebe CI/Preview aprovados antes do
  merge em `main`.
