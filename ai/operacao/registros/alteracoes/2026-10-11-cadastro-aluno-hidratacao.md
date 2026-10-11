# Cadastro completo e cache por aluno

Entrega independente da revisão solicitada com três agentes. O cadastro podia usar o resumo da busca como formulário completo e enviar ausências como null/false. A edição passa a aguardar o GET validado por id e tipo Aluno. Erro permite tentar novamente; atualizações da consulta preservam o rascunho iniciado.

O salvamento recusa dados de outra identidade. Um UPDATE atrasado de A atualiza o cache de A mesmo após selecionar B, preservando o formulário de B.

## Aceite e validação

- Resumo fresco em cache ainda exige leitura completa antes de montar ou salvar o formulário.
- Erro de leitura mantém o formulário bloqueado e permite nova tentativa.
- Rascunho iniciado permanece íntegro durante refetch pendente ou falho.
- Troca de aluno exige a carga do novo cadastro; resposta atrasada atualiza somente o cache correspondente.
- Oito testes focados com QueryObserver/MutationObserver reais e lint focado passaram.
- Smoke Safari com ReactDOM, TanStack Query e formulário reais passou nos quatro cenários acima, usando API controlada e identidades sintéticas. Nenhum cadastro real foi salvo.
- Revisão cruzada aprovada; CI do head exato e Preview devem passar antes da promoção. Smoke autenticado com API real permanece pendente.

## Manifesto explícito

- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.tsx`
- `modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetalhes.hydration.test.mjs`
- `.github/workflows/student-details-hydration.yml`
- `ai/operacao/registros/alteracoes/2026-10-11-cadastro-aluno-hidratacao.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos. Versão 4.8.212, composta sobre a entrega 4.8.211; cada domínio conserva seu manifesto e sua PR.

## Entrega e limites

Sequência: boletim 4.8.210, recuperação 4.8.211, cadastro 4.8.212. Esta etapa não contém migration, alteração de Auth ou operação financeira. A proteção ocorre no fluxo existente do formulário e mantém o design aprovado. Produção depende de pedido explícito e dos critérios acima confirmados.
