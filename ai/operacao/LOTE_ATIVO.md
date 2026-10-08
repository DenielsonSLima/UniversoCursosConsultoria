# Lote ativo

## Lote: 2026-10-08-aluno-banese-identidade-desconto

Estado: implementação e validação da entrega 4.8.184; publicação em produção autorizada pelo usuário em 08/10/2026.
Objetivo/aceite: aluno autenticado por matrícula abre BolePix, boleto PDF e carnê próprios; o financeiro exibe desconto bancário confirmado e valor pagável dentro da validade.
Cálculos: exclusivamente backend/RPC; frontend recebe valores canônicos. Valor nominal, termos do título e histórico de pagamentos preservados.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-aluno-banese-identidade-desconto.md`.
Revisão: três agentes, com frentes de identidade, financeiro e revisão independente.
Validação: cadastro e termos bancários reais conferidos por consulta restrita; testes de regressão e CI em preparação.
Limitação: sessão autenticada do aluno não está disponível no ambiente; smoke de navegador deve ser distinguido dos testes contratuais.
Dados: lote de software; sem cancelamento, reemissão ou alteração de valores dos títulos.

## Entregas anteriores preservadas

Contrato 4.8.183: PR #276; registro `ai/operacao/registros/alteracoes/2026-10-07-contrato-posicoes-qr-assinaturas.md`.
Financeiro 4.8.182: PR #275; registro `ai/operacao/registros/alteracoes/2026-10-07-aviso-c2-antes-do-assistente.md`.
Restauração T46: PR #274; registro `ai/operacao/registros/alteracoes/2026-10-07-restauracao-c1-t46.md`. Não reaplicada neste lote.
