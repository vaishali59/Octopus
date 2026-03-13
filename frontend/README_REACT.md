# LLM Chat Bridge - React Frontend

## Setup Complete ✓

The frontend has been refactored from vanilla HTML/CSS/JS to React with:

- **React 18** + **TypeScript**
- **Vite** for fast dev server and building
- **Tailwind CSS** with ChatGPT-like dark theme
- **React Router** for navigation
- **Zustand** for state management

## Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── AuthPage.tsx          # Login/Register screen
│   │   ├── ModelCatalogPage.tsx  # Model management with tiles
│   │   └── ChatPage.tsx          # Chat interface with sidebar
│   ├── api.ts                    # API client for Flask backend
│   ├── store.ts                  # Zustand global state
│   ├── types.ts                  # TypeScript interfaces
│   ├── App.tsx                   # Main app with routing
│   └── index.css                 # Tailwind directives
├── tailwind.config.js            # Tailwind theme config
├── vite.config.ts                # Vite proxy to Flask
└── package.json
```

## Running the App

### Development Mode

1. **Start Flask backend** (in one terminal):
   ```bash
   cd /home/xeadmin/vaishali/projects/chat_app
   source /home/xeadmin/vaishali/venv-openenv/bin/activate  # or your venv
   python app.py
   ```
   Flask runs on `http://localhost:5000`

2. **Start React dev server** (in another terminal):
   ```bash
   cd /home/xeadmin/vaishali/projects/chat_app/frontend
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   npm run dev
   ```
   React runs on `http://localhost:5173`

3. **Open browser**: `http://localhost:5173`

Vite automatically proxies `/auth` and `/api` requests to Flask.

## Features Implemented

### ✓ Authentication
- Login/Register screen
- Session-based auth with Flask
- Auto-redirect based on auth state

### ✓ Model Catalog Page
- Left panel: Add model form with dynamic fields
  - Provider dropdown (HF OpenAI, HF Inference, NVIDIA, DEH, Custom)
  - Conditional fields (API key for HF/NVIDIA, URL for DEH/Custom)
- Right panel: Model tiles grid
  - Click tile to open chat
  - Delete button per tile
  - Hover effects

### ✓ Chat Page
- Left sidebar:
  - Back to models button
  - New chat button
  - Past conversations placeholder
  - Config controls (temperature, max tokens, enable thinking)
- Main chat area:
  - Model header with name and provider
  - Message bubbles (user/assistant)
  - Reasoning toggle support
  - Auto-scroll to latest message
- Input bar:
  - Textarea with Enter to send, Shift+Enter for newline
  - File upload button (placeholder)
  - Send button with loading state

### ✓ ChatGPT-like Theme
- Dark mode with custom colors
- Smooth transitions and hover effects
- Responsive layout

## Next Steps (Optional Enhancements)

### File Upload
1. Install `react-dropzone`:
   ```bash
   npm install react-dropzone
   ```

2. Add Flask route `/api/files/upload` to handle file storage

3. Update `ChatPage.tsx` to use dropzone component

### Chat History Persistence
1. Add Flask routes: `/api/chats` (GET/POST/DELETE)
2. Add DB tables: `chats`, `messages`
3. Update `ChatPage` to load/save chat history

### Production Build
1. Build React app:
   ```bash
   npm run build
   ```

2. Update Flask `app.py` to serve React build:
   ```python
   from flask import send_from_directory
   
   @app.route('/', defaults={'path': ''})
   @app.route('/<path:path>')
   def serve_react(path):
       if path and os.path.exists(os.path.join('frontend/dist', path)):
           return send_from_directory('frontend/dist', path)
       return send_from_directory('frontend/dist', 'index.html')
   ```

## Troubleshooting

### Port conflicts
- Flask default: 5000
- Vite default: 5173
- Change in `vite.config.ts` if needed

### CORS issues
- Vite proxy handles this in dev mode
- For production, ensure Flask CORS is configured

### Tailwind not working
- The `@tailwind` warnings in CSS are normal
- Tailwind processes them during build/dev

## API Integration

All API calls use `credentials: 'include'` to send session cookies. The Flask backend must have:
```python
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
```

## Theme Colors

Defined in `tailwind.config.js`:
- `chat-bg`: #0f1117 (main background)
- `chat-sidebar`: #161b22 (sidebar/cards)
- `chat-accent`: #2f81f7 (primary blue)
- `chat-text`: #e6edf3 (main text)
- `chat-muted`: #8b949e (secondary text)

Matches ChatGPT's dark theme aesthetic.
