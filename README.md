# Universo Cursos e Consultoria

Portal acadêmico e administrativo da Universo Cursos e Consultoria.

## Documentação do sistema

O guia técnico e operacional por módulo está em [docs/README.md](docs/README.md).

## Run Locally

**Pré-requisito:** Node.js


1. Instale as dependências:
   `npm install`
2. Copie apenas as variáveis públicas descritas em `.env.example` para `.env.local`.
   Segredos e chaves privadas devem permanecer no backend/Vault e nunca usar o
   prefixo `VITE_`.
3. Execute o ambiente local:
   `npm run dev`
