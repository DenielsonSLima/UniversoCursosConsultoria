# Retorno Banese — BolePix, webhook e conciliacao

Data registrada: 16/07/2026.

## Informacoes confirmadas pelo Banese

- O convenio de homologacao `15528` oferece somente linha digitavel e codigo de
  barras.
- Quando o servico for liberado em producao, o BolePix sera ativado em conjunto
  no mesmo titulo.
- Um novo boleto de producao retornara linha digitavel, codigo de barras e QR
  Code Pix pela propria API de boletos; nao e necessaria uma segunda emissao Pix
  pela Universo.
- A API de boletos possui webhook de pagamento.
- O Banese recomenda consultar a situacao do boleto pela API como mecanismo
  principal, por considerar essa opcao mais estavel que depender do webhook.

## Respostas ainda pendentes da equipe tecnica

- Prazo medio entre o pagamento e a atualizacao da liquidacao na API.
- Contrato tecnico do webhook: autenticacao/assinatura, payload, cadastro da
  URL, identificador idempotente, politica de repeticao e ambientes.
- Nomes e formatos exatos dos campos BolePix devolvidos na criacao do boleto,
  inclusive se o EMV copia-e-cola acompanha a imagem do QR Code.

## Regra temporaria adotada no sistema

O Manual Tecnico API Cobranca v1.6 define `CodigoSituacaoBoleto = 3` como
`Pago`. O endpoint `PagamentosEfetivados` fornece banco recebedor, data e valor;
o manual nao diz que sua presenca seja um segundo status formal.

A baixa automatica usa o codigo `3` como estado de pagamento e, por seguranca,
exige os detalhes efetivados com data e valor total compativeis antes de alterar
o financeiro local. Uma divergencia e mantida para nova tentativa/revisao, sem
marcar a cobranca como paga. O webhook Banese permanece fechado ate ser
possivel autenticar cada evento oficialmente.

O polling principal esta agendado a cada cinco minutos por um worker isolado,
autenticado por segredo interno no Vault. Os recebiveis sao reservados em lotes
pequenos com `SKIP LOCKED`, evitando concorrencia e POST bancario: o worker faz
somente consultas de situacao e pagamentos efetivados.

Este arquivo nao contem credenciais, documentos pessoais nem payloads
bancarios.
