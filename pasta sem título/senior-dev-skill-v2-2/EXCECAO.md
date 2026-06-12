# EXCEÇÕES AO PADRÃO

> Toda exceção deve ser documentada aqui. Exceção não documentada = violação.
> Uma exceção aprovada é temporária e tem prazo para regularização.

---

## Como Registrar uma Exceção

Copie o template abaixo, preencha todos os campos e abra PR.
A exceção só entra em vigor após aprovação de pelo menos 1 dev sênior.

---

## Template de Exceção

```markdown
### EXC-[número] — [título curto]

| Campo           | Valor                                      |
|-----------------|--------------------------------------------|
| Data            | YYYY-MM-DD                                 |
| Solicitado por  | [nome / squad]                             |
| Aprovado por    | [nome sênior]                              |
| Regra violada   | Regra #X — [descrição da regra]            |
| Capítulo        | Cap. XX — [nome do capítulo]               |
| Prazo           | YYYY-MM-DD (data para regularizar)         |
| Status          | Ativo / Regularizado / Cancelado           |

**Descrição do contexto:**
[Por que a regra não pode ser seguida neste caso específico?]

**Risco técnico aceito:**
[Que problema pode surgir por quebrar esta regra?]

**Medidas compensatórias:**
[O que foi feito para mitigar o risco?]

**Plano de regularização:**
[Como e quando o código voltará ao padrão?]
```

---

## Exceções Ativas

> Nenhuma exceção ativa no momento.

---

## Exceções Regularizadas

> Nenhuma exceção regularizada ainda.

---

## Regras Sobre Exceções

1. **Máximo 3 exceções ativas por squad ao mesmo tempo.** Se chegou a 3, algo está errado com o processo ou com a regra — abra discussão.

2. **Toda exceção tem prazo.** Sem prazo definido, o PR não é aprovado.

3. **Exceção que vira padrão é candidata a mudar a regra.** Se a mesma exceção aparece 3+ vezes, a regra pode estar errada — proponha revisão via CHANGELOG.

4. **Agentes de IA nunca aprovam exceções.** Exceções exigem julgamento humano e responsabilidade.

5. **Exceção vencida sem regularização = débito técnico registrado.** Entra no backlog do squad com prioridade.
