# Lote ativo

## Lote: 2026-11-12-pix-duas-vias-copia-parceiro
Objetivo: destacar Pix Copia e Cola nas duas vias e permitir cópia no financeiro EAD do aluno com código oficial disponível e cobrança aberta.
Status: candidato 4.8.325 validado; backend aplicado; integração e publicação do site controladas por CI/PR.
Autorização: usuário aprovou a imagem do PDF e solicitou explicitamente atualizar em produção.
Manifesto explícito: `ai/operacao/registros/alteracoes/2026-11-12-pix-duas-vias-copia-parceiro.md`.
Base: main 4.8.323, a53f9990aaee88de07274a8d78a6fa54746ed093; snapshot isolado sem o candidato NFS-e paralelo.
Aceite: código integral e destacado nas duas vias; botão apenas em cobrança EAD aberta e não paga; autorização e histórico preservados.
Validação: dez testes PDF com typecheck, sete React, SQL isolado e contrato remoto, TypeScript, build e QR renderizados.
Limitações: sem navegador ou operação bancária real; conferência visual da tela e PDF autenticado permanece com o usuário.
