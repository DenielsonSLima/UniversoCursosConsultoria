# Banese Student Payment

Edge Function de leitura para a tela de pagamento Banese do aluno.

## Contrato

- `POST` autenticado com `{ "action": "get", "receivableId": "<uuid>" }`.
- O JWT e validado no gateway da Edge Function e novamente com `auth.getUser`.
- Toda consulta usa o cliente autenticado, portanto respeita o RLS, e ainda
  exige que `cliente_id` seja o perfil de aluno correspondente ao e-mail do JWT.
- Ausencia e cobranca fora do escopo retornam o mesmo `404`.
- Nao faz chamada ao Banese nem tenta reconciliar o titulo durante a leitura.
- Nao devolve CPF completo, `cliente_id`, `matricula_id`, polo emissor,
  convenio, agencia, IDs do gateway, erros internos, payload bruto ou URLs
  persistidas.
- O agrupamento de carne usa um marcador HMAC opaco e nao autoritativo.
- Em homologacao, o DTO sempre remove Pix. Em producao, copia-e-cola e imagem
  somente sao devolvidos quando ambos passam por `internal/pix-validation.ts`.

## Implantacao

A funcao foi publicada com `verify_jwt = true`. A leitura continua sujeita ao
RLS do proprio aluno e nao dispara consulta sincrona ao banco.

## Melhoria futura

Defina, preferencialmente, `BANESE_STUDENT_GROUP_MARKER_SECRET` com pelo menos
16 caracteres. Enquanto ele nao existir, a funcao usa a chave `service_role`
somente como chave HMAC; ela nunca e usada como cliente de banco e nunca e
devolvida ao navegador.
