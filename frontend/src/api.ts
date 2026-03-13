import type { Model, Message, Chat, ChatMessage } from './types';

const API_BASE = '';

// Auth APIs
export const authApi = {
  async me(): Promise<{ logged_in: boolean; username?: string }> {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    return res.json();
  },

  async login(username: string, password: string): Promise<{ username: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },

  async register(username: string, password: string): Promise<{ username: string }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },
};

// Models APIs
export const modelsApi = {
  async getModels(): Promise<{ models: Model[] }> {
    const res = await fetch(`${API_BASE}/api/models`, { credentials: 'include' });
    return res.json();
  },

  async addModel(data: {
    display_name: string;
    model_id: string;
    provider: string;
    base_url?: string;
    api_key?: string;
  }): Promise<Model> {
    const res = await fetch(`${API_BASE}/api/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add model');
    }
    return res.json();
  },

  async updateModel(id: number, data: {
    display_name?: string;
    model_id?: string;
    base_url?: string;
    api_key?: string;
  }): Promise<void> {
    const res = await fetch(`${API_BASE}/api/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to update model');
  },

  async deleteModel(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/api/models/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete model');
  },
};

// Document APIs
export const documentsApi = {
  async uploadDocument(file: File): Promise<{ document_id: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE}/api/documents/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to upload document');
    }
    
    return res.json();
  },
};

// Keys APIs
export const keysApi = {
  async saveKey(provider: string, api_key: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, api_key }),
    });
    if (!res.ok) throw new Error('Failed to save key');
  },

  async deleteKey(provider: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/keys/${provider}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete key');
  },
};

// Chat APIs
export const chatApi = {
  sendMessage: async (
    model: { custom_model_id: number },
    messages: Message[],
    options: { temperature?: number; max_tokens?: number; enable_thinking?: boolean; chat_id?: number } = {}
  ): Promise<ReadableStream> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_model_id: model.custom_model_id,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1024,
        enable_thinking: options.enable_thinking || false,
        chat_id: options.chat_id,
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.body!;
  },

  getChats: async (modelId?: number): Promise<Chat[]> => {
    const url = modelId ? `/api/chats?model_id=${modelId}` : '/api/chats';
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch chats');
    return response.json();
  },

  createChat: async (modelId: number, title?: string): Promise<{ id: number; title: string }> => {
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, title: title || 'New Chat' }),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to create chat');
    return response.json();
  },

  getChatMessages: async (chatId: number): Promise<ChatMessage[]> => {
    const response = await fetch(`/api/chats/${chatId}/messages`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch chat messages');
    return response.json();
  },

  updateChatTitle: async (chatId: number, title: string): Promise<void> => {
    const response = await fetch(`/api/chats/${chatId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to update chat title');
  },

  deleteChat: async (chatId: number): Promise<void> => {
    const response = await fetch(`/api/chats/${chatId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to delete chat');
  },
};

// File upload API (placeholder for future implementation)
export const filesApi = {
  async upload(file: File): Promise<{ id: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },
};
