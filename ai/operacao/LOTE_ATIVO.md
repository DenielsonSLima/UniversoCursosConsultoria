# Lote ativo

Estado: `CONCLUIDO`

## Lote: 2026-08-28-banese-carne-desconto-t42

- Pedido: corrigir o carnê Banese da T42 para incluir a rematrícula e as 12 mensalidades com Pix, retirar da rematrícula o desconto que pertence somente às mensalidades, restaurar três títulos por A4 e tornar o resumo documental inequívoco.
- Registro: `ai/operacao/registros/alteracoes/2026-08-28-banese-carne-desconto-t42.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-28-banese-carne-desconto-t42.md`.
- Autorização: o usuário autorizou expressamente a correção financeira, a atualização de produção e o fechamento completo no GitHub; esta frente registra o estado já aplicado sem realizar nova publicação.
- Risco: crítico, por envolver termos financeiros, boleto/Pix oficial, PDF bancário, migrations e Edge Functions.

### Contratos preservados

1. O carnê usa somente títulos Banese válidos, pendentes e comprovados da mesma matrícula, pagador, polo, ambiente, emissor, convênio e agência; títulos incompletos, importados ou de outro gateway não entram no grupo.
2. A rematrícula permanece um lançamento próprio de R$ 100,00 e não recebe o desconto de pontualidade das 12 mensalidades de R$ 279,90.
3. O reparo financeiro reutiliza o título existente: valida o snapshot remoto, remove exclusivamente o desconto por `GET → PUT → GET` e persiste por RPC auditada, sem cancelar, reemitir ou repetir POST.
4. O Pix continua sendo exclusivamente o `QrCode` oficial do Banese, associado somente depois da validação completa da identidade bancária.
5. Os 312 títulos históricos de Radiologia permanecem legítimos, intactos e sem exigência retroativa de Pix.
6. Boleto e carnê continuam em compositores separados; o modelo fixo do carnê usa três títulos por A4, inclusive com Pix oficial.
7. O recibo lateral do carnê usa fundo branco para reduzir a cobertura de tinta, sem alterar bordas, textos ou demais áreas do documento.

### Resultado confirmado

- A matrícula T42 possui 13 títulos Banese documentáveis e 13 Pix oficiais: uma rematrícula de R$ 100,00 sem desconto e 12 mensalidades de R$ 279,90 com desconto de R$ 19,90.
- O carnê totaliza R$ 3.458,80 e exclui 12 registros incompletos que não satisfazem o contrato bancário/documental.
- O marcador one-off da rematrícula foi consumido e removido após a confirmação bancária; nenhuma duplicata ou novo POST foi criado.
- Radiologia permaneceu em 312/312 títulos, sem alteração, reenvio ou exigência de Pix.
- O grupo é apresentado como uma rematrícula e 12 mensalidades, 13 títulos, um arquivo de carnê e cinco páginas estimadas; os antigos rótulos internos de requisição foram removidos da interface.
- `payment-gateway-api` v25, `banese-reconciliation-worker` v66, `banese-carnet-document` v23 e `secretaria-banese-document-groups` v5 estão `ACTIVE`, com os contratos de JWT registrados no documento do lote.
- As cinco migrations `20260828143000` a `20260828143400` foram aplicadas e seus IDs remotos e hashes estão registrados no ledger imutável.
- A validação financeira original aprovou 112/112 testes. A regressão de paginação e os rótulos foram cobertos por mais 61/61 testes focados, TypeScript, ESLint, `deno check` e um PDF A4 real de cinco páginas.
- O smoke do documento confirmou a distribuição 3+3+3+3+1 e decodificou os 13 QRs rasterizados, cada um idêntico ao payload do respectivo título.
- A página renderizada confirmou o recibo lateral branco nos três títulos, preservando bordas, legibilidade e paginação.

### Fechamento

- A auditoria remota pós-DDL não encontrou aviso ou erro ligado ao hotfix; restaram apenas dois `INFO` esperados e documentados no registro.
- As Edge Functions documentais foram publicadas e relidas byte a byte. A publicação atômica do frontend e do registro no GitHub usa somente o manifesto explícito do registro.
