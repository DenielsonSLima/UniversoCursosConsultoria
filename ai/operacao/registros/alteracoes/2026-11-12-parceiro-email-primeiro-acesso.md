# Parceiros: correção de e-mail do primeiro acesso

## Pedido e evidência inicial
Usuário confirmou o caso em Aluno/Professor de Parceiros e solicitou ajuste com três agentes. Salvar o contato do Aluno não dispara novo convite; o reenvio prioriza o login antigo e pode retornar um link manual acompanhado de “Aluno sem e-mail” apesar do contato corrigido. Professor vinculado tem e-mail bloqueado na tela.

Backend implantado portal-user-management v40 conferido contra a fonte local: handlers relevantes idênticos. Simulação sem rede reproduziu resposta HTTP200, recoveryEmailSent=false, sem envio, com mensagem incorreta. O contrato de correção não estava coberto pelos testes existentes.

## Aceite
1. Correção de primeiro acesso comprovadamente pendente mantém UID e CPF, corrige cadastro/login juntos e invalida links anteriores.
2. Autorização por gestor, módulo, polo, horário, snapshot e destino único; replay idempotente e concorrência controlada.
3. Conta utilizada, senha pronta, identidade compartilhada ou provedor externo não são transferidos pelo fluxo automático de primeiro acesso.
4. Envio ao novo endereço é explícito: aceito pelo serviço de e-mail ou pendente/falhou; sem mensagem falsa de convite enviado.
5. Salvamento, falha parcial, repetição e caches afetados apresentam o estado canônico em Aluno/Professor.
6. Testes locais com mocks e banco descartável; sem envio de e-mail real e sem alterar contas de produção como teste.

## Manifesto explícito
Backend: correção transacional, invalidação e entrega. Frontend: salvamento, campos, cache e feedback. Segurança: revisão independente e regressão do contato divergente. Integração do endpoint e documentação pelo agente principal.
Total: 34 arquivos
Ajustes de EAD e Serviços/BolePix pertencem a lotes separados e não integram este candidato.

- `modules/gestor/parceiros/parceiros.service.ts`
- `modules/gestor/parceiros/portal-activation.service.ts`
- `modules/gestor/parceiros/partner-email-update.ts`
- `modules/gestor/parceiros/partner-email-feedback.ts`
- `modules/gestor/parceiros/partner-email-update.test.ts`
- `modules/gestor/parceiros/partner-email-update.interaction.test.mjs`
- `modules/gestor/parceiros/utils/parceiro-mappers.ts`
- `modules/gestor/parceiros/utils/parceiro-mappers.test.ts`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoAddressSection.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados.tsx`
- `modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDetalhes.tsx`
- `supabase/migrations/20261112220600_partner_email_correction_ledger.sql`
- `supabase/migrations/20261112220700_partner_email_correction_atomic.sql`
- `supabase/migrations/20261112220800_partner_email_correction_delivery.sql`
- `supabase/functions/portal-user-management/handlers/correct-partner-email.ts`
- `supabase/functions/portal-user-management/handlers/correct-partner-email-delivery.ts`
- `supabase/functions/portal-user-management/handlers/correct-partner-email.test.ts`
- `supabase/tests/fixtures/partner-email-correction-harness.mjs`
- `supabase/tests/fixtures/partner-email-correction-postgres-harness.mjs`
- `supabase/tests/partner_email_correction.isolated.test.mjs`
- `supabase/tests/partner-email-correction-postgres-concurrency.mjs`
- `.github/workflows/partner-email-correction.yml`
- `supabase/functions/portal-user-management/index.ts`
- `supabase/functions/portal-user-management/types.ts`
- `supabase/functions/portal-user-management/handlers/send-student-invite.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-recovery.ts`
- `supabase/functions/portal-user-management/handlers/student-invite-corrected-contact.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-12-parceiro-email-primeiro-acesso.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-07-versao-4-8-252.md`

## Limitações e implantação
Implementação local 4.8.322 concluída. O banco mantém correção e invalidação na mesma transação e entrega por claim/nonce com recuperação após 120 segundos. O mesmo pedido concluído não reenvia nem invalida o link novo. Contas usadas, compartilhadas, com senha ou provedor externo são recusadas antes da alteração de identidade. O novo e-mail não é confirmado pelo gestor por este fluxo.

Validação: 12 testes do coordenador e 2 de interação/transporte aprovados, mapeamento/contratos de Parceiros preservados; 8 ensaios SQL isolados com triggers reais e 6 do handler aprovados. TypeScript completo passou. Workflow PostgreSQL17 preparado para locks, replay e fences reais; execução de CI pendente na abertura do candidato.

Implantação proposta: aplicar as três migrations inéditas e implantar portal-user-management com JWT verificado antes do frontend. Nenhuma migration aplicada nem Edge publicada nesta etapa. Não enviar e-mail real nem alterar conta de produção para obter evidência de teste. Conferência visual permanece com o usuário.

## Rebase seletivo do candidato
- Base atual: main `c02ea08ed6dd7897419abb5720d00479fbefe20d`, versão publicada 4.8.321. Os dez arquivos da PR #414 e seu registro publicado são herdados, sem revertê-los.
- O arquivo de histórico 4.8.251 já é idêntico na base e não integra o diff; a entrada 4.8.252 foi arquivada integralmente para manter o changelog ativo com até 500 linhas.
- Candidato Auth passou de 4.8.320 para 4.8.322; a entrada 4.8.321 publicada foi preservada. CI real do novo head será conferido antes da entrega; ausência de run no head anterior não foi tratada como aprovação.
