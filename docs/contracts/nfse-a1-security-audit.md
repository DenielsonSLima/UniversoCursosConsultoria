# Auditoria do A1 e da senha — NFS-e Universo

Data: 11/11/2026. Escopo: matriz, homologação e produção, upload e executores NFS-e. Filiais permanecem fora da operação desta etapa.

Método: leitura de código e ACL/metadados via MCP do projeto `kfekgwyqozhicpfuunpo`; testes locais com certificados e senhas sintéticos. Não foram lidos valores do Vault, senha real, PFX real, chave privada ou XML pessoal. Nenhuma alteração remota foi feita nesta auditoria.

## Parecer

O caminho revisado autentica o usuário, reautoriza unidade/ambiente e mantém o material de assinatura fora dos DTOs públicos e dos caches do navegador. Não foi encontrado vazamento concreto de credenciais nas fontes examinadas. O risco identificado na **rotação futura do A1** foi corrigido pela migration aplicada `20261111023830_nfse_certificate_immutable_vault_versions`, sem alterar os certificados/referências atuais.

| Achado | Evidência | Efeito e tratamento |
| --- | --- | --- |
| Rotação compartilhada — corrigida | O A1 atual foi intencionalmente referenciado pelos dois ambientes. A migration `20261111023830` passou o writer a `vault.create_secret` por novo upload; confirmação MCP: `create_secret=true`, `update_secret=false`, grants preservados. | Upload futuro altera apenas a referência do proprietário/ambiente autorizado e preserva o segredo anterior em uso. Replay acontece antes da criação e não gera nova versão. Não houve cópia, rotação ou exclusão de material atual nesta correção. |
| `service_role` tem leitura direta do Vault | ACL real: `anon` e `authenticated` sem `USAGE`/leitura de Vault; `service_role` com leitura de `vault.secrets` e `vault.decrypted_secrets`. | O isolamento protege usuários do aplicativo, mas não isola o material de um backend comprometido com a service key. Essa chave e o acesso administrativo são parte da fronteira de confiança. Não foram lidos seus valores. |

## Caminho e controles confirmados

1. **Navegador:** `NfseCertificateModal.tsx` mantém senha em input/ref, limpa no fechamento, desmontagem e `finally`; não usa estado de senha, local/sessionStorage ou mutation/query cache para o upload. A senha é enviada literalmente, sem `trim`, e pode conter espaços e Unicode. O serviço envia multipart diretamente para a Edge; recebe somente metadata. O browser necessariamente tem acesso ao arquivo e à senha durante o envio.
2. **Upload Edge:** `index.ts` exige Bearer e chama `auth.getUser()`. A RPC de autorização confere contexto, permissões administrativas, unidade e matriz. Isso ocorre antes de consumir/descriptografar o corpo. O writer interno repete a autorização, inclusive em replay, e só é executável por `service_role`.
3. **Formato:** somente multipart com um `certificate` e um `password`, sem campos adicionais; PFX/P12 de 1 a 128 KiB, corpo limitado a 128 KiB + 8 KiB mesmo em stream, senha até 1.024 caracteres. Extensão/MIME são verificações auxiliares; o conteúdo passa por DER/PKCS#12, MAC/decriptação, chave RSA ≥2.048 bits, prova do par por assinatura, validade, uso de assinatura, política A1 ICP-Brasil, cadeia e CNPJ SAN compatível com o escopo.
4. **Custo de parsing:** limites de iterações KDF (200 mil), profundidade/nós ASN.1 e quantidade de certificados/chaves. O adaptador PBES2 Unicode é síncrono e restaura seu hook em `finally`. A senha não é um campo de `p_material`: o Vault recebe chave PEM, certificado e cadeia após inspeção.
5. **Banco:** tabelas privadas de certificado, requests e configuração têm RLS habilitada e nenhum acesso direto para `anon`, `authenticated` ou `service_role`. Os getters internos têm `SECURITY DEFINER`, `search_path=''`, grant exclusivo de serviço e reautorizam o ator/escopo. Auditoria de upload contém contexto, ambiente, versão e fingerprint; nenhuma coluna de senha/PFX/chave na tabela de metadata.
6. **Execução:** getters HOMO/PROD são separados e restringem a matriz e o ambiente exato; validade/CNPJ/referência fiscal são rechecados. O runtime PROD tem cache apenas na closure da requisição, fecha transportes e limpa seu mapa no `finally` do endpoint. A resposta HTTP tem `Cache-Control: no-store` e omite todo material de assinatura.
7. **Configuração PROD:** o preparo autenticado referencia o A1 selecionado, exige versões/fingerprint revisados e não marca habilitação `READY`. O compartilhamento inicial de referência continua intencional para o mesmo A1; o writer corrigido não modifica esse segredo em uploads futuros. Não autoriza filiais automaticamente.
8. **Transporte privado:** A1 é enviado por HTTPS verificado somente para URLs exatas de Preview autorizadas. O cliente usa `redirect:'error'`, HMAC separado por ambiente e guarda server-side para POST. Nenhuma URL de destino, cabeçalho upstream ou segredo é aceito do navegador.

## Relay Node — revisão independente

Fontes: `api/nfse-production-relay.js`, `internal/integracoes/nfse-production-relay/{handler,transport,contract}.js`, `internal/integracoes/nfse-relay/auth.js` e equivalentes HOMO.

- Handler somente Preview, POST JSON; qualquer `Origin` e `Content-Encoding` são recusados. Browser não tem HMAC nem endpoint de leitura de A1.
- HMAC-SHA256 liga timestamp, nonce UUID e hash dos bytes exatos do corpo; janela de ±60 segundos verificada antes do socket upstream. PROD/HOMO usam chaves distintas. A nonce map é local à instância: **não constitui deduplicação distribuída/durável**. A lease fiscal durável permanece na Edge/banco.
- Host SEFIN e caminhos são fixos/permitidos por contrato, sem URL/query/headers arbitrários. GET do evento usa sequência numérica `1`; o ID XML mantém `001`.
- TLS mínimo 1.2, verificação do certificado/hostname ativa, sem redirect ou modo inseguro. Agent por requisição, `keepAlive:false`, sem cache de sessão TLS, `destroy()` em `finally`.
- Limites: 2 MiB de entrada, 4 MiB de resposta, timeout upstream 25 s e função 35 s. Respostas `no-store`, erros constantes. Nas fontes revisadas não há importação FS nem logs de corpo, cabeçalhos ou credenciais.

## Verificação remota sem segredos

- Projeto confirmado pela URL MCP; `nfse-certificate-upload`, preflight, piloto e executor individual estavam `ACTIVE` com `verify_jwt=true` no instante da leitura. O executor foi atualizado depois para a recuperação GET; a raiz acompanha sua versão atual.
- HOMO e PROD têm metadata de certificado com validade corrente, fingerprint e referência Vault presentes. Não foram retornados CNPJ, datas, UUID do segredo ou seu conteúdo nesta consulta de classificação.
- `authorize_nfse_certificate_upload_secure`: apenas `authenticated`; writer/getters de material/relay: apenas `service_role`; `anon` sem execução. `search_path` vazio confirmado nos internos consultados.
- Após a correção de rotação, a versão `20261111023830` foi conferida no ledger por MCP; o corpo remoto do writer contém criação de segredo novo e não contém `vault.update_secret`. `SECURITY DEFINER`, `search_path` vazio e grants exclusivos do writer foram reconfirmados sem leitura de material.
- Nenhum objeto com extensão `.pfx`, `.p12`, `.pem` ou `.key` foi encontrado em bucket público. É uma verificação de metadata por extensão, não inspeção de conteúdo nem garantia sobre arquivos com outro nome. O fluxo A1 revisado não usa Storage.

## Limites que permanecem explícitos

- Senha, PFX e PEM existem transitoriamente em memória do browser/Edge/Node. Buffers controlados são sobrescritos em pontos do código, mas strings/objetos de Forge, FormData, TLS e runtimes dependem do GC. Não se garante apagamento criptográfico de todas as cópias JavaScript, ausência absoluta de swap ou proteção de um processo/host comprometido.
- O Vault protege o segredo em repouso; sua view de decriptação precisa de ACL. Conforme a [documentação oficial do Vault](https://supabase.com/docs/guides/database/vault), quem pode ler a view pode obter os segredos. Não é HSM nem chave não exportável.
- Versões antigas do A1 são preservadas para referências existentes. A correção não implementa exclusão automática, revogação na autoridade certificadora ou uma política de retenção de versões; isso exige uma operação administrativa explícita e revisão das referências.
- Revogação OCSP/CRL permanece `UNKNOWN`, e cadastro A1 não prova representação/habilitação fiscal. Aceitação fiscal e autorização do documento são fatos separados, tratados pelo provedor e pelos resultados duráveis.
- CORS Edge permite domínios institucionais e origens locais previstas para aplicativo/desenvolvimento; não é autenticação nem substitui Bearer + `getUser` + autorização. O relay Node não aceita Origin de browser.
- Rate limit e nonce em memória são por instância. Não se atribui a eles garantia global. Controle contra reenvio fiscal vem de snapshot, identidade e leases persistidos.
- A propagação do evento fiscal pode ser eventual: na validação real, um POST aceito foi seguido de GET404 temporário; a consulta posterior da mesma chave/tipo/sequência retornou o evento e comprovou o cancelamento. `404` não prova ausência histórica de POST e não autoriza reenvio automático. A recuperação permaneceu somente GET, sem nova lease ou POST.
- O `result` do cancelamento representa a observação mais recente; uma reconciliação pode substituir os metadados do HTTP anterior. Não existe, nesta versão, uma trilha append-only de cada execução HTTP. As leases duráveis são controles de concessão de envio, não uma prova de que o provedor recebeu determinado POST. Não foi adicionada nova auditoria para o caso de propagação.
- Valores de ENV, acesso administrativo da plataforma, política de captura de corpos/APM, backups externos, crash dumps e hosts não foram inspecionados. Fonte sem `console`/FS não prova ausência de logging na infraestrutura. A raiz valida a configuração de deploy/proteção sem divulgar valores.
- Esta auditoria não afirma que a aplicação inteira é invulnerável; a conclusão se limita ao caminho e aos metadados descritos.

## Testes executados nesta revisão

| Teste | Resultado | O que sustenta |
| --- | --- | --- |
| Upload/PKCS#12 Deno | 15/15 | Senha literal Unicode/espaços, MAC/cadeia/chave/CNPJ, custos, parsing seguro, autorização antes do corpo, limites de stream e erro sanitizado. |
| SQL certificado + preflight + produção, PGlite | 19/19 | Grants/escopo, replays, Vault via stub local, validade e metadata, restrição de ambiente/matriz, fluxo durável sem dados financeiros. Não prova criptografia real do Vault. |
| Writer A1 original + versões imutáveis, PGlite | 12/12 | Rotação isolada por ambiente, preservação de referência compartilhada anterior, replays sem novas versões, falha atômica e grants. |
| Modal/validade frontend | 6/6 | Senha transitória e literal; limpeza/caches; validade em fuso explícito. |
| Relays Node, revisão independente | 7/7 | Mocks de autenticação/transporte e restrições; não foi usado A1 real. |
| Rotação do URL do relay | 4/4 SQL, 9/9 Deno | Troca somente URL, preservação das credenciais sintéticas, pins exatos e GET de evento numérico sem abrir novas escritas. |

Referências de suporte: [segurança de Edge Functions](https://supabase.com/docs/guides/functions/auth), [Vault](https://supabase.com/docs/guides/database/vault) e [changelog Supabase](https://supabase.com/changelog.md), consultados nesta auditoria. Os controles concretos acima foram verificados no código/ACL do Universo, sem assumir que a documentação substitui o teste do projeto.
