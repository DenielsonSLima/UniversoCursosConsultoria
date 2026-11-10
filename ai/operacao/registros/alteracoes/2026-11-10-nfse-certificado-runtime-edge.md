# Cadastro A1: compatibilidade do runtime Edge — 10/11/2026

## Pedido, base e escopo

Investigar e corrigir a rejeição do certificado após a publicação 4.8.281, comparando a validação com o fluxo contábil. Base main `678b4264f00df6f6ea48c6b01992450f3395c49c`, versão 4.8.281, revisão 290; candidata 4.8.282, revisão 291. A entrega anterior foi integrada pelo PR 375. Este lote não altera o modal, a apresentação da validade ou o contrato da resposta.

## Diagnóstico e correção

O runtime Deno 2.1.4 usado como referência para a Edge não implementa operações de X509Certificate usadas pelo parser anterior: checkPrivateKey, checkIssued, verify e raw. A reprodução sintética da base falhou em três dos sete testes de certificado nesse runtime, embora passasse no Deno 2.9.6. Assim, testes apenas no runtime atual não comprovavam compatibilidade com a Edge. Isso identifica um defeito concreto, sem afirmar que o certificado real do usuário já foi validado.

A correção usa os inteiros RSA n/e do Forge para associar chave privada e certificado e comprova os componentes privados com assinatura/verificação de um desafio fixo. A ordenação da cadeia verifica emissor e assinatura; a validação final mantém apenas âncoras oficiais configuradas no servidor. A impressão digital SHA-256 usa o DER do certificado; o titular preserva atributos UTF-8. Mantidos node-forge 1.4.3, leitor PBES2 UTF-8 e suporte legado, limites de tamanho/custo, autorização prévia, CNPJ da origem, validade e política A1, Vault e erros sanitizados.

Não há migração, mudança de permissão, leitura de credenciais ou envio fiscal. Revogação permanece UNKNOWN, representação não comprovada e prontidão BLOCKED. O CI acrescenta um job Deno 2.1.4 sem remover os jobs atuais. O gerador sintético PBES2 dos testes passa a usar WebCrypto PBKDF2/AES-CBC independente do leitor, porque a exportação PKCS8 cifrada do polyfill Node também não funciona nesse runtime. O helper de produção PBES2 permanece intacto.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-certificado-runtime-edge.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-versao-4-8-205.md`
- `internal/versioning/system-version.json`
- `supabase/functions/nfse-certificate-upload/certificate.ts`
- `supabase/functions/nfse-certificate-upload/certificate.test.ts`
- `supabase/functions/nfse-certificate-upload/pkcs12-reader.test.ts`

Total: 11 arquivos. A entrada 4.8.205 é arquivada sem mudança de texto, mantendo o changelog em até 500 linhas. Fontes auxiliares e artefatos temporários de validação não integram a publicação.

## Validação e limites

Quinze testes sintéticos aprovados no Deno 2.1.4 em execução e no Deno 2.9.6 com checagem de tipos: onze do certificado/handler e quatro do leitor PKCS12. O check do index e dos dois testes também passou no Deno 2.9.6. Cobertura inclui chave divergente ou componentes privados inválidos, titular UTF-8, fingerprint/validade, cadeia desordenada e emissor homônimo, assinatura inválida, CNPJ, autorização, custos e senhas modernas/legadas. As cópias testadas foram conferidas por SHA-256.

O teste local usa no-config, no-lock e node-modules-dir=manual com dependências fixadas; no Deno 2.1.4 usa também no-check. O job adicional usa node-modules-dir=none para o runner limpo. Deno 2.1.4 não lê o lock formato 5; os jobs atuais mantêm frozen e checagem de tipos. A execução exata do novo job em runner limpo, CI completa, Preview, integração e implantação deste lote ainda estão pendentes. O sucesso da versão anterior não comprova este patch.

Versão e preservação das 73 entradas históricas conferidas; arquivos manuais do manifesto respeitam o teto de 500 linhas. Workflow analisado como YAML e jobs/acionamentos/permissões anteriores preservados integralmente. Registro contém somente contexto técnico, sem material real ou dados pessoais identificáveis.

Nenhum certificado real ou senha do usuário foi lido. O smoke Safari autenticado continua pendente porque o computador está offline. A prova sintética valida contratos e compatibilidade, não substitui o cadastro real confirmado.

## Publicação e reversibilidade

Publicar somente este manifesto em commit atômico, após testes e revisão; exigir CI e Preview do SHA exato antes da produção. GitHub e Supabase exclusivamente por MCP. Integração e implantação dependem da autorização aplicável ao novo PR e lote, sem presumir autorização específica a partir do PR anterior.

A Edge deve manter verify_jwt=true, guardas e segredos existentes sem exportá-los. Conferir a fonte implantada contra o commit aprovado. Em regressão, restaurar a revisão anterior sem apagar certificados, Vault ou metadados. Consultar estado confirmado antes de repetir upload com resultado incerto.
