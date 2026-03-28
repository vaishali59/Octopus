# Octopus

A unified chat interface for interacting with AI models from multiple platforms (HuggingFace, NVIDIA, Dell Enterprise Hub, custom endpoints) with model management, health monitoring, and conversation history.

## 📋 Quick Links

- [Architecture](#architecture)
- [Features](#features)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-endpoints)

---

## 🏗️ Architecture

```
Frontend (React + TypeScript) → Backend (Flask + Python) → Database (SQLite)
```
### Technology Stack

- **Frontend:** React 18+ with TypeScript, Vite, TailwindCSS, Zustand, React Router
- **Backend:** Flask 3.0+, LangChain, SQLite, Cryptography, FAISS
- **LLM Platforms:** HuggingFace, NVIDIA, Dell Enterprise Hub, Custom Endpoints

### Database Schema
- `users` - Authentication
- `user_models` - Model configurations
- `user_keys` - Encrypted API keys
- `chat_history` - Conversation records
- `chat_messages` - Message content
- `chat_documents` - Uploaded files

---

## ✨ Features

- **Multi-Provider Support**: HuggingFace, NVIDIA, Dell Enterprise Hub, custom endpoints
- **Model Management**: Add, edit, delete models with health monitoring
- **Chat Interface**: Real-time streaming responses with conversation history
- **Document Processing**: Upload PDF/TXT/HTML for RAG (Retrieval-Augmented Generation)
- **Security**: Encrypted API key storage, user authentication, session management
- **Responsive UI**: TailwindCSS design with real-time updates via Zustand

---

## 💻 Installation

### Prerequisites
- Python 3.10+

### Setup

```bash
# Clone and Run
git clone git@eos2git.cec.lab.emc.com:Vaishali-Gupta/Octopus.git
cd Octopus
python -m venv <your-venv>
source <your-venv>/bin/activate  # Windows: venv-openenv\Scripts\activate
pip install -r requirements.txt

# Start the application
python app.py  # http://localhost:5000
```

**That's it!** The frontend is pre-built and ready to run.

### Development (Optional)
If you need to modify the frontend:
```bash
cd frontend
npm install
npm run build  # Rebuilds frontend/dist/
```

### Optional Configuration
```bash
export FERNET_KEY="your-key"  # API key encryption
export FLASK_ENV="development"
```

**Config Files:**
- `config.py` - Backend settings
- `frontend/vite.config.ts` - Frontend build settings

---

## 📁 Project Structure

```
Octopus/
├── frontend/                    # React TypeScript frontend
│   ├── dist/                   # Pre-built production files
│   │   ├── index.html
│   │   ├── assets/
│   │   │   ├── index-*.js
│   │   │   └── index-*.css
│   │   └── vite.svg
│   ├── src/                    # Source files (for development)
│   │   ├── pages/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── ModelCatalogPage.tsx
│   │   ├── api.ts              # API client
│   │   ├── store.ts            # Zustand state management
│   │   ├── types.ts            # TypeScript types
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│

├── app.py                       # Flask application (serves frontend)
├── health_check.py              # Model health check service
├── config.py                    # Configuration settings
├── requirements.txt             # Python dependencies
├── chat_app.db                  # SQLite database (auto-created)
├── .fernet_key                  # Encryption key (auto-generated)
├── user_documents/              # Uploaded documents storage
├── vector_stores/               # FAISS vector stores
└── README.md                    # This file
```

---

## 🚀 Getting Started

1. **Register** at `http://localhost:5000`
2. **Add Model** - Go to Models page, fill in details, add API key
3. **Start Chatting** - Click model to open chat, type message
4. **Upload Documents** (optional) - Click "Upload Document" in chat for RAG

---

### API Endpoints

**Authentication:**
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user

**Models:**
- `GET /api/models` - List user's models
- `POST /api/models` - Add new model
- `PUT /api/models/<id>` - Update model
- `DELETE /api/models/<id>` - Delete model
- `POST /api/models/<id>/health` - Check model health

**Chat:**
- `POST /api/chats` - Create new chat
- `GET /api/chats` - List chats for a model
- `POST /api/chat` - Send message (streaming)
- `GET /api/chats/<id>/messages` - Get chat messages
- `DELETE /api/chats/<id>` - Delete chat

**Documents:**
- `POST /api/documents/upload` - Upload document
- `GET /api/documents` - List documents

---

## 📝 Notes

- API keys are encrypted before storage
- Conversation history is persistent across sessions
- Documents are processed asynchronously
- Health checks verify model availability
- All user data is isolated and secure

---

## 🤝 Support

For issues or questions, please refer to the project documentation or contact the development team.

---

**Version:** 1.0.0  
**Last Updated:** March 2026