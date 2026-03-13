import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { authApi } from './api';
import AuthPage from './pages/AuthPage';
import ModelCatalogPage from './pages/ModelCatalogPage';
import ChatPage from './pages/ChatPage';

function App() {
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useStore();

  useEffect(() => {
    authApi.me().then((data) => {
      if (data.logged_in && data.username) {
        setUser({ username: data.username });
      }
      setLoading(false);
    });
  }, [setUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-chat-bg text-chat-text">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModelCatalogPage />} />
        <Route path="/chat/:modelId" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
