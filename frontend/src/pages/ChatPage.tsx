import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { chatApi, documentsApi } from '../api';
import type { Message, Chat } from '../types';

export default function ChatPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();

  const getPlatformDisplayName = (provider: string) => {
    const platformNames: { [key: string]: string } = {
      'hf_router': 'Hugging Face',
      'nvidia': 'NVIDIA NGC',
      'deh': 'Dell Enterprise Hub',
      'custom': 'Custom Endpoint'
    };
    return platformNames[provider] || provider;
  };
  const { 
    models, 
    messages, 
    setMessages, 
    clearMessages,
    chats,
    activeChatId,
    setActiveChat,
    setChats,
    loadChatMessages
  } = useStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [enableThinking, setEnableThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [healthChecking, setHealthChecking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const model = models.find((m) => m.id === Number(modelId));

  useEffect(() => {
    clearMessages();
    setActiveChat(null);
  }, [modelId, clearMessages, setActiveChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history for this model
  useEffect(() => {
    if (model) {
      chatApi.getChats(model.id).then(setChats).catch(console.error);
    }
  }, [model, setChats]);

  // Chat history functions
  const createNewChat = async () => {
    if (!model) return;
    try {
      const newChat = await chatApi.createChat(model.id);
      const chatWithModel: Chat = {
        id: newChat.id,
        user_id: 0, // Not needed for frontend
        model_id: model.id,
        title: newChat.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        model_name: model.display_name,
        provider: model.provider
      };
      setChats([chatWithModel, ...chats]);
      setActiveChat(newChat.id);
      clearMessages();
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  const loadChat = async (chatId: number) => {
    try {
      const chatMessages = await chatApi.getChatMessages(chatId);
      loadChatMessages(chatMessages.map(m => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning
      })));
      setActiveChat(chatId);
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  const deleteChat = async (chatId: number) => {
    try {
      await chatApi.deleteChat(chatId);
      setChats(chats.filter(c => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChat(null);
        clearMessages();
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await documentsApi.uploadDocument(file);
      setUploadedDocs([...uploadedDocs, result.filename]);
      alert(result.message);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !model || sending) return;

    // Create new chat if none exists
    let currentChatId = activeChatId;
    if (!currentChatId && chats.length < 6) {
      const newChat = await chatApi.createChat(model.id);
      const chatWithModel: Chat = {
        id: newChat.id,
        user_id: 0,
        model_id: model.id,
        title: newChat.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        model_name: model.display_name,
        provider: model.provider
      };
      setChats([chatWithModel, ...chats]);
      currentChatId = newChat.id;
      setActiveChat(newChat.id);
    }

    const userMessage: Message = { role: 'user', content: input.trim() };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setSending(true);

    try {
      const stream = await chatApi.sendMessage(
        { custom_model_id: model.id },
        currentMessages,
        { temperature, max_tokens: maxTokens, enable_thinking: enableThinking, chat_id: currentChatId || undefined }
      );

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';

      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const chunk = JSON.parse(raw);
            if (chunk.error) {
              throw new Error(chunk.error);
            }
            if (chunk.reasoning) fullReasoning += chunk.reasoning;
            if (chunk.content) fullContent += chunk.content;

            // Update messages with accumulated content
            setMessages([
              ...currentMessages,
              { role: 'assistant', content: fullContent, reasoning: fullReasoning },
            ]);
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages([
        ...currentMessages,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleHealthCheck = async () => {
    if (!model || healthChecking) return;

    setHealthChecking(true);
    try {
      const response = await fetch(`/api/models/${model.id}/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Health check failed');
      }

      const result = await response.json();
      
      const statusIcon = result.status === 'healthy' ? '✅' : 
                        result.status === 'warning' ? '⚠️' : '❌';
      
      alert(`${statusIcon} Model Health Check\n\nStatus: ${result.status.toUpperCase()}\nResponse Time: ${result.response_time || 'N/A'}\n\n${result.message}`);
    } catch (error) {
      console.error('Health check error:', error);
      alert('❌ Health check failed. Please try again.');
    } finally {
      setHealthChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!model) {
    return (
      <div className="flex items-center justify-center h-screen bg-chat-bg text-chat-text">
        <div>
          <p className="text-lg mb-4">Model not found</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-chat-accent text-white rounded-lg hover:bg-chat-accent-hover"
          >
            Back to Models
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-chat-bg text-chat-text">
      {/* Left Sidebar */}
      <div className="w-64 bg-chat-sidebar border-r border-chat-border flex flex-col">
        <div className="p-4 border-b border-chat-border">
          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-2 text-sm border border-chat-border rounded-lg hover:border-chat-accent transition"
          >
            ← Back to Models
          </button>
        </div>

        <div className="p-4 border-b border-chat-border">
          <button
            onClick={createNewChat}
            disabled={chats.length >= 6}
            className={`w-full px-4 py-2 text-sm rounded-lg transition ${
              chats.length >= 6
                ? 'bg-chat-border text-chat-muted cursor-not-allowed'
                : 'bg-chat-accent text-white hover:bg-chat-accent-hover'
            }`}
          >
            + New Chat {chats.length >= 6 && '(6/6)'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-chat-muted uppercase mb-2">Past Conversations</p>
          <div className="space-y-1">
            {chats.length === 0 ? (
              <p className="text-sm text-chat-muted">No saved chats yet</p>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`group p-2 rounded cursor-pointer text-sm ${
                    activeChatId === chat.id
                      ? 'bg-chat-accent text-white'
                      : 'hover:bg-chat-card'
                  }`}
                  onClick={() => loadChat(chat.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate flex-1">{chat.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 px-1"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs opacity-70">
                    {new Date(chat.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-chat-border space-y-3">
          <div>
            <label className="text-xs text-chat-muted block mb-1">Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-chat-muted block mb-1">Max Tokens</label>
            <input
              type="number"
              min="64"
              max="8192"
              step="64"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-chat-muted">Enable Thinking</span>
            <input
              type="checkbox"
              checked={enableThinking}
              onChange={(e) => setEnableThinking(e.target.checked)}
              className="w-4 h-4"
            />
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-chat-border bg-chat-sidebar">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">{model.display_name}</h1>
              <p className="text-sm text-chat-muted">{getPlatformDisplayName(model.provider)} · {model.model_id}</p>
            </div>
            <button
              onClick={handleHealthCheck}
              disabled={healthChecking}
              className="px-3 py-1 text-sm border border-chat-border rounded-lg hover:border-chat-accent transition disabled:opacity-50 disabled:cursor-not-allowed bg-chat-card text-chat-text"
              title="Check model health and connectivity"
            >
              {healthChecking ? 'Checking...' : 'Health Check'}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-chat-muted">
              <div className="text-6xl mb-4">🤖</div>
              <p className="text-lg">Start a conversation</p>
              <p className="text-sm">Type a message below to begin</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    AI
                  </div>
                )}
                <div className="max-w-2xl">
                  {msg.reasoning && (
                    <div className="mb-2 p-3 bg-green-900/20 border border-green-700/30 rounded-lg text-sm text-green-400">
                      <p className="font-semibold mb-1">🧠 Thinking:</p>
                      <p className="whitespace-pre-wrap">{msg.reasoning}</p>
                    </div>
                  )}
                  <div
                    className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-chat-user-bubble'
                        : 'bg-chat-asst-bubble border border-chat-border'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-chat-accent flex items-center justify-center text-sm font-bold flex-shrink-0">
                    U
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Uploaded Documents */}
        {uploadedDocs.length > 0 && (
          <div className="px-6 py-3 bg-green-900/20 border-t border-green-700/30">
            <p className="text-sm text-green-400 mb-2">📄 Uploaded documents:</p>
            <div className="flex flex-wrap gap-2">
              {uploadedDocs.map((doc, idx) => (
                <span key={idx} className="px-2 py-1 bg-green-900/40 border border-green-700/50 rounded text-xs text-green-300">
                  {doc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 border-t border-chat-border">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.html,.htm"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`px-4 py-2 border rounded-lg transition text-sm ${
                uploading
                  ? 'border-chat-muted text-chat-muted cursor-not-allowed'
                  : 'border-chat-border hover:border-chat-accent'
              }`}
              title={uploading ? "Uploading..." : "Upload document (PDF, TXT, HTML)"}
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              className="flex-1 px-4 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg resize-none focus:outline-none focus:border-chat-accent"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-6 py-2 bg-chat-accent text-white rounded-lg hover:bg-chat-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? '...' : '▶'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
