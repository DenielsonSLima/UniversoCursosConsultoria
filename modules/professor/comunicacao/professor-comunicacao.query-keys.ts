export const professorComunicacaoQueryKeys = {
  categories: ['comunicacao-categorias'] as const,
  chats: (professorId: string) => ['professor-chats', professorId] as const,
  messages: (chatId: string) => ['chat-messages', chatId] as const,
};
