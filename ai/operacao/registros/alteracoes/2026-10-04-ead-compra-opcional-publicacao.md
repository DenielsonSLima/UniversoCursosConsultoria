# Compra EAD opcional — publicação da classificação financeira

## Estado e autorização

Primeira etapa autorizada para produção pelo responsável em 04/10/2026:
“pode aplicar e atualizar o projeto”. Versão de entrega: 4.8.167.
Migrations aplicadas via MCP Supabase, com nomes canônicos iguais ao ledger.
Publicação GitHub/Vercel acompanha esta entrega, com CI e Preview antes do merge.
O lote Proesc e arquivos paralelos não integram este manifesto.

## Objetivo e critérios de aceite

- Compra inicial EAD opcional não integra dívida ou inadimplência.
- Sinais de pagamento anteriores à baixa canônica preservam essa exclusão.
- Receita confirmada continua no contrato financeiro existente.
- Cobranças manuais, técnicas e de vínculos ativos conservam elegibilidade.
- A correção altera leitores SQL, sem cancelar boleto, matrícula ou inscrição.
- Expiração automática, recompra e recuperação após cancelamento ficam fora
  desta publicação; nenhum worker, cron ou flag de ativação será publicado.

## Manifesto explícito

- `supabase/migrations/20261004155607_classify_optional_ead_checkout.sql`
- `supabase/migrations/20261004155625_exclude_optional_ead_from_debt.sql`
- `supabase/migrations/20261004155644_exclude_optional_ead_from_overdue_receivables.sql`
- `supabase/migrations/20261004173625_preserve_optional_ead_historical_cutoff.sql`
- `supabase/tests/optional_ead_checkout.fixture.sql`
- `supabase/tests/optional_ead_checkout.isolated.test.mjs`
- `.github/workflows/optional-ead-checkout.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-10-04-ead-compra-opcional-publicacao.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 11 arquivos.

## Reprodução e evidência após aplicação

Safari autenticado reproduziu R$ 99,90 em atraso em Japoatã antes do patch.
MCP Supabase confirmou uma compra inicial EAD pendente e sem baixa canônica.

Após as quatro migrations, o leitor mensal de Japoatã retornou:
atraso R$ 0,00; base elegível R$ 41.994,50 em 156 cobranças.
A exclusão corresponde exatamente à compra opcional de R$ 99,90.
Conta e matrícula continuam PENDENTE e inscrição AGUARDANDO_PAGAMENTO.
A impressão dos fatos financeiros comparados antes/depois é idêntica.
Nenhuma chamada de cancelamento ou alteração dos fatos foi executada.

## Validação e limites

Ensaio PostgreSQL/WASM aprovado após renomeação canônica: dívida versus
expiração, pagamento parcial/remoto, identidade Banese, receita confirmada,
obrigações ativas/manuais/técnicas, ACL, drift e fatos preservados.
A regressão de pagamento em mês seguinte também passou: comprovada a compra
inicial pelo começo auditado, recebimento próprio e primeira ativação paga,
o pagamento de novembro não cria dívida de outubro e permanece receita em novembro.
Ativação, uso, reativação ou pagamento anterior impedem a exclusão histórica.
O evento de criação comprova começo auditado, sem ser snapshot literal de PENDENTE;
legado sem prova temporal suficiente permanece no critério existente.

O workflow específico executa esse ensaio no CI, junto ao CI completo existente.
Migrations aplicadas são imutáveis; os onze arquivos obedecem ao teto de 500 linhas.

O smoke autenticado final está pendente: Safari voltou à tela de login com
verificação humana depois da aplicação. Foi solicitado ao responsável reabrir
o Caixa; a validação direta no banco não substitui essa conferência visual.
A limitação não afeta a evidência do contrato SQL efetivamente aplicado.
