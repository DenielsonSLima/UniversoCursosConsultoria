# Lote ativo

Estado: VALIDADO — PUBLICAÇÃO DA IDENTIFICAÇÃO DO CUPOM

## Lote: 2026-09-26-pdv-identificacao-cupom

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-26-pdv-identificacao-cupom.md`

- Base 4.8.109 publicada no PR199 e encerrada no PR200. Usuário confirmou o cupom real e pediu documento pontuado e matrícula.
- 4.8.110 / revisão 119: identidade vem da RPC; matrícula cadastral do aluno não associa o avulso a curso. Snapshot financeiro permanece imutável.
- Registro privado de identidade por recibo; antigos exigem prova. CPF/CNPJ permanecem mascarados. Cliente confere conteúdo do trabalho antes de imprimir o Blob preparado.
- 30 testes UI/PDF/cache/identidade, 11 checks SQL, TypeScript, ESLint e build aprovados. PDFs 58/80 mm inspecionados. Migration aplicada no ledger `20260927025500`; RPC autenticada confirmou documento e matrícula no recibo existente sem alterar o financeiro.
- Manifesto de 17 arquivos no registro; preservar a compactação paralela publicada em `3089add1a3b957856d69176dcf6b212a3d095825`. Publicação e implantação rastreadas no PR da 4.8.110.
- Não emitir, cancelar, pagar ou imprimir para testes. Impressão silenciosa depende de homologação física; artefatos em tmp ficam fora da publicação.
