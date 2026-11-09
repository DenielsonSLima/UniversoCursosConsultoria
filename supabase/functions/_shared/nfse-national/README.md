# Provider nacional NFS-e — implementação local

Esta pasta contém builders DPS/eventos, assinatura XMLDSig offline e transporte HTTPS mTLS.
Não há Edge pública, certificado real, transmissão ou integração ativa com a fila.

- `dps.ts`: subconjunto doméstico do schema 1.01, com emitente prestador, tomador identificado,
  valores canônicos e revisão fiscal explícita. Competência, enquadramento e tributos não são
  inferidos de recebimentos. IBS/CBS, deduções, descontos, retenções federais e demais cenários
  não implementados exigem evolução do contrato; dados extras são rejeitados. CNPJ alfanumérico
  permanece explicitamente sem suporte neste subconjunto. Homologação inclui `finNFSe=0`
  para finalidade REGULAR, conforme seu XSD, sem inserir esse campo no leiaute de produção.
  ISSQN permite tributável, imunidade com tipo1–5 explicitamente confirmado e não incidência;
  imunidade/não incidência rejeitam retenção, alíquota e regime especial incompatíveis
  (E0580/E0602/E0172), e tpImunidade só é aceito para imunidade (E0592). Exportação permanece
  bloqueada. Curso não é classificado automaticamente como imune.
  Não há adapter que descarte campos de modelos/snapshots: chaves extras em qualquer objeto
  suportado são rejeitadas. Informações complementares, tributos federais ou grupos adicionais
  devem ser implementados antes do mapeamento; o caller não pode eliminá-los para passar no builder.
- `events.ts`: pedidos 101101 (cancelamento) e 101103 (solicitação de análise fiscal).
  Substituição é nova DPS com `subst`; 105102, 105104 e 105105 são eventos da autoridade,
  nunca pedidos fabricados pelo contribuinte. Solicitação aceita permanece aguardando análise.
- `cancellation-policy.ts`: capabilities por documento com autorização do emitente, consulta
  atual dos eventos e parâmetros municipais explícitos do mesmo ambiente/município. Ausência,
  dados vencidos ou divergentes bloqueiam a ação. A interface recebe o resultado canônico;
  nunca fornece esses fatos como autoridade fiscal.
- `signature.ts`: XMLDSig real com xml-crypto 6.4.0 e xmldom 0.8.15, dependências fixadas.
  Usa certificado folha, referência única, C14N da biblioteca e verificação com certificado
  confiável fornecido pelo backend. Perfil explícito SHA1 legado/SHA256 não constitui afirmação
  de aceitação vigente pela SEFIN. Testes usam somente certificado sintético efêmero.
- `mtls.ts`: cliente HTTPS com certificado/chave em memória, destinos oficiais fixos, TLS1.2+,
  sem redirects/retry e com prazo total e limite de resposta. Criar o adapter não faz rede;
  todo POST impõe o bloqueio de `live-contract.ts` antes de abrir conexão.
- `provider.ts`: exige validação XSD antes/depois de assinar. `assertNationalLiveContract`
  bloqueia transmissão com `CONTRACT_UNVERIFIED` enquanto faltarem evidências atuais de perfil
  criptográfico e JSON/compressão, e enquanto a divergência do XSD de produção não for resolvida.

## Fontes e integridade

Schemas de terceiros copiados sem alterações do [pacote oficial de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip).
SHA256 do ZIP consultado em 08/11/2026:
`e7935cbd9470527c6cc32984c1b2263e614183bf0139ce2733eaaed2de9a8072`.
Os XSDs oficiais são fonte de terceiros, preservada integralmente, e não obedecem ao teto
de 500 linhas para arquivos manuais. Não são schemas reconstruídos por inferência.

Homologação usa o [pacote próprio de 20/10/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip),
SHA256 `25fdcecc651a67a216496ab10d7566631e6ed10f721e37d62c7845dadb0ea267`.
Os XMLs DPS regular/substituição e pedidos 101101/101103, inclusive assinados, validam contra
esse pacote. O pacote de produção contém `TSSerieDPS` com pattern `^0{0,4}\d{1,5}$`;
o validador XML Schema xmllint rejeita a série numérica `1`, pois as âncoras são literais
nessa sintaxe. O teste preserva e comprova esse conflito; nenhum XSD foi corrigido localmente.

O [Anexo II 1.01/22-01-2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_ii-sefin_adn-pedregevt_evt-snnfse-v1-01-20260122.xlsx)
define PRE + chave50 + código6 (59 posições), assinatura obrigatória para 101101/101103,
motivos 1/2/9 e justificativa 15–255. O comentário isolado do XSD menciona nPedRegEvento,
mas seu pattern e a regra E1827 do anexo não incluem sequência no PRE.

Cancelamento direto depende da parametrização municipal: E0822 prazo, E0823 valor máximo,
E0824 tomador não identificado, E0827 tributos recolhidos e E0840 eventos incompatíveis.
Não existe prazo nacional fixo inferível desses documentos. O [Guia Web cap.5.3](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/guia-emissorpubliconacionalweb_snnfse-ern-v1-3.pdf)
prevê solicitação de análise quando as regras impedem o cancelamento direto; a nova intenção
deve ser confirmada e não enviada silenciosamente após rejeição.

O [manual API nacional](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf)
documenta POST /nfse, GET /dps/{id}, GET /nfse/{chave} e POST/GET /nfse/{chave}/eventos.
O manual integrado legado descreve RSA-SHA1, mas não prova aceitação atual. O manual NFS-e VIA
descreve SHA256 para outro produto e não foi usado como contrato do emissor nacional.
Swaggers oficiais não ficaram legíveis nesta investigação (web e requisição HTTPS pública
sem certificado retornaram 502, conexão encerrada ou 403); isso não prova falha do serviço.

## Validação local

`deno test --no-config --lock=deno.lock --frozen --allow-read --allow-write=/tmp --allow-run=openssl,xmllint provider.test.ts cancellation-policy.test.ts`
valida XMLs sintéticos contra os XSDs originais, assina/verifica criptograficamente e rejeita
alterações, assinatura com certificado divergente e tentativas de transmissão sem contrato.
O comando gera certificado de teste somente no diretório temporário e o remove ao terminar.
