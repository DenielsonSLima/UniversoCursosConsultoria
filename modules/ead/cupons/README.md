# Cupons EAD

O módulo conecta gestão na Secretaria e compra do aluno aos contratos RPC de cupons.
Gestão e compra compartilham os mesmos contratos, com autorização no servidor.

- `coupons-management.*`: tipos e serviço de cadastro, listagem, cursos e histórico.
- `coupons-student.*`: tipos, serviço e chaves de cotação e resgate.
- `hooks/`: consulta, resgate e invalidação por eventos do aluno/cupom.
- `coupons-environment.*`: destinos oficiais de produção/Preview ou ambiente local isolado.
- `coupons-availability.*` e `hooks/useEadCouponsAvailability`: disponibilidade canônica do backend.
- `coupons-access.*`: apresentação da gestão exige Secretaria e Financeiro.
- `../../gestor/secretaria/cupons-ead/`: página, componentes, formulários e hooks de gestão.
- `../../aluno/cursos/components/cupons/`: campo do cupom na confirmação da compra.

Valores e elegibilidade vêm do servidor. 100% confirma gratuidade sem recebível;
50% reserva uma utilização, cobra o principal com desconto e só libera com prova
financeira canônica. Respostas ambíguas retomam a reserva e request original.

As migrations de cupons permanecem versionadas em `supabase/migrations`. A instalação
começa desligada; uma migration de lançamento separada registra a ativação autorizada.
A compra com desconto exige ambiente bancário vigente, rota única EAD/BOLETO Banese e
credencial configurada. Pix é a apresentação do mesmo BolePix. A interface só oferece
cupons quando `ead_coupons_available()` confirma a disponibilidade para o perfil.
O fluxo sem cupom preserva o contrato anterior.

Em desenvolvimento, o módulo exige opt-in e Supabase/página loopback.
Para revisão segura, use a [prévia descartável](../../../scripts/ead-coupons-local/README.md).
Ela usa os componentes e SQL reais, identidades fictícias, pagamento simulado e
transporte local em memória. Não depende de credenciais ou Supabase remoto.

Para repetir os testes locais com as dependências já instaladas neste computador:

```sh
EAD_TEST_JSDOM_MODULE=/private/tmp/universo-qa-deps-20261115/node_modules/jsdom/lib/api.js \
PGLITE_MODULE_PATH=/private/tmp/universo-banking-pglite-20261115/node_modules/@electric-sql/pglite/dist/index.js \
npm run test:ead-coupons
```

A suíte testa serviços e formulários, SQL/RLS, idempotência, prova de pagamento,
reversão, expiração, recuperação e regressões do checkout. PGlite usa uma conexão:
as tentativas concorrentes são simuladas em fila; isso não comprova concorrência
multissessão em PostgreSQL/Supabase real nem o transporte WebSocket do Realtime.

Nova aplicação em curso com matrícula, cobrança ou tentativa histórica é recusada.
A reserva própria pendente pode ser retomada. Substituição de boleto existente
não faz parte desta etapa.
