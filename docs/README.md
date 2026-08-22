# Documentação do Universo Cursos e Consultoria

Status: CANÔNICO para orientação humana. Última revisão: 2026-08-12.

Esta pasta explica como o sistema é organizado, configurado e operado. Ela não
substitui o código, as migrations, as políticas de segurança nem os registros
de publicação.

## Comece por aqui

- [Mapa do sistema](sistema/README.md): índice por módulo e por tipo de tarefa.
- [Visão geral](sistema/VISAO_GERAL.md): arquivo único que explica a arquitetura
  completa, os portais, o backend e as integrações.
- [Operação](sistema/operacao/): ambiente local, testes, publicação e limpeza.
- [Integrações](sistema/integracoes/): Supabase, pagamentos, WhatsApp e push.

## Onde cada tipo de informação deve ficar

| Necessidade | Fonte correta |
| --- | --- |
| Como o produto funciona | docs/sistema/ |
| Regras de agentes, lotes e publicação | ai/operacao/ |
| Políticas financeiras, Supabase, interface e PDFs | ai/operacao/politicas/ |
| Decisões arquiteturais duráveis | docs/decisions/ |
| Histórico de entregas | ai/operacao/registros/ |
| Versão publicada | internal/versioning/system-version.json |
| Código e contratos executáveis | modules/, supabase/, scripts/ |

## Convenções

- Todo documento indica seu status: CANÔNICO, LEGADO ou HISTÓRICO.
- Nunca registrar senhas, tokens, CPF, dados de alunos, chaves de banco ou
  payloads reais de homologação.
- O código e os contratos executáveis têm precedência quando esta documentação
  ficar desatualizada.
- Documentos históricos não devem ser usados como instrução operacional sem
  revisão.

