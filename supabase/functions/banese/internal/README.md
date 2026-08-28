# Documentos internos Banese

Esta pasta monta documentos bancarios a partir de titulos que ja foram
registrados no Banese. Ela nao cria cobrancas e nao recalcula a linha digitavel
ou o codigo de barras: os valores de 47 e 44 digitos retornados pelo banco sao a
fonte de verdade.

## Estrutura

- `pdf/`: primitivas fisicas, logos, cabecalhos e painel Pix compartilhados.
- `boletos/boleto-layout.ts`: recibo e ficha de compensacao.
- `boletos/boleto-pdf.ts`: facade que monta a pagina A4.
- `carne/carne-layout.ts`: canhoto lateral e ficha compacta por parcela.
- `carne/carne-pdf.ts`: validacao, ordenacao e paginacao do carne.
- `types.ts`: contrato imutavel e validacoes de integridade do documento.
- `financial-terms.ts`: validacao, payload bancario e calculo seguro de
  desconto, multa e juros.
- `financial-terms-response.ts`: leitura estrita e comparacao do retorno
  bancario; formatos incoerentes falham fechados.
- `bank-fields.ts`: validacao de 44/47 digitos, fator de vencimento e Chave
  ASBACE.
- `barcode.ts`: codigo vetorial Interleaved 2 of 5 com modulo estreito de 0,3
  mm.

Os renderizadores aceitam as logos Banese e Universo como PNG/JPEG em base64.
Nenhum arquivo TypeScript desta pasta deve ultrapassar 500 linhas; layouts,
primitivas e builders precisam permanecer separados.

## Pix

O renderer aceita QR Pix somente em `production`, quando `pix.copyAndPaste` e
`pix.qrCodeBase64` vierem da API oficial do Banese. Nunca gere QR a partir de
uma chave estatica. O banco informou que o ambiente Pix de homologacao nao esta
em funcionamento. Qualquer payload Pix recebido no sandbox e descartado e o
documento exibe somente uma area reservada nao escaneavel.

Antes de renderizar em producao, o contrato valida a estrutura TLV/EMV, CRC16,
GUI `BR.GOV.BCB.PIX`, moeda, pais, valor quando presente, TXID quando informado
e assinatura PNG/JPEG da imagem. A comprovacao de que a imagem decodifica para o
mesmo payload ainda deve ser feita no endpoint oficial com um decoder de QR
antes da liberacao em producao.

`beneficiary.beneficiaryCode` e obrigatorio e deve ser confirmado pelo Banese. O
gerador nao presume silenciosamente que esse codigo seja igual a conta.

Quando o Pix for liberado em producao, cada titulo do carne deve receber seu
proprio payload EMV/QR associado ao mesmo titulo. Nao use um unico QR para o
valor total do carne. O modelo fixo do carne usa tres titulos por pagina A4,
com ou sem Pix oficial.

## Condicoes financeiras

O boleto e cada parcela do carne exibem somente desconto, multa e juros
confirmados pela leitura do titulo no Banese. O desconto informa a data limite
e o valor final ate o vencimento; multa e juros informam valor/taxa e data de
inicio. Marcadores vazios devolvidos pela API (`tipo 0`, valor zero e data
vazia) significam ausencia da condicao, mas qualquer combinacao incoerente e
rejeitada. O PDF nunca inventa ou recalcula uma regra ausente do snapshot.

## Integridade bancaria

O fator de vencimento e conferido contra `dueDate`: o ciclo legado usa a base
07/10/1997 ate o fator 9999 em 21/02/2025; o ciclo atual reinicia em 1000 em
22/02/2025. Datas posteriores a 13/10/2049 sao rejeitadas ate que a FEBRABAN
publique formalmente o ciclo seguinte.

O campo livre segue exclusivamente a composicao da Chave ASBACE descrita no
manual Banese recebido, de 2017: dois ultimos digitos da agencia, conta com 9
digitos, Nosso Numero com 9 digitos incluindo DV, banco 047 e duplo digito
ASBACE. O renderer valida esses campos e seus digitos, mas nao cria nem corrige
um codigo bancario retornado. Se o Banese adotar outro layout de campo livre, o
manual/versionamento correspondente precisa ser incorporado antes de aceitar o
novo retorno.

## Limites de seguranca

- O endpoint `banese-boleto-document` recebe somente `receivableId`.
- Dados pessoais, valor, linha e barras devem ser carregados no servidor.
- Exigir JWT, propriedade do aluno ou perfil financeiro com escopo de polo.
- Responder com `Cache-Control: private, no-store`.
- Nao armazenar PDFs em bucket publico nem registrar CPF/linha nos logs.
- Dados bancarios informados: agencia `033`, conta `03/100649-0` e convenio
  `15528`. O codigo do banco no cabecalho permanece `047-7`.
- A carteira e a ativacao do Pix ainda precisam de confirmacao formal do Banese
  antes de producao.

O PDF `Modelo de Boleto` recebido e apenas referencia visual do manual. Ele nao
e usado como fundo preenchivel.
