# Integração bancária Banese — boleto e Pix

Esta nota resume os manuais locais fornecidos pelo Banese e as regras já
incorporadas ao sistema. Banese não é usado para cartão. O identificador interno
legado `banese_card` é apenas um código técnico do provedor e não altera essa
restrição.

## API de cobrança / boleto

Autenticação OAuth 2 `client_credentials`, com segredo mantido no backend/Vault.

Ambientes documentados:

- sandbox: `https://sandbox.banese.b.br/cobranca/v1`;
- produção: `https://webapi.banese.b.br/cobranca/v1`;
- token sandbox: `https://sandbox.banese.b.br/autenticacao/oauth/v1/token`;
- token produção: `https://webapi.banese.b.br/autenticacao/oauth/v1/token`.

Escopo do token: `boletos`.

Operações principais:

- `POST /convenios/{id_convenio}/boletos` — emitir;
- `PUT /convenios/{id_convenio}/boletos/{nosso_numero}` — alterar;
- `PUT /convenios/{id_convenio}/boletos/{nosso_numero}/baixa` — baixar;
- `GET /convenios/{id_convenio}/boletos/{nosso_numero}` — consultar;
- `GET /convenios/{id_convenio}/boletos/{nosso_numero}/pagamentos/efetivados`
  — consultar pagamentos.

A API retorna os dados do título, não um PDF final. O sistema monta boleto e
carnê por rotas privadas/autenticadas usando os dados confirmados pelo banco.
Os modelos submetidos à validação estão em `banese homologacao/`.

## Pix / SAB Guias

Ambientes documentados:

- sandbox: `https://apipix-h.banese.b.br/guias/v1`;
- produção: `https://apipix.banese.b.br/guias/v1`;
- token sandbox: `https://apipix-h.banese.b.br/security/v3/oauth/token`;
- token produção: `https://apipix.banese.b.br/security/v3/oauth/token`.

Operações descritas no manual:

- `POST /manutencao/guiaVencimentoFuturo`;
- `POST /manutencao/guiaImediata`;
- `GET /manutencao/guias/{CodigoDeBarra}`;
- `PUT /manutencao/webhook/{chave}`.

O Pix está bloqueado no ambiente de homologação por decisão do banco. Nenhuma
rota Pix está ativa. A produção só pode ser habilitada depois da liberação
formal e da validação de credenciais, CRT/certificado, chave Pix, convênio,
terminal e webhook.

## API principal e CNAB240 de contingência

A API é sempre o caminho principal para emissão, consulta e retorno. CNAB240 é
uma segunda opção operacional para indisponibilidade da API. A contingência não
pode operar até que o Banese forneça/confirme o EDI7 e homologue os movimentos
necessários, incluindo baixa quando aplicável.

Na aba **Financeiro > Conciliação**, remessa e retorno são fluxos separados,
com prévia antes da aplicação, idempotência por arquivo e revisão obrigatória
para qualquer divergência.

## Dados ainda necessários do banco

- aprovação formal do layout de boleto e carnê;
- credenciais e convênio de produção da API de cobrança;
- liberação e dados completos do Pix em produção;
- EDI7 real e homologação de remessa/retorno CNAB240;
- confirmação das regras de nosso número, carteira, espécie, baixa/devolução,
  multa, juros e desconto;
- confirmação do header `Terminal` (`99000090054` em homologação e
  `99000090049` em produção, conforme manual);
- confirmação do endpoint de certificado grafado no manual como
  `/manutencao/cerificado`, inclusive se a ausência de `t` é intencional.

Nenhum desses valores deve ser inventado ou armazenado em frontend, log ou
documentação pública.

