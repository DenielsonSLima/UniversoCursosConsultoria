# Cadastro A1 da NFS-e

Backend aplicado e Edge v1 publicada com JWT obrigatório em 08/11/2026.
Interface liberada no candidato 4.8.273. Sem certificado real ou transmissão fiscal.
O upload recebe PFX/P12 de até 128 KiB e senha exclusivamente na Edge autenticada.
O corpo é limitado por leitura de stream mesmo sem Content-Length; a autorização SQL
precede consumo e parse. Há limite de cinco requisições por IP/minuto por instância.

O parser usa `npm:node-forge@1.4.3`, versão fixada, e `node:crypto` para provar
correspondência RSA >=2048 bits, assinatura digital, validade, política A1
`2.16.76.1.2.1.n`, CNPJ do SAN `2.16.76.1.3.3` e cadeia para raízes revisadas.
Não deriva CNPJ do CN, não aceita raiz do usuário como autoridade de confiança,
não informa CRL/OCSP validado e não presume poderes de representação municipais.
O preflight limita estrutura ASN.1 e custo KDF a 200.000 iterações antes de derivar
MAC/chaves. Arquivos que excedem esse limite falham explicitamente.

O CNPJ deve ser exatamente o da origem de certificado resolvida pelo backend.
Uma filial configurada para usar a matriz exige o certificado da matriz, não o de
outra filial da mesma raiz. O vínculo institucional e a raiz também são revalidados.

Material PEM normalizado vai para Vault por RPC exclusiva de `service_role`.
O writer reautoriza a identidade/contexto/polo antes de replay e gravação. A senha
e o PFX não são persistidos. Auditoria guarda fingerprint público e correlação,
nunca chave, senha, XML ou conteúdo do certificado. Getters não devolvem segredo,
identificador Vault ou PEM. Cadastro não habilita emissão: readiness continua BLOCKED,
revogação UNKNOWN e representação não verificada.

## Trust store oficial

Baixado em 08/11/2026 do repositório oficial ITI. O código contém PEMs públicos
normalizados; SHA-256 abaixo corresponde aos bytes originais `.crt` baixados.

| Raiz | Fonte oficial | SHA-256 do arquivo original |
| --- | --- | --- |
| v5 | https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt | `5bd85f219695dabe6cf3d4bd713d9bd8e41b2323194022acf1acd658daef148a` |
| v10 | https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt | `3b3ef39649ba13e10a99bc042cfc112723d8e0503326174f15ab89941a0f33e0` |
| v12 | https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv12.crt | `ce6c66c73e41b12881ea8a9b8cb7efef9a482ea012c3cd3b843667e37a7a145c` |

O default usa somente essas três raízes. `NFSE_ICP_BRASIL_CA_BUNDLE` pode selecionar
um subconjunto delas; fingerprints diferentes falham. Acrescentar outra raiz exige
revisão de origem, fingerprint e código. Não há download de certificados/CRL no request.
Uma cadeia incompleta que não leve a essas raízes falha; não se usa AIA arbitrário.

## Publicação futura

Manter `verify_jwt: true` explicitamente no manifesto de deploy MCP. Sem seção
dedicada em config.toml, o [padrão documentado do Supabase](https://supabase.com/docs/guides/functions/function-configuration)
é JWT habilitado; o handler também chama `auth.getUser()` e RPC de autorização.
A implantação exige aplicar as migrations de configuração e certificado na ordem,
Vault disponível, secrets institucionais do runtime e smoke autenticado em Safari.
O frontend usa `NFSE_CONFIGURATION_ENABLED=true` após aplicação e conferência do backend.
As flags de emissão, escrita fiscal e provedor continuam false; a decisão de acesso piloto
e a autorização administrativa da matriz continuam obrigatórias.

Os testes usam certificados e chaves sintéticos gerados somente em memória. Os testes
SQL usam um stub de Vault isolado e não alegam provar criptografia da extensão real.
Antes de liberar emissão faltam CRL/OCSP, representação, credenciamento, contrato
SEFIN homologado, reconciliador e prova de emissão/consulta no ambiente autorizado.

## Validação local e CI

`deno.json` usa lockfile dedicado congelado com integridades de node-forge,
Supabase JS e dependências transitivas. Executar na raiz do repositório:

```sh
deno test --config supabase/functions/nfse-certificate-upload/deno.json --allow-env supabase/functions/nfse-certificate-upload/certificate.test.ts
deno check --config supabase/functions/nfse-certificate-upload/deno.json supabase/functions/nfse-certificate-upload/index.ts
```

Referências: [OIDs ICP-Brasil](https://www.gov.br/iti/pt-br/assuntos/legislacao/documentos-principais/copy_of_IN152020DOC04.01comanexo.pdf),
[Vault](https://supabase.com/docs/guides/database/vault),
[node-forge](https://www.npmjs.com/package/node-forge?activeTab=versions).
