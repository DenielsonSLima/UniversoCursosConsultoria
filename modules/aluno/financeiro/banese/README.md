# Pagamento Banese no portal do aluno

Este modulo apresenta cobrancas Banese sem compartilhar componentes ou regras
de interface com Asaas e Mercado Pago. A entrada autenticada e:

`/aluno?module=financeiro&banesePayment=<receivableId>`

O parametro legado `baneseBoleto` continua aceito e e normalizado para
`banesePayment`.

## Regras de apresentacao

- `MATRICULA` e `REMATRICULA`: cobranca individual.
- Uma ou duas parcelas: cada titulo e aberto individualmente.
- Tres ou mais parcelas `PARCELA`, registradas no Banese e vinculadas a mesma
  `matricula_id`: navegador de carne.
- Cada parcela precisa ter Nosso Numero, linha digitavel e codigo de barras
  exclusivos.
- BolePix continua com `gateway_payment_method = BOLETO`; o Pix e uma forma
  alternativa do mesmo recebivel, nunca uma segunda conta a receber.
- A listagem financeira nao carrega imagens Pix. O detalhe protegido e buscado
  somente quando o aluno abre um titulo; para carne, limita-se a mesma matricula,
  ambiente, convenio, agencia e emissor.
- Desconto ate o vencimento, valor final, multa e juros aparecem no detalhe e
  no documento apenas quando o Banese confirmou o snapshot do titulo. O carne
  completo exige os quatro dados em todas as parcelas e nunca inclui titulo
  pago, cancelado ou indisponivel.

## Pix

O sandbox sempre oculta payload e imagem, ainda que algum valor seja persistido
por engano. Em producao, o painel e os PDFs exigem o payload oficial e imagem QR
PNG/JPEG retornados pelo banco. Nao existe geracao a partir de chave estatica.

O Banese confirmou em 16/07/2026 que o convenio de homologacao `15528` devolve
somente linha digitavel e codigo de barras. Quando o servico for liberado em
producao, o BolePix sera ativado no mesmo titulo e a API de boletos passara a
devolver tambem o QR Code. A interface reserva esse espaco agora, mas nunca
simula um QR na homologacao.

## Confirmacao do pagamento

O Banese confirmou que existe webhook, mas recomendou a consulta da situacao do
boleto na API como mecanismo principal por ser mais estavel. Assim, o desenho e:

1. consulta ativa da API como fonte principal;
2. webhook apenas para antecipar uma nova consulta;
3. baixa local somente depois de validar o detalhe, a data e o valor pago.

Enquanto a equipe tecnica do banco nao confirmar o criterio definitivo, o
sistema exige de forma conservadora `CodigoSituacaoBoleto = 3` e pelo menos um
item consistente em `PagamentosEfetivados`. O webhook Banese permanece
desabilitado ate serem recebidos o contrato do payload e o metodo oficial de
autenticacao.

## Etapas da integracao

1. Pagina co-branded, responsiva, com boleto, area Pix e navegador de carne.
2. Endpoint estudantil com DTO minimo e sanitizado: concluido em
   `banese-student-payment`.
3. PDF A4 proprio e privado: concluido em `banese-boleto-document`. O Banese
   devolve os dados do titulo; o servidor carrega beneficiario e pagador,
   valida linha, barras, vencimento e chave ASBACE e monta o PDF da Universo com
   `Cache-Control: private, no-store` para exibicao e download na mesma tela.
4. PDF completo do carne: concluido em `banese-carnet-document`. O aluno envia
   somente a parcela selecionada; o servidor deriva e valida todas as parcelas
   do mesmo grupo antes de gerar o arquivo, sem misturar Asaas ou outro emissor.
5. Conciliacao automatica de boletos em worker agendado, usando a consulta da
   API recomendada pelo Banese.
6. Webhook como acelerador depois do contrato tecnico de autenticacao e payload.

O Banese nao fornece PDF ou URL de documento. A tela incorpora exclusivamente o
Blob PDF montado pelo endpoint privado `banese-boleto-document`; campos URL do
gateway nunca sao usados como documento Banese.
