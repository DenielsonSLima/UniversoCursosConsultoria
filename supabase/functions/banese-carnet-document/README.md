# Documento privado de carnê Banese

Edge Function autenticada que gera um único PDF com as parcelas Banese de uma
matrícula. O corpo aceita exclusivamente:

```json
{ "receivableId": "uuid-da-parcela" }
```

O cliente nunca informa a lista de parcelas, valores, dados bancários, pagador
ou beneficiário. O servidor deriva o grupo usando cliente, matrícula, polo,
ambiente, emissor, convênio e agência persistidos no título selecionado.

## Regras de segurança

- exige JWT e autoriza somente o cadastro único e ativo do aluno proprietário,
  ou gestor/financeiro com acesso ao polo;
- aceita somente lançamentos `PARCELA` do provedor `banese_card` e método
  `BOLETO`;
- remove títulos encerrados, inclusive pagos e cancelados, e exige no mínimo 3
  títulos pagáveis, registrados e únicos;
- exige em cada parcela o snapshot confirmado de desconto até o vencimento,
  valor líquido, multa e juros;
- não mistura Asaas, outro ambiente, emissor, convênio, agência ou matrícula;
- carrega logos somente por HTTPS/443, sem redirecionamento, a partir do Storage
  do projeto ou de `/logos/` em `universocc.com.br`;
- devolve `application/pdf` com `Cache-Control: private, no-store`.
- em produção, falha fechado se alguma parcela não tiver o BolePix oficial
  completo devolvido pelo Banese.

O PDF é montado por `buildBaneseCarnetPdf`; o endpoint não registra PII nem
identificadores de cobrança nos logs de erro.
