import { create } from 'zustand';
import type { User, Model, Message, Chat } from './types';

interface AppState {
  user: User | null;
  models: Model[];
  chats: Chat[];
  activeModelId: number | null;
  activeChatId: number | null;
  messages: Message[];
  
  setUser: (user: User | null) => void;
  setModels: (models: Model[]) => void;
  addModel: (model: Model) => void;
  removeModel: (id: number) => void;
  setActiveModel: (id: number | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  
  // Chat history methods
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  removeChat: (chatId: number) => void;
  setActiveChat: (chatId: number | null) => void;
  loadChatMessages: (messages: Message[]) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  models: [],
  chats: [],
  activeModelId: null,
  activeChatId: null,
  messages: [],
  
  setUser: (user) => set({ user }),
  setModels: (models) => set({ models }),
  addModel: (model) => set((state) => ({ models: [...state.models, model] })),
  removeModel: (id: number) => set((state) => ({ models: state.models.filter((m) => m.id !== id) })),
  setActiveModel: (id: number | null) => set({ activeModelId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  
  // Chat history methods
  setChats: (chats: Chat[]) => set({ chats }),
  addChat: (chat: Chat) => set((state) => ({ chats: [...state.chats, chat] })),
  removeChat: (chatId: number) => set((state) => ({ 
    chats: state.chats.filter((c) => c.id !== chatId),
    activeChatId: state.activeChatId === chatId ? null : state.activeChatId
  })),
  setActiveChat: (chatId: number | null) => set({ activeChatId: chatId }),
  loadChatMessages: (messages: Message[]) => set({ messages }),
}));
