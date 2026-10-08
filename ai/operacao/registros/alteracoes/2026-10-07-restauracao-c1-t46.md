# Restauração do fluxo normal de primeiro ciclo

## Objetivo e autorização

Correção operacional restrita às três matrículas indicadas pelo responsável na
turma 46: retirar emissões erradas, ciclos e projeções de correção para voltar ao
fluxo de primeiro ciclo já publicado. Não emitir boletos nesta operação.

O responsável confirmou também que o lançamento local recebido de R$ 200,00 foi
registrado por engano e autorizou sua correção. A reversão é escritural, sem
devolução ou transferência bancária. A auditoria técnica permanece privada e
fora do histórico operacional de cobranças das matrículas.

O responsável proibiu uso do navegador durante o trabalho. A partir dessa
instrução, a validação segue por MCP, RPC e testes dos componentes publicados.

## Diagnóstico

O estado `correcaoEmissao` intercepta o botão e o modal padrão. Retirar somente
texto ou JSX não corrige a elegibilidade: recebíveis, runs e itens de correção
mantêm o primeiro ciclo existente e forçam a retomada especial.

O componente publicado já oferece o fluxo normal quando o backend retorna
`ELEGIVEL`, `podeGerar=true`, `proximoCicloNumero=1`, `cicloGerado=null` e ausência
de `correcaoEmissao`. Não há alteração de frontend nem novo modal neste lote.

## Aceite

- As três matrículas voltam ao primeiro ciclo pelo contrato canônico existente.
- Emissões erradas deixam histórico operacional, fila e retomada das matrículas.
- Cancelamentos bancários comprovados e identidades antigas ficam arquivados,
  sem novo POST, baixa bancária, reutilização de número ou envio de mensagem.
- O lançamento recebido por engano é revertido pelo contrato de estorno local.
- Registros alheios às três matrículas e estado acadêmico permanecem intactos.
- Prévia normal de primeiro ciclo funciona; C2 continua subordinado ao C1.

## Manifesto explícito

- `ai/operacao/registros/alteracoes/2026-10-07-restauracao-c1-t46.md`
- `supabase/migrations/20261008021540_restore_t46_normal_first_cycle.sql`
- `supabase/tests/t46-canonical-cycle-reset-ui.test.mjs`
- `supabase/tests/t46_normal_first_cycle_reset.rollback.sql`

Total: 4 arquivos.

## Validação e estado

- Diagnóstico realizado em três frentes independentes: UI, dados e revisão.
- Cinco testes com parser e componente publicados passaram, incluindo projeção
  limpa, rejeição de reset parcial, manutenção dos bloqueios acadêmicos e as
  três projeções reais resultantes da limpeza. Payloads privados só em `tmp`.
- Fontes frontend conferidas no commit
  `3f7a749149050f6dac08b095e6d54106824fd9b0` (4.8.181).
- Reversão local de R$ 200,00 ensaiada por MCP em transação revertida: um evento
  auditado, replay idempotente, recebível pendente e nenhum boleto recriado.
- Aplicação concluída por MCP Supabase no projeto Universo em 07/10/2026 às
  23h15 (America/Maceio). Ledger `20261008021540`, fonte aplicada idêntica ao
  arquivo versionado, SHA256
  `dde371a5f57d7fbfe90bd6d7cab31ded02fdf59ab0d27e6662bf5d67eb982410`.
- Conferência posterior: três matrículas elegíveis para C1, zero recebíveis,
  runs ou itens de correção operacionais; 49 transações bancárias canceladas
  preservadas e desvinculadas. Um estorno de R$ 200,00 com um evento de auditoria.
- Nove prévias padrão (três modos de matrícula para cada aluna) e três extratos
  zerados passaram antes e depois da aplicação. Nenhuma emissão foi executada.
- As 49 identidades bancárias canceladas foram recusadas pelo trigger real;
  arquivo técnico recusou alteração, exclusão e acesso por papéis da aplicação.
- Matrículas acadêmicas e três dispensas locais alheias ao alvo foram comparadas
  integralmente e permaneceram iguais. Os cancelamentos já estavam comprovados,
  com situação 5, identidade/termos válidos e zero pagamentos efetivados.
- Smoke visual posterior não executado por instrução expressa do responsável.
- Alterações paralelas e migrations antigas são preservadas. Sem atualização
  de versão, memória, skills ou contrato global de elegibilidade.
- `check:file-lines` aprovado em espelho temporário restrito aos quatro arquivos
  do manifesto; maior arquivo com 336 linhas. Índice RAG regenerado uma vez.
