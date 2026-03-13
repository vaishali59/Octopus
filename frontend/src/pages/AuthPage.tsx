import { useState } from 'react';
import { useStore } from '../store';
import { authApi } from '../api';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = isLogin
        ? await authApi.login(username, password)
        : await authApi.register(username, password);
      setUser({ username: data.username });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-chat-bg">
      <div className="w-full max-w-md p-8 bg-chat-sidebar border border-chat-border rounded-xl">
        <h1 className="text-2xl font-bold text-center text-chat-text mb-2">
          LLM Chat Bridge
        </h1>
        <p className="text-sm text-chat-muted text-center mb-6">
          Multi-provider LLM testing platform
        </p>

        <div className="flex border border-chat-border rounded-lg overflow-hidden mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-2 text-sm font-medium transition ${
              isLogin
                ? 'bg-chat-accent text-white'
                : 'bg-transparent text-chat-muted hover:text-chat-text'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-2 text-sm font-medium transition ${
              !isLogin
                ? 'bg-chat-accent text-white'
                : 'bg-transparent text-chat-muted hover:text-chat-text'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg focus:outline-none focus:border-chat-accent"
              required
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-chat-card border border-chat-border text-chat-text rounded-lg focus:outline-none focus:border-chat-accent"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-chat-error">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-chat-accent text-white font-semibold rounded-lg hover:bg-chat-accent-hover transition disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
