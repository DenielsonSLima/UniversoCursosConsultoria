# Testes e Validação

Status: CANÔNICO. Última revisão: 2026-08-12.

## Princípio

Testes-fonte, contratos Supabase e migrations não são lixo de teste. Eles são
parte do produto, protegem regras críticas e devem permanecer versionados.

O objetivo é executar o menor teste que exercite o fluxo alterado antes de
usar validações amplas.

## Onde os testes vivem

| Local | Finalidade |
| --- | --- |
| modules/ | Testes próximos de componentes, serviços, queries e contratos de módulo. |
| supabase/functions/ | Testes de Edge Functions, gateways e integrações. |
| supabase/tests/ | Contratos de migrations, RPCs, RLS e fluxos de banco. |
| scripts/test-*.mjs | Runners e verificações de fluxos específicos. |
| .github/workflows/ | Gatilhos de qualidade e versão em CI. |

## Comandos comuns

| Objetivo | Comando |
| --- | --- |
| Verificar versão e histórico | npm run check:version |
| Build web completo | npm run build |
| Lint TypeScript e React | npm run lint |
| Operação de agentes | npm run test:agent-operations |
| Boleto Banese no frontend | npm run test:banese-ui |
| Conciliação Banese | npm run test:banese-reconciliation |
| Autenticação do portal | npm run test:portal-auth |
| Acesso de gestor | npm run test:gestor-access |

Outros runners estão catalogados em [scripts/README.md](../../../scripts/README.md).
Para Deno, execute apenas os arquivos de teste afetados com as permissões
mínimas necessárias.

## Sequência recomendada

1. Confirmar o fluxo e seu contrato.
2. Executar o teste focado.
3. Aplicar a alteração.
4. Reexecutar o teste focado.
5. Fazer smoke visual ou operacional quando a sessão e o ambiente permitirem.
6. Executar TypeScript, lint ou build somente quando o risco de integração
   justificar.

## Regras de segurança

- Não criar boleto, cobrança, matrícula, mensagem ou documento real apenas
  para teste.
- Não usar CPF, telefone, e-mail ou planilha de aluno como fixture.
- Não apagar testes porque estão antigos sem verificar cobertura e referências.
- Teste que altera produção exige autorização explícita e deve ter reversão
  prevista.

## Smoke indisponível

Se o navegador autenticado não estiver disponível, registre a pendência.
Contratos e testes automatizados não substituem a confirmação visual de um
fluxo interativo, mas também não justificam criar dados reais.

