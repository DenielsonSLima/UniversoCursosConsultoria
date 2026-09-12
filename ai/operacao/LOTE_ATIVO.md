# Lote ativo

Estado: REVISAO - RADIOLOGIA BANESE E COMPOSICAO PROESC T42

## Lote: 2026-09-12-revisao-banese-proesc

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-12-revisao-banese-proesc.md`

- Pedido: revisar a cobranca Radiologia em quarentena e a discriminacao de desconto, juros e multa do financeiro Proesc T42.
- Radiologia usa Banese. T42 possui 346 vinculos Proesc e 78 boletos Banese C2. Nao emitir, cancelar ou duplicar titulos.
- Banese: diagnosticar causa e retomar somente por consulta da identidade existente.
- Proesc: principal, recebido e data efetiva preservados; composicao exige evidencia explicita ou conferencia comprovada, nunca diferenca presumida.
- Componentes desconhecidos continuam desconhecidos; nao inventar desconto em recebimento parcial.
- Agentes: diagnostico Banese, contratos/dados Proesc, revisao SQL; root integra e valida.
- Manifesto inicial: migrations 20260912220080-84; teste proesc_verified_composition.transaction.sql; mapper/types/validation/test do Caixa; rotulo em ConciliacaoRecebimentoRows.
- SQL restaurado do rascunho cancelado somente para esta revisao. Ensaio remoto com rollback aprovado; migrations 80-84 aplicadas. O ensaio gerou registro de ledger sem DDL persistida, representado pela migration noop 20260912200535.
- Testes Caixa: 53 aprovados; TypeScript e ESLint focado aprovados. Smoke PDF em preparacao.
- Banese: diagnostico GET isolado publicado no worker v99, validou pagamento com desconto no primeiro dia util apos domingo e feriado. Correcao de calendario e projecao em preparo.
- Proesc: duas composicoes sustentadas por prova preexistente de beneficio e data/valor da API; payload em preparo, ainda sem nova gravacao. Nao alegar composicao integral de todos os pagamentos.
- Publicacao somente do manifesto final confirmado; preservar alteracoes paralelas.

## Nova importação solicitada durante esta revisão

- O usuário retomou expressamente a importação das nove turmas, fornecendo XLS de 2024, 2025 e 2026. A preparação roda em paralelo; sua aplicação terá lote próprio após esta revisão.
- SQL bootstrap/financeiro 20260912220000-75 permanece arquivado em /tmp/proesc-turmas-conferencia-20260912/cancelled-draft; nao aplicar.
- Consultas API anteriores obtiveram 299 observacoes academicas e 20.917 linhas contabeis; nenhuma nova importacao foi gravada em producao.
- Consulta financeira continua pela API. Arquivos XLS servem para cadastro, status e vínculo de turma/polo; não substituem o histórico de cobranças Proesc.

## Base publicada

- PR 140: cc7a803e424448ec8a599d34aecbd46352f7359b, versao 4.8.46; Vercel concluida.
- Edge Proesc v5 e sincronizacao ativos: 346 vinculos, 204 pagos, 142 abertos, recebido 53813.57.
- Composicao completa dos encargos Proesc nao foi publicada em 4.8.46.
