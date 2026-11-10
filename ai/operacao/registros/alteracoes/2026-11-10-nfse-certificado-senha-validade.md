# Cadastro A1: senha e validade — 10/11/2026

## Pedido e aceite

Corrigir o campo de senha invisível, investigar rejeição de senha correta e exibir a validade após cadastrar o certificado. Pedido posterior exige refazer o modal no novo padrão visual, mantendo mostrar/ocultar senha. Publicação no GitHub e em produção autorizada explicitamente pelo usuário em 10/11/2026. Base main `4ef4d649f7cfb94acba9509b332da4cad4f38909`, versão 4.8.280, revisão 289. Candidata 4.8.281, revisão 290.

## Diagnóstico e correção

O modal dependia de estilos carregados pela página de emissão; agora importa CSS próprio e adota o padrão config-dialog de Configurações, com cabeçalho, ícone, fechar, corpo e rodapé separados. Arquivo e senha têm campos claros, botão textual mostrar/ocultar e painéis de erro e segurança. O rodapé compensa o form intermediário sem alterar o CSS compartilhado. A senha fica literal e transitória, é limpa após tentativa/fechamento e não entra em cache, logs ou armazenamento do navegador. Reenvio simultâneo é bloqueado.

O leitor PKCS#12 adapta apenas o PBES2 a UTF-8 para senhas com caracteres não ASCII. MAC e PBE legado preservam o tratamento original; uma tentativa de compatibilidade raw só ocorre após alcançar PBES2. O hook é síncrono e restaurado em finally. Formato, custo, senha/dados, algoritmo e cadeia têm códigos fixos; a interface usa mensagens permitidas, nunca texto bruto do servidor.

A validade já era extraída e persistida pelo servidor, mas não aparecia no painel. A interface agora apresenta data/hora em Brasília e avisa vencimento próximo ou ocorrido. O aviso de cadastro usa expiresAt da resposta canônica; o painel usa os metadados consultados. Não há fallback persistente entre unidades ou ambientes.

Preservados autorização antes do parse, limite de arquivo e custo criptográfico, CNPJ da origem, correspondência da chave, validade, política A1, cadeia confiável, Vault e resposta sem segredos. Revogação e representação continuam pendentes; emissão fiscal permanece bloqueada. Sem migrations ou alteração de permissões.

## Manifesto explícito

- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/alteracoes/2026-11-10-nfse-certificado-senha-validade.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-10-versao-4-8-204.md`
- `internal/versioning/system-version.json`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseCertificateModal.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/NfseConfigurationForm.tsx`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/certificate-validity.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/certificate-validity.test.ts`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/nfse-certificate-modal.css`
- `modules/gestor/configuracoes/nfse-portal-contribuinte/components/nfse-certificate-modal.contract.test.ts`
- `modules/gestor/emissor-nfse/services/configuration/certificate-upload.errors.ts`
- `modules/gestor/emissor-nfse/services/configuration/certificate-upload.errors.test.ts`
- `modules/gestor/emissor-nfse/services/configuration/certificate-upload.service.ts`
- `scripts/test-nfse-certificate-ui.mjs`
- `supabase/functions/nfse-certificate-upload/certificate.ts`
- `supabase/functions/nfse-certificate-upload/certificate.test.ts`
- `supabase/functions/nfse-certificate-upload/pkcs12-reader.ts`
- `supabase/functions/nfse-certificate-upload/pkcs12-reader.test.ts`

Total: 22 arquivos. A entrada 4.8.204 foi arquivada sem alterar seu texto para conservar o teto do changelog. Fontes auxiliares baixadas para validação e arquivos temporários não integram a publicação.

## Validação e limites

Nove testes frontend aprovados em Node 24: quatro de validade, dois de contrato visual e três de mensagens seguras. Os quatro de validade passaram também em Honolulu e Tóquio. Script DOM e serviço real com remoto simulado cobrem campo, mostrar/ocultar, senha literal no multipart, limpeza, foco, formato, escopo, data e erro de confiança; não equivalem a navegação autenticada.

Onze testes backend aprovados em Node e Deno 2.9.6 nativo, com certificados sintéticos. Deno check passou para index e ambos os testes, e Deno test com checagem passou 11/11. As cópias locais foram conferidas por SHA-256, usando node-modules-dir=manual, no-config e no-lock com versões npm fixadas. A CI do baseline também aprovou Deno congelado e tipos. Prova OpenSSL independente cobriu formatos moderno/legado, senha com Unicode e espaços, senha vazia e rejeição da senha errada.

A validação local preservou as entradas históricas, versão e teto dos arquivos do manifesto. O baseline técnico `27af198c34f0158e91594365822f1e7457886d18`, no PR 375, concluiu os nove checks e Preview Vercel com sucesso, incluindo TypeScript, lint, testes e build globais (run 42804709492) e NFS-e Node/DOM/SQL/Deno congelado (run 42804709364). A revisão visual posterior passou novamente os nove testes frontend e o script DOM local; exige nova CI e Preview do seu SHA antes da publicação.

Smoke Safari autenticado pendente porque o computador do usuário está offline. Não foi enviado certificado real. O erro relatado durante a revisão ocorreu na versão antiga em produção. Preview, checks do commit final revisado, deploy Edge e produção ainda pendentes neste registro; o sucesso do baseline não substitui esses passos.

## Publicação e reversibilidade

Publicar somente o manifesto, com commit atômico e Preview antes da produção. GitHub e Supabase exclusivamente por MCP. A Edge deve manter verify_jwt=true e as mesmas guardas e segredos existentes, sem ler ou exportar seu conteúdo. A versão remota inicial está ACTIVE v1, com fonte igual à base. Frontend e Edge precisam corresponder ao commit validado.

Em regressão, restaurar a revisão anterior de frontend/Edge sem apagar certificados ou dados do Vault. Ausência de cadastro confirmado exige consultar o estado antes de repetir upload. Alterações de emissão, trust store, RLS e banco estão fora deste lote.

