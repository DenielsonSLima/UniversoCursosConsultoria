# Acesso do aluno: confirmação de e-mail, senha e termos

Lote crítico de Auth, separado do lote de boletim publicado na 4.8.207. Produção 4.8.208, migrations e deploy da função autorizados explicitamente nesta conversa. Revisões local e remota aprovadas; banco e função aplicados, interface destinada a commit atômico, CI e Preview antes da promoção. Memória, políticas, skills e migrations anteriormente aplicadas permanecem intactas.

## Problema e resultado

A validação administrativa gravava somente uma marca no cadastro; a confirmação efetiva no Auth ocorria junto com a emissão de senha temporária. A tela também usava termos pendentes para anunciar criação de senha, mesmo quando a senha já existia.

A confirmação administrativa passa a confirmar o Auth atomicamente, preservando senha e consentimentos. E-mail, senha e termos possuem estados separados na tela. Reenvio preserva a credencial criada; assistência temporária recusa essa credencial mesmo com termos pendentes. Confirmação inicial sem ledger válido ou signup público canônico mantém a criação de senha obrigatória.

## Aceite e revisão dos três agentes

| Situação | Resultado esperado |
| --- | --- |
| E-mail validado administrativamente, senha criada, termos pendentes | Confirmar Auth; preservar senha; pedir somente aceite no portal. |
| E-mail confirmado, criação de senha pendente | Primeiro acesso exige senha e termos pendentes. |
| Senha alterada após emissão temporária, termos pendentes | Reconhecer a troca realizada; preservar senha; manter aceite pendente. |
| Acesso concluído | Oferecer recuperação, sem apresentar assistência temporária. |
| Identidade divergente, escopo inválido ou emissão em andamento | Recusar sem alterar credencial nem consentimentos. |

- Backend/Auth implementou RPC, reserva, trigger e handlers com testes focados.
- Interface implementou estado, transporte da evidência e apresentação separada.
- Contratos revisou ambas as frentes e os cenários adversariais; parecer local aprovado, sem bloqueantes identificados.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/StudentEmailAccessStatus.tsx`
- `modules/gestor/parceiros/components/viewparceiros/shared/student-access-state.ts`
- `modules/gestor/parceiros/components/viewparceiros/shared/student-access-state.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.test.ts`
- `modules/gestor/parceiros/student-first-access.contract.test.mjs`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.ts`
- `supabase/functions/portal-user-management/handlers/confirm-partner-email.test.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.ts`
- `supabase/functions/portal-user-management/handlers/issue-student-temporary-password.test.ts`
- `supabase/functions/portal-user-management/handlers/student-first-access-state.ts`
- `supabase/functions/portal-user-management/handlers/student-first-access-state.test.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.created-password.test.ts`
- `supabase/migrations/20261010193000_confirm_student_email_atomically.sql`
- `supabase/migrations/20261010193100_preserve_created_student_password.sql`
- `supabase/migrations/20261010193200_require_password_proof_on_email_confirmation.sql`
- `supabase/tests/student_email_confirmation.isolated.test.mjs`
- `supabase/tests/fixtures/student_email_confirmation_schema.sql`
- `supabase/tests/fixtures/student-email-confirmation-harness.mjs`
- `ai/operacao/registros/alteracoes/2026-10-10-aluno-acesso-email-senha-termos.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`
- `scripts/test-student-email-access.mjs`

Total: 29 arquivos.

## Validação e operação pontual

- Interface: 44 testes focados e compilação das duas entradas TSX aprovados.
- Backend: 70 testes Deno focados aprovados.
- SQL: 20 casos PGlite com RPC e trigger reais aprovados, incluindo preservação, rollback da auditoria, retry autorizado, snapshot, multipapel e fences.
- `npm run build`: aprovado, incluindo controle de versão vigente e geração de páginas sociais; artefatos regeneráveis fora do manifesto.
- `npm run check:file-lines`: aprovado no registro vigente; manifesto deste lote contado separadamente, todos os arquivos até 500 linhas.
- MCP Supabase aplicou as três migrations na ordem revisada. O ledger gerou versões próprias; os arquivos aplicados são imutáveis e o mapeamento abaixo é a referência para reconciliar ambientes sem reaplicar.
- A conta reportada foi reconciliada pontualmente com a validação administrativa e auditoria já existentes. Asserções transacionais preservaram hash, metadados, recuperação e consentimentos. O contrato remoto `portal_listar_perfis`, sob contexto autenticado da identidade, retorna troca de senha dispensada e termos pendentes. Isso não constitui teste completo do login.

## Limites e entrega remota

Smoke autenticado final ficou pendente no CAPTCHA do Safari, aguardando confirmação específica de interação. Nenhum termo foi aceito pelo agente. Concorrência entre sessões foi revisada e coberta por contrato de locks, sem ensaio simultâneo real. Callback PKCE é risco adjacente identificado, fora deste manifesto.

A entrega geral foi autorizada: migrations e deploy de `portal-user-management` por MCP Supabase, commit e PR por MCP GitHub, Preview e produção da interface pelo projeto Vercel existente. A assinatura antiga da RPC de confirmação foi removida; schema e handler foram aplicados sequencialmente, com falha fechada de chamadas antigas durante a transição.

| Arquivo aplicado | Versão no ledger remoto |
| --- | --- |
| `20261010193000_confirm_student_email_atomically.sql` | `20261010194524` |
| `20261010193100_preserve_created_student_password.sql` | `20261010194527` |
| `20261010193200_require_password_proof_on_email_confirmation.sql` | `20261010194529` |

`portal-user-management` está ACTIVE na versão 38, com JWT habilitado. O pacote remoto anterior foi preservado; somente os quatro handlers/helpers autorizados foram substituídos. A leitura posterior conferiu os 39 arquivos, sem diferenças de conteúdo contra o pacote candidato. A versão 38 remove somente uma atribuição inicial inútil apontada pelo lint do CI; lint focado e nove testes do handler passaram depois da correção.

A revisão independente remota confirmou os três corpos SQL idênticos à fonte local, RPC com quatro argumentos obrigatórios, ausência da assinatura antiga, grants efetivos exclusivos de service_role/proprietário e trigger ativo. A chamada real de retry com gestor autorizado passou; snapshot divergente foi recusado e asserções preservaram integralmente Auth, perfil e contagem da auditoria. A confirmação inicial e os demais cenários adversariais foram exercitados nos 20 testes SQL isolados.

O runner do CI passou localmente com 32 casos Node, seis Deno e 20 SQL. Build 4.8.208 e gate de linhas passaram após inclusão dos arquivos de publicação. Resultados de CI, Preview e promoção são registrados na PR de entrega, cujo manifesto deve conter somente estes 29 arquivos.

O primeiro Preview estava READY, porém sem configuração pública do Supabase e com renderização vazia. Foram adicionadas somente as quatro configurações públicas VITE necessárias na branch deste lote (URL Supabase, chave anon/publishable, URL do site e modo da aplicação), preservando os valores e escopos de produção e das demais branches. O novo commit deve gerar outro Preview com esses valores. Nenhuma chave service_role foi transferida.
