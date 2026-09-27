# Lote ativo

Estado: VALIDADO — PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA

## Lote: 2026-09-27-matricula-tecnica-ativa-cadastro-minimo

Manifesto explícito: `ai/operacao/registros/alteracoes/2026-09-27-matricula-tecnica-ativa-cadastro-minimo.md`

- Matrícula regular em turma técnica `EM_ANDAMENTO` deve concluir a mesma transação como `ATIVO`.
- Turma ainda não iniciada mantém o vínculo `PENDENTE` até o início.
- Documentos, checklist, pagamento e emissão de boleto não bloqueiam o status acadêmico.
- O ingresso exige cadastro pessoal e endereço completos; mãe e pai são obrigatórios. Ensino Médio é informativo, não bloqueia o vínculo e aceita a opção `EJA`.
- Interface diferencia status cadastral, pendência acadêmica e estados de saída, além de atualizar os cards após o vínculo.
- Produção autorizada explicitamente pelo usuário; migration aplicada e validada, publicar a versão 4.8.114 e confirmar o smoke de interface.
