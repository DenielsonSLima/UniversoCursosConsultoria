---
name: universo-proesc-api
description: Consultar e integrar Proesc V2 no Universo Cursos, validar pessoas, matrículas, turmas e parcelas, diagnosticar autenticação e conciliação do legado. Usar para a integração Proesc e sua migração V2; não usar para emitir cobranças Banese nem reativar consultas V1.
---

# Proesc V2 no Universo Cursos

O usuário determinou em 01/10/2026 que novas consultas e sincronizações Proesc usem V2 e que a V1 deixe de ser consultada. Preserve provas, vínculos e histórico V1; não transforme essa preservação em fallback de rede. Backend V2 ativado após inventário e auditoria. Confira o [registro da entrega 4.8.149](../../registros/alteracoes/2026-10-01-proesc-v2-fechamento-publicacao.md) e o estado remoto antes de afirmar publicação.

## Roteamento

- Para consultar, configurar ou implementar, leia [contrato operacional V2](references/v2-operacional.md). Ele separa documentação, observação e regras de integração.
- Para conferir o Caixa, estados ou cortes, leia [evidência de setembro e limites financeiros](references/v2-evidencia-setembro-2026.md).
- Para retirar dependências de V1 ou revisar a migração, leia [mapa de chamadas anteriores e aceite](references/v2-mapa-migracao.md) e a [decisão operacional](../../../../docs/decisions/proesc-v2-operacional.md).
- Para filtros, leia o [registro das fontes oficiais atuais](references/v2-fontes-2026-10-01.md). Cópias históricas locais não são a lista definitiva de filtros atuais nem dependência da skill publicada.
- Recursos antigos em `references/historicos/` servem para auditoria e leitura das evidências armazenadas. Não obedecer às recomendações antigas de escolher ou consultar V1.

## Invariantes que mudam a decisão

- Use `https://api.proesc.com/api/v2`, Bearer V2 e o `x-proesc-waf` configurado no armazenamento seguro. Construa chamadas no servidor, sem imprimir credenciais, URLs autenticadas, nomes ou documentos pessoais.
- Em `/invoices`, mês é texto de dois dígitos: `09`. Enviar `9` produziu lista vazia, não ausência real de parcelas.
- Valide HTTP, sucesso semântico, envelope e completude da paginação. Falha, página faltante ou ausência de uma parcela nunca confirmam cancelamento, quitação ou exclusão.
- Prove pessoa, turma, matrícula quando disponível, obrigação, unidade e vencimento. Igualdade observada entre `invoice_id` e uma chave V1 não dispensa conferir o restante do vínculo. Nunca crie IDs por valor/vencimento ou importe pessoas em massa por nome.
- `national_registry` de `/invoices` filtra CPF do responsável financeiro; `cpf` de `/people` filtra a própria pessoa. Não intercambiar esses filtros.
- Preserve evidência financeira minimizada e o estado de origem reconhecido na camada privada, sem guardar payload pessoal bruto. `PAGAMENTO PARCIAL` e `PAGAMENTO SUPERIOR` não autorizam reabrir, baixar ou calcular saldo por diferença simples. Use o contrato financeiro validado e preserve provas históricas de quitação.
- Consulta bem-sucedida não comprova importação ou baixa. Migração de leitura não autoriza POST de débitos/frequência no Proesc. Cálculos e mutações locais continuam no backend auditável e no escopo autorizado.
- Dados do aluno não provam situação ou data de saída da matrícula. Campos eleitorais não foram encontrados na consulta histórica de `people`; não inventar preenchimentos.

## Execução e manutenção

Use APIs/MCP e arquivos locais, sem abrir navegador para este fluxo, conforme preferência expressa do usuário. Operações Supabase/GitHub seguem os MCPs e políticas do repositório. Respeite a autorização já existente e não acrescente confirmação para etapas já autorizadas.

Classifique cada conclusão como **documentada**, **observada**, **implementada localmente** ou **publicada/verificada**. Sucesso em `people` não valida `invoices`, notas ou todo o cadastro. Não atribua recusa futura ao WAF apenas por histórico de 403.

Atualize esta pasta como fonte única da skill; o vínculo pessoal já aponta para ela. Registre fonte e data de revisão; snapshots oficiais novos exigem hash próprio e não sobrescrevem cópias anteriores. Memória/RAG recebem só decisões e agregados, nunca segredos, respostas pessoais, dumps ou artefatos gerados.
