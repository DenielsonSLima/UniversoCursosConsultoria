# CHANGELOG — Histórico de Versões do Padrão

> Toda mudança de regra ou padrão deve ser registrada aqui.
> Sem registro, a mudança não existe oficialmente.

---

## Formato de Entrada

```
## [versão] — YYYY-MM-DD
### Adicionado | Modificado | Removido | Correção
- [capítulo afetado] descrição da mudança
- Aprovado por: [nome/cargo ou "consenso sênior"]
- Motivação: [o que aconteceu que gerou essa mudança]
```

---

## [2.0.0] — 2024-01 (versão atual)

### Adicionado
- [Cap. 3] Self-Annealing: protocolo de melhoria contínua por falhas
- [Cap. 4] Princípios Universais tech-agnostic (SRP, DRY, Cache, etc.)
- [SKILL.md] Protocolo de uso por tipo de agente (LLM / Humano / Squad)
- [SKILL.md] Protocolo de conflito de regras
- [Cap. 15] Checklist dividido em 10 blocos com comandos verificáveis
- [Cap. 16] Comunicação entre Agentes de IA
- [Cap. 17] CI/CD e Automação de Padrões
- GLOSSARIO.md, AMBIENTE.md, FAQ.md, EXCECAO.md
- modulo-exemplo/ com código completo de referência
- ADR — Architecture Decision Records

### Modificado
- [Cap. 1] Diagrama de arquitetura com Mermaid
- [SUMARIO.md] Reorganizado com trilhas de leitura por perfil
- [COMECE-AQUI.md] Trilhas por objetivo

### Aprovado por
- Grupo de Desenvolvedores Sênior

---

## [1.1.0] — versão anterior (skill-v1)
- Estrutura inicial de 12 capítulos técnicos
- Regras de ouro definidas
- Checklist básico

---

## Como Registrar uma Mudança

1. Identifique o tipo: Adicionado / Modificado / Removido / Correção
2. Descreva o que mudou e em qual capítulo
3. Registre o motivo (bug, melhoria, novo padrão)
4. Registre quem aprovou
5. Atualize o número de versão seguindo Semantic Versioning:
   - `MAJOR` (X.0.0): mudança que quebra comportamento existente
   - `MINOR` (1.X.0): nova regra ou capítulo sem quebrar o anterior
   - `PATCH` (1.0.X): correção de texto, exemplo ou typo
