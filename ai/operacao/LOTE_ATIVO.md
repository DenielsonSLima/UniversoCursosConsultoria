# Lote ativo

Estado: `BACKEND PUBLICADO — GITHUB E FRONTEND EM PROMOÇÃO`

## Lote: 2026-09-01-hotfix-emissao-integrada-ciclo-t42

- Pedido: corrigir a multa de atraso da Turma 42 para 2% e transformar a
  confirmação do ciclo manual em uma operação única que cria os 13 recebíveis,
  emite os 13 BolePix Banese e os deixa disponíveis no Financeiro.
- Autorização: publicação em GitHub e produção autorizada explicitamente
  em 01/09/2026, condicionada à reunião técnica e ao rollout backend-first.
- Risco: crítico, domínio financeiro/Banese/Supabase e emissão de títulos em
  produção.
- Registro:
  `ai/operacao/registros/alteracoes/2026-09-01-hotfix-emissao-integrada-ciclo-t42.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-01-hotfix-emissao-integrada-ciclo-t42.md`.

### Contrato do lote

1. Uma confirmação humana cria/reutiliza o ciclo e emite todos os seus títulos
   Banese, sem segunda ação em Contas a Receber.
2. A operação é idempotente e retomável; resposta ambígua jamais dispara novo
   POST antes de consulta/reconciliação canônica.
3. A Turma 42 usa multa única de 2% e juros de 2% ao mês.
4. Rematrícula de R$ 100,00 não recebe desconto; multa vale R$ 2,00.
5. Mensalidade de R$ 279,90 recebe desconto de R$ 19,90; multa vale R$ 5,60.
6. O BolePix usa exclusivamente o snapshot financeiro congelado no recebível.
7. Sucesso exige, por título, termos confirmados, Nosso Número, linha
   digitável, código de barras, par Pix oficial e exatamente uma transação.
8. Nenhum título já emitido é recalculado, regravado ou reemitido.

### Aceite para encerramento

- Prévia da Adryelle: 13 itens, total nominal de R$ 3.458,80 e encargos 2%/2%.
- Persistência: snapshot v2, contexto do ciclo preservado e BOLETO congelado.
- Emissão: 13/13 completos no retorno simulado, replay sem POST duplicado e
  falha ambígua somente por GET/reconciliação.
- PDF/BolePix: identidade bancária e QR distintos e oficiais por título.
- Smoke autenticado sem emissão real e publicação backend-first: autorizados,
  condicionados aos gates finais deste lote.

### Evidência local consolidada

- 225/225 testes Banese/backend e 37/37 testes finais de fence/estado.
- 35/35 testes da apresentação boleto/Pix e 21/21 do fluxo visual do ciclo.
- `deno check`, TypeScript, ESLint focado e build de produção aprovados.
- Auditoria Supabase somente leitura: zero Banese `CREATING` e zero status
  bancário isolado sem identidade/transação.
- As oito migrations e a Edge v1 com JWT foram publicadas via MCP após os
  gates; nenhum POST Banese, recebível ou transação da matrícula-alvo foi
  criado no rollout.

### Ordem obrigatória de publicação

1. Migrations `120600` a `120715`: concluídas na ordem cronológica.
2. Edge `technical-manual-cycle-issuance`: ativa na versão 1 com JWT.
3. Publicar o frontend via PR auditado e promoção Vercel.
4. Só então executar smoke autenticado sem emitir cobranças para a Adryelle.
