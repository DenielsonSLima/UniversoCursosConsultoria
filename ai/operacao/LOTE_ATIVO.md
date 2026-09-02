# Lote ativo

Estado: `RECUPERAÇÃO BANESE CONCLUÍDA — PUBLICAÇÃO GITHUB EM ANDAMENTO`

## Lote: 2026-09-01-hotfix-emissao-integrada-ciclo-t42

- Pedido: corrigir a multa de atraso da Turma 42 para 2% e transformar a
  confirmação do ciclo manual em uma operação única que cria/reutiliza os 13
  recebíveis, emite os 13 BolePix Banese e os deixa disponíveis no Financeiro.
- Autorização: produção, recuperação interna e publicação no GitHub foram
  autorizadas explicitamente pelo gestor em 01 e 02/09/2026.
- Risco: crítico, domínio financeiro/Banese/Supabase e emissão de títulos em
  produção.
- Registro:
  `ai/operacao/registros/alteracoes/2026-09-01-hotfix-emissao-integrada-ciclo-t42.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-01-hotfix-emissao-integrada-ciclo-t42.md`.

### Contrato preservado

1. Uma confirmação humana cria/reutiliza o ciclo e emite todos os títulos
   Banese, sem segunda ação em Contas a Receber.
2. A operação é idempotente e retomável; resposta ambígua nunca dispara novo
   POST antes de consulta e reconciliação canônicas.
3. A Turma 42 usa multa única de 2% e juros de 2% ao mês.
4. Rematrícula de R$ 100,00 não recebe desconto; multa vale R$ 2,00.
5. Mensalidade de R$ 279,90 recebe desconto de R$ 19,90; multa vale R$ 5,60.
6. Sucesso exige, por título, termos confirmados, Nosso Número, linha
   digitável, código de barras, par Pix oficial e exatamente uma transação.

### Evidência final em produção

- O primeiro POST técnico devolveu um BolePix oficial completo. A persistência
  foi revertida porque uma validação SQL comparava o GUI Pix com caixa alta,
  embora o EMV oficial use `br.gov.bcb.pix` em caixa baixa.
- A recuperação interna confirmou o título remoto, executou cancelamento com
  situação Banese 5, arquivou sua identidade e impediu novo POST enquanto o
  resultado permanecia ambíguo.
- Uma guarda SQL anterior tratava incorretamente `API_REVIEW -> NULL`; a
  comparação foi tornada null-safe sem relaxar a conclusão `API_REGISTERED`.
- A retomada final concluiu 13/13 títulos Banese, com zero pendentes, zero em
  revisão, 13 Nossos Números distintos e nenhuma transação duplicada.
- Todos os 13 recebíveis possuem QR Pix/copia-e-cola, imagem QR, linha
  digitável, código de barras, termos confirmados e sincronização sem erro.
- O título bancário antigo ficou cancelado e não permanece associado a nenhum
  recebível ativo.

### Validação

- 40 testes focados do contrato Banese/recuperação aprovados, além de
  `deno check`, `deno fmt --check` e revisão independente.
- Migration final `20260902091600` aplicada em produção.
- Edge `technical-manual-cycle-recovery-worker` ativa na versão 4, com
  autenticação interna própria e tempo de execução menor que o lease.
- Publicação atômica no GitHub e validação do pipeline permanecem como a etapa
  final deste lote.
