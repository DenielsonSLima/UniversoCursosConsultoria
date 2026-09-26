# Revisão do PDV e de Outros Créditos

Estado: REVISADO — correção de leitura aplicada no backend; pacote GitHub 4.8.102 / revisão 111.
Base: `623373c1d1aea53e914d698dae9113bdf38b1c69`; preserva a entrega paralela 4.8.101.

## Escopo e achado

Revisão da entrega 4.8.100: emissão idempotente, validação de polo, autorização, classificação da lista/resumo, apresentação Pix/boleto, estados finais e consultas do Caixa. Não constitui auditoria de todo o histórico do sistema.

A lista de Outros Créditos já excluía cronogramas e tipos acadêmicos, mas o reader do PDV aceitava um título com esses marcadores caso matrícula/turma estivessem vazias. O teste reproduziu a aceitação indevida antes do patch. A projeção agora inclui origem_cronograma_id e a guarda rejeita cronograma, MATRÍCULA/PARCELA/REMATRÍCULA/DEPENDÊNCIA pelas respectivas constantes. Aluno continua permitido como pagador de crédito avulso.

## Manifesto explícito

- `supabase/functions/gestor-other-credit-payment/payment-reader.ts`
- `supabase/functions/gestor-other-credit-payment/payment-reader.test.ts`
- `ai/operacao/registros/alteracoes/2026-09-26-outros-creditos-pdv.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-26-revisao-pdv-outros-creditos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

Total: 8 arquivos. Nenhuma migration ou mutação de recebível.

## Validação e entrega

- Regressão reproduzida: 13 testes passaram e 1 falhou antes do patch.
- Após o patch: 18 testes Deno de leitura/capacidades e 25 testes de interface/Caixa passaram.
- Leitura de código: JWT, aba e polo continuam exigidos; replay idempotente e dados oficiais do BolePix preservados.
- `gestor-other-credit-payment` v2 ACTIVE, verify_jwt=true; readback dos 8 arquivos idêntico ao pacote. Somente payment-reader.ts alterado sobre o bundle v1.
- Histórico 4.8.100 encerrado com o smoke autenticado de produção anteriormente concluído no Safari.
- Nenhuma nova cobrança emitida e nenhuma baixa financeira criada para testar; liquidação bancária ponta a ponta não foi exercitada.
