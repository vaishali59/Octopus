import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { modelsApi, authApi } from '../api';

export default function ModelCatalogPage() {
  const navigate = useNavigate();
  const { user, models, setModels, removeModel, setUser } = useStore();
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [displayName, setDisplayName] = useState('');
  const [modelId, setModelId] = useState('');
  const [provider, setProvider] = useState<string>('hf_router');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    display_name: '',
    model_id: '',
    base_url: '',
    api_key: ''
  });

  useEffect(() => {
    const loadModels = async () => {
      try {
        const data = await modelsApi.getModels();
        setModels(data.models || []);
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setLoading(false);
      }
    };
    loadModels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const newModel = await modelsApi.addModel({
        display_name: displayName,
        model_id: modelId,
        provider,
        base_url: ['deh', 'custom'].includes(provider) ? baseUrl : undefined,
        api_key: ['hf_router', 'nvidia', 'hf_inference'].includes(provider) ? apiKey : undefined,
      });
      
      setModels([...models, newModel]);
      
      // Reset form
      setDisplayName('');
      setModelId('');
      setProvider('hf_router');
      setBaseUrl('');
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add model');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this model?')) return;
    
    try {
      await modelsApi.deleteModel(id);
      removeModel(id);
    } catch (err) {
      alert('Failed to delete model');
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const startEdit = (model: any) => {
    setEditingId(model.id);
    setEditData({
      display_name: model.display_name,
      model_id: model.model_id,
      base_url: model.base_url || '',
      api_key: ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ display_name: '', model_id: '', base_url: '', api_key: '' });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const updatePayload: any = {
        display_name: editData.display_name,
        model_id: editData.model_id
      };
      if (editData.base_url) updatePayload.base_url = editData.base_url;
      if (editData.api_key) updatePayload.api_key = editData.api_key;

      await modelsApi.updateModel(editingId, updatePayload);
      
      setModels(models.map(m => 
        m.id === editingId 
          ? { ...m, display_name: editData.display_name, model_id: editData.model_id, base_url: editData.base_url }
          : m
      ));
      cancelEdit();
    } catch (err) {
      console.error('Failed to update model:', err);
      alert('Failed to update model');
    }
  };

  const showUrlField = ['deh', 'custom'].includes(provider);
  const showKeyField = ['hf_router', 'nvidia', 'custom'].includes(provider);

  const getPlatformDisplayName = (provider: string) => {
    const platformNames: { [key: string]: string } = {
      'hf_router': 'Hugging Face',
      'nvidia': 'NVIDIA NGC',
      'deh': 'Dell Enterprise Hub',
      'custom': 'Custom Endpoint'
    };
    return platformNames[provider] || provider;
  };

  return (
    <div className="min-h-screen bg-chat-bg text-chat-text">
      {/* Header */}
      <header className="border-b border-chat-border bg-chat-sidebar">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Octopus</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-chat-muted">
              Welcome, <span className="text-chat-accent">{user?.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm border border-chat-border rounded-lg hover:border-chat-error hover:text-chat-error transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left: Add Model Form */}
          <div className="lg:col-span-1">
            <div className="bg-chat-sidebar border border-chat-border rounded-xl p-6 sticky top-8">
              <h2 className="text-lg font-semibold mb-4">Add New Model</h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-chat-muted mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. My Mixtral"
                    className="w-full px-3 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg text-sm focus:outline-none focus:border-chat-accent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-chat-muted mb-1">Model ID</label>
                  <input
                    type="text"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="e.g. mistralai/Mixtral-8x7B"
                    className="w-full px-3 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg text-sm focus:outline-none focus:border-chat-accent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-chat-muted mb-1">Platform</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full px-3 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg text-sm focus:outline-none focus:border-chat-accent"
                  >
                    <option value="hf_router">Hugging Face</option>
                    <option value="nvidia">NVIDIA NGC</option>
                    <option value="deh">Dell Enterprise Hub</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                </div>

                {showKeyField && (
                  <div>
                    <label className="block text-sm text-chat-muted mb-1">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Your API key"
                      className="w-full px-3 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg text-sm focus:outline-none focus:border-chat-accent"
                    />
                  </div>
                )}

                {showUrlField && (
                  <div>
                    <label className="block text-sm text-chat-muted mb-1">Endpoint URL</label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://your-server:8003/v1"
                      className="w-full px-3 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg text-sm focus:outline-none focus:border-chat-accent"
                      required={showUrlField}
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-chat-error">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 bg-chat-accent text-white font-semibold rounded-lg hover:bg-chat-accent-hover transition disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Model'}
                </button>
              </form>
            </div>
          </div>

          {/* Right: Model Tiles Grid */}
          <div className="lg:col-span-3">
            <h2 className="text-2xl font-bold mb-6">Your Models</h2>
            
            {loading ? (
              <div className="text-center py-12 text-chat-muted">Loading models...</div>
            ) : models.length === 0 ? (
              <div className="text-center py-12 text-chat-muted">
                <p className="text-lg mb-2">No models yet</p>
                <p className="text-sm">Add your first model using the form on the left</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className="bg-chat-sidebar border border-chat-border rounded-xl p-5 hover:border-chat-accent transition cursor-pointer group"
                    onClick={() => editingId !== model.id && navigate(`/chat/${model.id}`)}
                  >
                    {editingId === model.id ? (
                      // Edit form
                      <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="pb-2 border-b border-chat-border/50 mb-3">
                          <p className="text-sm text-chat-text">
                            <span className="font-medium">Platform:</span> {getPlatformDisplayName(model.provider)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs text-chat-muted mb-1">Display Name</label>
                          <input
                            type="text"
                            value={editData.display_name}
                            onChange={(e) => setEditData({...editData, display_name: e.target.value})}
                            className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-chat-muted mb-1">Model ID</label>
                          <input
                            type="text"
                            value={editData.model_id}
                            onChange={(e) => setEditData({...editData, model_id: e.target.value})}
                            className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
                          />
                        </div>
                        {['deh', 'custom'].includes(model.provider) && (
                          <div>
                            <label className="block text-xs text-chat-muted mb-1">Endpoint URL</label>
                            <input
                              type="url"
                              value={editData.base_url}
                              onChange={(e) => setEditData({...editData, base_url: e.target.value})}
                              className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-chat-muted mb-1">API Key (optional)</label>
                          <input
                            type="password"
                            value={editData.api_key}
                            onChange={(e) => setEditData({...editData, api_key: e.target.value})}
                            placeholder="Leave empty to keep existing"
                            className="w-full px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            className="flex-1 px-2 py-1 bg-chat-accent text-white rounded text-sm hover:bg-opacity-90 transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-1 px-2 py-1 bg-chat-card border border-chat-border text-chat-text rounded text-sm hover:bg-chat-border transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Normal display
                      <>
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-lg font-semibold text-chat-text group-hover:text-chat-accent transition">
                            {model.display_name}
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(model);
                              }}
                              className="text-chat-muted hover:text-chat-accent transition text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(model.id);
                              }}
                              className="text-chat-muted hover:text-chat-error transition text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                    
                    <div className="space-y-1 text-sm">
                      <p className="text-chat-muted">
                        <span className="font-medium">Platform:</span>{' '}
                        <span className="text-chat-text">{getPlatformDisplayName(model.provider)}</span>
                      </p>
                      <p className="text-chat-muted truncate">
                        <span className="font-medium">Model:</span>{' '}
                        <span className="text-chat-text">{model.model_id}</span>
                      </p>
                      {model.base_url && (
                        <p className="text-chat-muted truncate">
                          <span className="font-medium">URL:</span>{' '}
                          <span className="text-chat-text text-xs">{model.base_url}</span>
                        </p>
                      )}
                    </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
