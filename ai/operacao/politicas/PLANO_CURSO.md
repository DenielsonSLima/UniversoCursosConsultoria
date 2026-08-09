# Plano de Curso técnico

Carregue esta política somente ao alterar Plano de Curso, vínculo docente/disciplina/turma ou sua emissão.

- O plano pertence ao vínculo canônico entre turma, disciplina e docente.
- O professor recebe somente disciplinas atualmente atribuídas com aulas datadas.
- Identidade, elegibilidade, datas, horários, carga, ordenação e paginação são derivados nas RPCs.
- RASCUNHO nunca é documento oficial para download ou impressão.
- A conclusão congela snapshot completo, revisão do modelo, instante e fingerprint SHA-256.
- Emissões posteriores usam o snapshot; prévia, impressão e download compartilham o mesmo Blob.
- Vínculo com plano não pode ser removido ou reatribuído silenciosamente.
- Aulas de plano concluído não podem ser alteradas.
- RPCs e triggers mantêm ordem única de locks.
- Realtime usa planos_curso; mudanças de elegibilidade usam Broadcast privado por professor e polo.
