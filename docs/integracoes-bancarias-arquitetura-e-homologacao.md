# Integrações bancárias: arquitetura, segurança e homologação

Atualizado na sessão de 21–22/07/2026. Este documento registra o contrato
operacional vigente no sistema. Não contém credenciais, tokens, certificados ou
dados bancários sigilosos.

## Decisão de escopo

Novas cobranças ficam limitadas a dois provedores:

| Meio | Provedor | Sandbox | Produção |
| --- | --- | --- | --- |
| Boleto | Banese | habilitado para homologação | bloqueado até aprovação formal |
| Pix | Banese | indisponível pelo próprio banco | bloqueado até liberação formal |
| Cartão | Mercado Pago | bloqueado até homologação completa | bloqueado |

Asaas e Banco Inter não aparecem como opção para novas cobranças e não possuem
rotas novas. Os registros e serviços estritamente necessários para consultar,
cancelar e auditar cobranças históricas foram preservados. A remoção física
desses dados quebraria rastreabilidade financeira e, por isso, não foi feita.

O código interno legado usa `banese_card` como identificador do provedor. Esse
nome técnico não representa cartão: Banese atende exclusivamente boleto e Pix
nesta integração. A restrição também é validada no banco de dados.

## Princípios obrigatórios

1. O curso/turma define preço, métodos aceitos, parcelamento e regras comerciais.
2. A matrícula registra a escolha do aluno e cria seu contrato financeiro.
3. Cada parcela preserva um snapshot de método, provedor, ambiente, valor,
   desconto, multa, juros, número da parcela e versão da regra.
4. O backend escolhe exatamente uma rota compatível com modalidade, método e
   ambiente; ausência ou ambiguidade falham de forma fechada.
5. O frontend coleta campos e exibe o resultado canônico. Não calcula juros,
   multa, desconto, tarifa ou valor líquido.
6. A emissão, consulta e baixa Banese usam a API como caminho principal.
7. CNAB240 é contingência operacional, usada somente quando a API estiver
   indisponível e depois da configuração/homologação do EDI7.
8. Pagamento só altera a situação acadêmica depois da confirmação financeira
   canônica. Redirecionamento de navegador nunca ativa matrícula.
9. Alterações financeiras preservam idempotência, auditoria, locks, TanStack
   Query/invalidations e atualização por Realtime.

## Fluxo Banese principal

O Banese retorna dados estruturados do boleto. Ele não retorna o PDF final. O
sistema usa esses dados para montar boleto e carnê em rotas privadas e
autenticadas, com os layouts locais submetidos ao banco:

- `banese homologacao/carne-banese-bruna-tecnico-enfermagem-6-parcelas-com-enderecos.pdf`;
- `banese homologacao/Modelo de Boleto (1) (2) (1).pdf`.

O fluxo principal é:

1. reservar a tentativa de emissão de forma idempotente;
2. chamar a API de cobrança no ambiente exato;
3. gravar nosso número, convênio, linha digitável, código de barras e termos;
4. gerar o documento local autenticado;
5. consultar periodicamente a API e processar confirmação de pagamento;
6. registrar data da última sincronização e erro mais recente;
7. executar os efeitos financeiros e acadêmicos de forma idempotente.

A tela **Financeiro > Resumo** mostra a última verificação de credencial Banese
e a atualização/erro mais recente persistido nos títulos. Isso não inventa um
status “online”: informa a evidência real disponível e orienta quando avaliar a
contingência CNAB.

## CNAB240 como contingência

A aba **Financeiro > Conciliação** separa:

- geração e download de remessa;
- upload, validação e prévia do retorno;
- aplicação confirmada do retorno;
- revalidação, retomada e retry controlado;
- consulta de títulos e transações conciliadas.

As rotinas de remessa e retorno estão modularizadas. O serviço monolítico de
retorno, antes com 1.635 linhas, virou um orquestrador de 24 linhas; o serviço de
remessa, antes com 666 linhas, virou um orquestrador de 10 linhas. Parsing,
validação, persistência, locks, leases, aplicação e respostas vivem em módulos
separados.

Bloqueios atuais e intencionais:

- o código EDI7 real ainda não está configurado;
- movimento CNAB `02/WRITE_OFF` não é considerado homologado;
- não é permitido inventar EDI7 nem assumir que arquivo aceito localmente foi
  homologado pelo banco;
- arquivos duplicados são identificados por fingerprint/idempotência;
- retorno ambíguo ou incompatível vai para revisão, nunca marca parcela paga.

## Baixa manual / dinheiro em mãos

A baixa presencial é uma operação backend auditada. O operador informa:

- principal;
- juros;
- multa;
- acréscimo;
- desconto;
- total recebido;
- forma, conta e data do recebimento.

Todos os valores são convertidos e comparados em centavos no backend:

```text
recebido = principal + juros + multa + acréscimo - desconto
```

Se a parcela possuir título remoto ativo, a ordem obrigatória é:

1. bloquear a tentativa concorrente e criar a auditoria idempotente;
2. consultar o título no provedor e conferir provedor, ambiente e identidade;
3. solicitar a baixa/cancelamento remoto;
4. consultar novamente e exigir a confirmação canônica de cancelamento;
5. somente então registrar a parcela local como paga e lançar o caixa.

Para Banese, um título pago não pode ser convertido em recebimento manual. A
baixa exige confirmação da situação cancelada (`5`). Falha, timeout, identidade
incompleta, título CNAB sem identidade API ou qualquer ambiguidade deixam a
operação em `REVIEW_REQUIRED`; a parcela não vira `PAGO`.

Cobranças históricas Asaas mantêm exclusivamente o encerramento seguro: consulta
do estado, cancelamento apenas quando pendente/vencida e confirmação posterior.
Uma cobrança ativa de cartão Mercado Pago também falha fechada enquanto não
existir um caminho oficial homologado para expirar/cancelar a tentativa.

## Ativação acadêmica por modalidade

| Modalidade | Depois do pagamento confirmado |
| --- | --- |
| EAD | matrícula pode ser ativada automaticamente |
| Curso livre | matrícula pode ser ativada automaticamente |
| Especialização | matrícula pode ser ativada automaticamente |
| Técnico | baixa financeira é registrada, mas a matrícula aguarda análise documental |
| Outros créditos | apenas o efeito financeiro aplicável; não inventa vínculo acadêmico |

A proteção documental do curso técnico foi preservada deliberadamente.

## Segurança e concorrência

- Tabelas de baixa manual usam RLS sem políticas de cliente e são acessadas pelo
  backend com `service_role`.
- Eventos de auditoria são imutáveis.
- Chave de idempotência e fingerprint impedem reaplicação com outro payload.
- Há tentativa ativa única por parcela, claim atômico e lease de dois minutos.
- Parcela, conta, liquidação e transação canônica são bloqueadas durante a
  finalização.
- Identidade remota, recebedor, ambiente, moeda e valor são validados antes da
  baixa.
- Segredos permanecem no backend/Vault e não entram em logs ou documentos.
- A aba Conciliação exige módulo Financeiro, permissão explícita da aba e escopo
  de polos compatível.

## Mercado Pago

Mercado Pago é o único provedor previsto para cartão, mas suas rotas permanecem
desabilitadas em sandbox e produção até concluir homologação segura de criação,
webhook, parcelamento, estorno/chargeback e recuperação de criação remota
ambígua. O sistema já preserva o número de parcelas e valida eventos de forma
idempotente; isso não é autorização para ativar a rota.

Referências oficiais:

- [SDK Node.js oficial](https://github.com/mercadopago/sdk-nodejs)
- [Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview)
- [Pagamento com cartões](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/cards)
- [Notificações de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications)

Não foi encontrado repositório público do Banese que possa ser tratado como
homologação bancária. Para Banese, os manuais locais fornecidos pelo banco e a
validação formal do próprio banco são as referências normativas.

## Estado verificado no ambiente remoto

Na conferência de 24/07/2026, após a correção baseada no `email.txt`:

- a integração canônica estava ativa no ambiente `sandbox`;
- somente a rota `EAD + BOLETO + Banese` estava habilitada;
- todas as demais rotas de boleto, Pix, produção e cartão estavam desabilitadas;
- o convênio sandbox estava fixado em `15528` e o de produção em `15261`;
- Pix/BolePix estava indisponível no sandbox e Mercado Pago continuava
  bloqueado para cobrança real;
- Asaas e Banco Inter não possuíam rotas de novas cobranças;
- a confirmação financeira usava a presença em `PagamentosEfetivados`,
  independentemente de `CodigoSituacaoBoleto = 3`;
- a migration canônica e as Edge Functions de configuração, checkout e
  conciliação estavam aplicadas/ativas.

## Critérios antes de produção

1. Receber a aprovação visual do boleto e do carnê enviados ao Banese.
2. Receber e configurar o EDI7 real; homologar remessa e retorno CNAB240.
3. Receber a liberação formal do Pix Banese em produção.
4. Concluir homologação do cartão Mercado Pago e do fluxo de cancelamento,
   estorno, chargeback e criação ambígua.
5. Executar casos descartáveis no sandbox, conciliá-los ponta a ponta e remover
   somente os dados de teste identificados.
6. Fazer ativação canário por método/modalidade, com monitoramento e rollback
   definido.
