# Transporte privado de homologação NFS-e

O relay mantém autorização, Vault, revisão fiscal, assinatura e a concessão durável de envio no backend Supabase. Somente o transporte HTTPS para a SEFIN de homologação executa em Node. Não usa service role do Supabase, não persiste o A1 e não oferece uma operação fiscal ao navegador.

## Ambiente e limites

- `VERCEL_ENV` precisa ser exatamente `preview`; os demais ambientes retornam 403.
- `NFSE_HOMOLOGATION_RELAY_KEY` é exclusiva deste relay, somente no servidor: entre 32 e 64 bytes codificados em hexadecimal. Nunca usar prefixo `VITE_`.
- Rota HTTP privada: `POST /api/nfse-homologation-relay`. Requisições com `Origin` são rejeitadas, além da autenticação obrigatória.
- Corpo JSON UTF-8: até 2 MiB, sem compressão. Resposta da SEFIN: até 4 MiB; o envelope final codificado também precisa caber em 4 MiB.
- Prazo total da conexão externa: 25 segundos; execução da Function: 35 segundos.
- TLS 1.2, validação de CA/hostname ativa, sem redirecionamento, sem relaxar cifras ou segurança TLS. Credenciais permanecem somente na memória da requisição; o agente HTTPS é destruído ao final.

## Contrato assinado

Corpo aceita apenas:

```json
{
  "method": "GET",
  "path": "/swagger/docs/v1",
  "credential": {
    "certificatePem": "PEM do certificado",
    "chainPem": "PEM da cadeia ou string vazia",
    "privateKeyPem": "PEM da chave privada"
  }
}
```

Para `POST /nfse`, acrescentar apenas `fiscalBody`, uma string contendo o JSON fiscal já formado pelo backend. Para GET, `fiscalBody` não pode estar presente. O cliente não escolhe origem, headers externos ou ambiente.

Headers obrigatórios:

- `x-nfse-relay-timestamp`: segundos Unix em representação decimal.
- `x-nfse-relay-nonce`: UUID em minúsculas, novo a cada chamada HTTP.
- `x-nfse-relay-signature`: HMAC-SHA256 hexadecimal em minúsculas.

Formação da assinatura:

```text
bodyHash = SHA256(bytes UTF-8 exatos enviados).hexLower
signingText = timestamp + "\n" + nonce + "\n" + bodyHash
signature = HMAC_SHA256(bytes decodificados da chave hexadecimal, UTF8(signingText)).hexLower
```

Não reserializar o corpo depois de assinar. A assinatura cobre os bytes recebidos, não um objeto reconstruído. Janela temporal de 60 segundos em cada direção, reavaliada após a leitura do corpo. A comparação da assinatura usa `timingSafeEqual`.

O marcador de nonce é limitado à instância Node e não constitui trava durável entre instâncias. O backend Edge mantém a concessão de envio e a identidade DPS estável; uma resposta perdida conduz à consulta da mesma DPS. O relay não repete requests nem decide reenviar uma nota.

## Rotas externas permitidas

Base imutável: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`.

- GET `/swagger/docs/v1` e `/swagger/v1/swagger.json`.
- GET `/dps/DPS` seguido de exatamente 42 dígitos.
- GET `/nfse/` seguido de exatamente 50 dígitos.
- POST `/nfse`.

Eventos, cancelamentos, URLs absolutas, query strings e rotas de produção não são aceitos. A parametrização municipal em outra origem continua fora deste relay.

Sucesso HTTP do relay retorna `{status,bodyBase64}`; `status` pertence à resposta externa. Erros do relay retornam somente `{error:codigoEstático}`. Não há logs de certificado, chave, corpo fiscal ou resposta privada.

## Verificação

```sh
node --test internal/integracoes/nfse-relay/relay.test.mjs
node --test internal/integracoes/nfse-relay/renegotiation.test.mjs
```

O primeiro comando cobre assinatura, TTL, replay na instância, limites, projeção de erros, negação de browser/produção, origem e rotas fixas. O segundo gera certificados sintéticos temporários e prova o recebimento de certificado do cliente somente depois de um request HTTP e da renegociação TLS 1.2, com os dois lados autenticados.

O servidor sintético desabilita retomada da sessão inicialmente sem certificado durante a renegociação (`SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION`). Isso força o handshake completo; não reduz verificação TLS. O teste requer OpenSSL e permissão de escutar em loopback. Os arquivos temporários são removidos ao final.

Referências: [Node TLS](https://nodejs.org/api/tls.html#tlssocketrenegotiateoptions-callback), [Node em Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js). A prova local não substitui o teste com a SEFIN no deployment Preview autorizado.
