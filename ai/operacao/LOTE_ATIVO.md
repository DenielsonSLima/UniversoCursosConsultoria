# Lote ativo

## Lote: 2026-10-08-ead-modelo-fiel

Estado: validação da entrega 4.8.187; correção EAD e publicação autorizadas pelo usuário.
Objetivo/aceite: emissão EAD respeita o modelo salvo, com tabela, fontes, imagens e posições iguais ao editor.
Causa: renderizadores separados; o patch anterior desviou a tabela EAD para texto genérico.
Escopo: EAD; dados, cargas coerentes, status e páginas vêm do backend. Outras modalidades preservadas.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-ead-modelo-fiel.md`.
Revisão: três agentes, responsáveis por backend, interface e paridade visual independente.
Dados: completar somente a tabela dos dois certificados revisados, preservando código, datas e contador.
Validação: SQL real, editor e emissão com mesmo modelo/dados, prévia Secretaria, texto PDF e frente/verso; CI/Preview antes da publicação.
Limitação: não há sessão autenticada real; ensaio usa identidade sintética e configuração real inventariada.

## Entregas anteriores preservadas

Grade EAD 4.8.186: PR #279; seis módulos nos dois certificados, corrigindo ausência de conteúdo. A fidelidade da tabela é corrigida neste lote.
Emissão automática EAD 4.8.185: PR #278; dois certificados liberados sem registro técnico.
Financeiro do aluno 4.8.184: PR #277; identidade Banese e desconto canônico corrigidos.
