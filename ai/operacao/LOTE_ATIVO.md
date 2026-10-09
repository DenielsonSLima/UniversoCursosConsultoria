# Lote ativo

## Lote: 2026-10-08-ead-identidade-pdf

Estado: validação da entrega 4.8.188; continuidade das correções EAD autorizadas.
Aceite: identificar documento por aluno e preservar o certificado completo ao baixar/imprimir.
Causas: CPF cru, tipo omitido em consultas e fundo CSS descartado pela impressão do navegador.
Escopo: EAD; identidade congelada nas novas emissões, apresentação e PDF do modelo salvo.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-10-08-ead-identidade-pdf.md`.
PDF: um Blob para prévia, download e impressão; texto/tabela vetoriais e assets originais isolados.
Cadastro: CIN/CNI declarado recebe rótulo CIN; tipos legados ambíguos não são convertidos.
Validação: SQL, projeções reais, texto PDF, recursos e comparação visual com modelo cadastrado.
Limitação: sem sessão autenticada real; identidade sintética nos ensaios do fluxo e dos artefatos.
Publicação: revisão independente, CI e Preview antes de migration e produção.

## Entregas anteriores preservadas

4.8.187: modelo salvo e tabela EAD; PR #280.
4.8.186: grade EAD; PR #279. 4.8.185: emissão automática EAD; PR #278.
4.8.184: identidade Banese e desconto canônico; PR #277.
