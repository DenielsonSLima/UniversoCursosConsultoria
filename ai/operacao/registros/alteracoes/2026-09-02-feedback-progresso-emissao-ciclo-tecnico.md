# Feedback de progresso na emissão do ciclo técnico

Data: 2026-09-03
Estado: pronto para publicação; validação local concluída

## Objetivo

Evitar que o gestor veja uma área vazia durante os segundos necessários para
criar ou reutilizar os recebíveis, emitir os BolePix Banese e conferir seus
retornos. A espera passa a ter uma tela cheia informativa e acessível.

## Diagnóstico

- A captura entre 12:19:32 e 12:20:03 mostra cerca de 31 segundos de espera e,
  em seguida, o sucesso de 13 cobranças e 13 títulos.
- Durante a mutation, a atualização da linha financeira removia a prévia viva
  usada pelo wizard. Restava somente o fundo e o botão desabilitado.
- A Edge Function responde apenas na conclusão ou interrupção; portanto, ela não
  fornece percentual bancário confiável para uma barra determinada.

## Solução e contrato

- Antes da mutation, a prévia canônica é preservada em snapshot.
- Enquanto `pending`, o wizard inteiro é substituído por uma tela cheia com
  aluno, matrícula, ciclo, quantidade, total, tempo decorrido e barra animada.
- A tela explica as três etapas reais: preparar cobranças, emitir no Banese e
  conferir Pix, linha digitável e código de barras.
- A barra declara ser indeterminada; nenhum percentual, Nosso Número, Pix ou
  confirmação bancária é fabricado no frontend.
- Uma trava por `ref` impede dois envios no intervalo anterior ao rerender.
- Foco, `aria-busy`, região viva estável e redução de movimento foram preservados.
- O toast compartilhado passa a suportar `warning`, evitando falha de runtime
  quando a operação retorna interrupção segura ou prévia desatualizada.
- Nenhum adapter, POST, retry, payload, cálculo financeiro, banco, migration ou
  Edge Function foi alterado.

## Aceite

- A interface nunca fica vazia durante a emissão.
- O gestor sabe que a tentativa continua ativa e vê o tempo decorrido.
- Fechamento e Escape permanecem bloqueados durante a operação.
- Clique duplo inicia somente uma chamada e preserva o mesmo `requestId`.
- Ao terminar, o portal informa sucesso ou orientação segura de retomada.

## Validação

- `deno test --allow-read` nos cinco contratos do ciclo técnico: 40 aprovados.
- ESLint focado: aprovado.
- `npx tsc --noEmit`: aprovado.
- `npm run check:file-lines`: aprovado.
- Build de produção aprovado com 3.960 módulos transformados.
- Revisão independente em três frentes concluída sem achado bloqueador.
- CI, Preview e produção serão anexados após a publicação.
- Nenhum título Banese real foi criado apenas para testar esta alteração visual.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualIssuanceProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `modules/gestor/parceiros/components/shared/ToastNotification.tsx`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-02-feedback-progresso-emissao-ciclo-tecnico.md`

Total: 11 arquivos
