export interface User {
  username: string;
}

export interface Model {
  id: number;
  display_name: string;
  model_id: string;
  provider: string;
  base_url?: string;
  has_api_key: boolean;
}

export interface Chat {
  id: number;
  user_id: number;
  model_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  model_name: string;
  provider: string;
}

export interface ChatMessage {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  created_at: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  files?: FileAttachment[];
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
}

export interface SharedEndpoint {
  label: string;
  models: string[];
  has_key: boolean;
}

export interface EndpointsResponse {
  shared: Record<string, SharedEndpoint>;
  custom: Model[];
  defaults: {
    endpoint: string;
    model: string;
  };
}
