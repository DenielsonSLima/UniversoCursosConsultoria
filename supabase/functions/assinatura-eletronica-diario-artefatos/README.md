# Artefatos assináveis do Diário

Edge Function autoritativa para duas ações públicas e estritas:

- `PREPARE_ORIGINAL`: congela o snapshot v3, os recursos binários, o manifesto
  semântico e o alvo de assinatura antes de publicar o PDF original privado.
- `FINALIZE`: lê o original congelado e todos os eventos
  `ASSINATURA_CONCLUIDA` autorizados, com método `SENHA_REAUTENTICADA`, aplica
  o mesmo template global a cada signatário e publica o PDF final e o
  comprovante de duas páginas.

O corpo aceito é exatamente `{ action, envelopeId, requestId }`. PDF, snapshot,
hash, participantes, URLs ou recursos enviados pelo navegador são rejeitados.

## Configuração obrigatória

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

A origem/allowlist do verificador é canônica e fixada no bundle como
`https://universocc.com.br`. Ela não é segredo nem configuração de ambiente:
alterá-la muda os manifests e hashes congelados dos documentos oficiais.

`verify_jwt = true` permanece configurado em `supabase/config.toml`. A função
ainda revalida o token e a sessão antes de interpretar o corpo.

## Saga de Storage e idempotência

Os três caminhos privados são determinísticos por envelope. Upload usa
`upsert: false`. Em conflito, o objeto existente só é reutilizado quando tamanho
e SHA-256 coincidem byte a byte com o artefato recém-composto. Falha ambígua
nunca dispara exclusão: o órfão privado idêntico converge no retry com o mesmo
`requestId`; um objeto divergente fecha a operação com erro.

Cada path recebe uma intenção no banco antes do upload. Intenções não
registradas expiram após 30 minutos e são reconciliadas oportunisticamente em
um objeto por invocação autenticada bem-sucedida. A tarefa roda em background com
`EdgeRuntime.waitUntil`, depois da operação principal, e nunca acrescenta o I/O
de até 50 MiB à latência da resposta. Sem tráfego futuro o órfão privado
permanece fail-closed até a próxima invocação; agendamento dedicado é hardening
pré-escala, não requisito do piloto.

O banco entrega um claim com lease, a Edge confere tamanho e SHA-256 dos bytes,
revalida o claim imediatamente antes da remoção e usa somente a Storage API.
Depois de autorizar um delete, a intenção bloqueia qualquer nova reserva. Se o
worker cair, um novo claim só pode rotacionar o token após quarentena de 15
minutos (acima do teto de execução da Edge), evitando que worker stale apague
bytes de um retry. Artefato registrado/referenciado, estado avançado ou bytes
divergentes nunca são apagados; divergência fica marcada para intervenção.

## Manifesto local para deploy via MCP

Além de todos os arquivos desta pasta (`index.ts`, `artifacts.ts`,
`artifact-assets.ts`, `snapshot-integrity.ts`, `supabase-adapter.ts`,
`deno.json` e `deno.lock`), o bundle precisa receber estes imports relativos:

- `supabase/functions/_shared/http.ts`
- `modules/gestor/components/institutional-header.model.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-image.core.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-table.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-print.utils.ts`
- `modules/gestor/secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf.ts`
- `modules/gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts`
- `modules/gestor/secretaria/shared/canonical-document-pdf.types.ts`
- `modules/gestor/secretaria/shared/canonical-document-vector-pdf.core.ts`
- `modules/gestor/secretaria/shared/canonical-institutional-header-pdf.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.contract.ts`
- `modules/shared/assinatura-eletronica/canonical-institutional-watermark.ts`
- `modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts`
- `modules/shared/assinatura-eletronica/pdf-document-signature.server.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-placement.ts`
- `modules/shared/assinatura-eletronica/signature-stamp-template.ts`
- `modules/shared/document-validation/document-validation.qr.ts`
- `modules/shared/document-validation/document-validation.url.ts`
- `modules/shared/qrcode/local-qrcode.ts`

O grafo do entrypoint é validado com `deno check` e usa somente núcleo vetorial
server-safe. As dependências externas são fixadas no import map:
`pdf-lib@1.17.1`, `jspdf@4.2.1` (subpath ESM) e `qrcode@1.5.4`; o lockfile deve
acompanhar o deploy.
