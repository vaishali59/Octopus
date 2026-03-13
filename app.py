import json
import os
import pathlib
import sqlite3
from functools import wraps
import tempfile
import uuid

from cryptography.fernet import Fernet
from flask import Flask, Response, g, jsonify, render_template, request, session, stream_with_context, send_from_directory
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEndpoint
from werkzeug.security import check_password_hash, generate_password_hash

# Document processing imports
from langchain_community.document_loaders import (
    PyPDFLoader, 
    TextLoader,
    UnstructuredHTMLLoader,
    CSVLoader
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings

BASE_DIR = pathlib.Path(__file__).parent
ENV_CONFIG_PATH = BASE_DIR / ".env_config"
DB_PATH = BASE_DIR / "chat_app.db"
_FERNET_KEY_FILE = BASE_DIR / ".fernet_key"
DOCS_DIR = BASE_DIR / "user_documents"
VECTOR_STORE_DIR = BASE_DIR / "vector_stores"

# Ensure directories exist
DOCS_DIR.mkdir(exist_ok=True)
VECTOR_STORE_DIR.mkdir(exist_ok=True)


def _get_fernet() -> Fernet:
    key_env = os.environ.get("FERNET_KEY", "").strip()
    if key_env:
        return Fernet(key_env.encode())
    if _FERNET_KEY_FILE.exists():
        return Fernet(_FERNET_KEY_FILE.read_bytes().strip())
    key = Fernet.generate_key()
    _FERNET_KEY_FILE.write_bytes(key)
    return Fernet(key)


fernet = _get_fernet()
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-in-prod")

# Configure session cookies for React frontend
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS


# ── Database ──────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    """Initialize database from schema.sql"""
    db = sqlite3.connect(DB_PATH)
    schema_path = BASE_DIR / "schema.sql"
    if schema_path.exists():
        with open(schema_path, 'r') as f:
            db.executescript(f.read())
    db.commit()
    db.close()


def reset_db():
    """Reset database to clean state (deletes all data and recreates schema)"""
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


# ── Document Processing ───────────────────────────────────────────────────────

def get_embeddings():
    """Initialize HuggingFace embeddings - free and private"""
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        model_kwargs={'device': 'cpu'}
    )

def process_and_store_document(file_path: str, user_id: int) -> str:
    """Process document and store in FAISS vector store"""
    try:
        # Load document - Support reliable formats
        if file_path.endswith('.pdf'):
            loader = PyPDFLoader(file_path)
        elif file_path.endswith('.txt'):
            loader = TextLoader(file_path)
        elif file_path.endswith('.html') or file_path.endswith('.htm'):
            loader = UnstructuredHTMLLoader(file_path)
        else:
            raise ValueError("Unsupported file type. Use PDF, TXT, HTML")
        
        documents = loader.load()
        
        # Split into chunks
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", " ", ""]
        )
        chunks = splitter.split_documents(documents)
        
        # Create vector store with free HuggingFace embeddings
        embeddings = get_embeddings()
        vector_store = FAISS.from_documents(chunks, embeddings)
        
        # Save vector store
        doc_id = str(uuid.uuid4())
        store_path = VECTOR_STORE_DIR / f"user_{user_id}_{doc_id}"
        vector_store.save_local(str(store_path))
        
        return doc_id
    except Exception as e:
        raise e

def retrieve_relevant_docs(query: str, user_id: int, chat_id: int, k: int = 3) -> list:
    """Retrieve relevant documents for a query from a specific chat"""
    try:
        # Get documents associated with this chat
        db = sqlite3.connect(DB_PATH)
        doc_ids = db.execute(
            "SELECT document_id FROM chat_documents WHERE chat_id = ?",
            (chat_id,)
        ).fetchall()
        db.close()
        
        if not doc_ids:
            return []
        
        doc_id_set = {row[0] for row in doc_ids}
        embeddings = get_embeddings()
        all_results = []
        
        # Search only in vector stores for documents in this chat
        for store_path in VECTOR_STORE_DIR.glob(f"user_{user_id}_*"):
            doc_id = store_path.name.split('_', 2)[2]  # Extract doc_id from path
            
            if doc_id not in doc_id_set:
                continue
            
            try:
                vector_store = FAISS.load_local(str(store_path), embeddings, allow_dangerous_deserialization=True)
                results = vector_store.similarity_search(query, k=k)
                all_results.extend(results)
            except Exception as e:
                continue
        
        # Return top k results
        return all_results[:k]
    except Exception as e:
        return []

# ── Helpers ───────────────────────────────────────────────────────────────────


def encrypt_key(key: str) -> bytes:
    return fernet.encrypt(key.encode())


def decrypt_key(blob) -> str:
    return fernet.decrypt(bytes(blob)).decode()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken"}), 409
    return jsonify({"ok": True})


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401
    session["user_id"] = row["id"]
    session["username"] = row["username"]
    return jsonify({"ok": True, "username": row["username"]})


@app.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/auth/me")
def me():
    if "user_id" not in session:
        return jsonify({"logged_in": False})
    return jsonify({"logged_in": True, "username": session["username"]})


# ── Serve React frontend ─────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    """Serve React build for all routes (SPA)"""
    dist_dir = BASE_DIR / "frontend" / "dist"
    if path and (dist_dir / path).exists():
        return send_from_directory(dist_dir, path)
    return send_from_directory(dist_dir, "index.html")


# ── User custom models only ────────────────────────────────────────────────────

@app.route("/api/models")
@login_required
def get_models():
    """Get user's custom models only"""
    db = get_db()
    user_id = session["user_id"]

    custom_rows = db.execute(
        "SELECT id, display_name, model_id, provider, base_url FROM user_models WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    custom = [dict(r) for r in custom_rows]

    return jsonify({"models": custom})


# ── Key management ────────────────────────────────────────────────────────────

@app.route("/api/keys", methods=["POST"])
@login_required
def save_key():
    data = request.get_json()
    provider = (data.get("provider") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    if not provider or not api_key:
        return jsonify({"error": "provider and api_key required"}), 400
    db = get_db()
    db.execute(
        "INSERT INTO user_keys (user_id, provider, api_key_encrypted) VALUES (?, ?, ?)"
        " ON CONFLICT(user_id, provider) DO UPDATE SET api_key_encrypted=excluded.api_key_encrypted",
        (session["user_id"], provider, encrypt_key(api_key)),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/keys/<provider>", methods=["DELETE"])
@login_required
def delete_key(provider):
    db = get_db()
    db.execute(
        "DELETE FROM user_keys WHERE user_id = ? AND provider = ?",
        (session["user_id"], provider),
    )
    db.commit()
    return jsonify({"ok": True})


# ── Custom model management ───────────────────────────────────────────────────

@app.route("/api/models", methods=["POST"])
@login_required
def add_model():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
            
        display_name = (data.get("display_name") or "").strip()
        model_id = (data.get("model_id") or "").strip()
        provider = (data.get("provider") or "custom").strip()
        base_url = (data.get("base_url") or "").strip() or None
        api_key = (data.get("api_key") or "").strip()
        
        print(f"DEBUG: Adding model - display_name: {display_name}, model_id: {model_id}, provider: {provider}")
        
        if not display_name or not model_id:
            return jsonify({"error": "display_name and model_id required"}), 400
        if provider == "custom" and not base_url:
            return jsonify({"error": "base_url required for custom provider"}), 400
            
        encrypted_key = encrypt_key(api_key) if api_key else None
        db = get_db()
        cur = db.execute(
            "INSERT INTO user_models (user_id, display_name, model_id, provider, base_url, api_key_encrypted)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (session["user_id"], display_name, model_id, provider, base_url, encrypted_key),
        )
        db.commit()
        
        # Fetch the complete model object to return to frontend
        new_model = db.execute(
            "SELECT id, user_id, display_name, model_id, provider, base_url FROM user_models WHERE id = ?",
            (cur.lastrowid,)
        ).fetchone()
        
        print(f"DEBUG: New model created: {dict(new_model)}")
        return jsonify(dict(new_model))
        
    except Exception as e:
        print(f"DEBUG: Error in add_model: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to add model: {str(e)}"}), 500


@app.route("/api/models/<int:model_id>", methods=["PUT"])
@login_required
def update_model(model_id):
    """Update an existing model"""
    data = request.get_json()
    db = get_db()
    user_id = session["user_id"]

    # Check if model exists and belongs to user
    model = db.execute(
        "SELECT * FROM user_models WHERE id = ? AND user_id = ?",
        (model_id, user_id),
    ).fetchone()

    if not model:
        return jsonify({"error": "Model not found"}), 404

    # Build update query dynamically
    updates = []
    values = []

    if "display_name" in data:
        updates.append("display_name = ?")
        values.append(data["display_name"])

    if "model_id" in data:
        updates.append("model_id = ?")
        values.append(data["model_id"])

    if "base_url" in data:
        updates.append("base_url = ?")
        values.append(data["base_url"])

    if "api_key" in data and data["api_key"]:
        updates.append("api_key_encrypted = ?")
        values.append(encrypt_key(data["api_key"]))

    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400

    values.extend([model_id, user_id])
    
    query = f"UPDATE user_models SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
    db.execute(query, values)
    db.commit()

    return jsonify({"ok": True})


@app.route("/api/models/<int:model_id>", methods=["DELETE"])
@login_required
def delete_model(model_id):
    db = get_db()
    db.execute(
        "DELETE FROM user_models WHERE id = ? AND user_id = ?",
        (model_id, session["user_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


# ── Document Upload ────────────────────────────────────────────────────────────────

@app.route("/api/documents/upload", methods=["POST"])
@login_required
def upload_document():
    """Upload and process a document for a specific chat"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Get chat_id from request
        chat_id = request.form.get('chat_id', type=int)
        if not chat_id:
            return jsonify({"error": "chat_id is required"}), 400
        
        # Validate file type
        allowed_extensions = {'.pdf', '.txt', '.html', '.htm'}
        file_ext = pathlib.Path(file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            return jsonify({"error": f"Unsupported file type. Allowed: PDF, TXT, HTML"}), 400
        
        user_id = session["user_id"]
        db = get_db()
        
        # Verify chat belongs to user
        chat = db.execute(
            "SELECT id FROM chat_history WHERE id = ? AND user_id = ?",
            (chat_id, user_id)
        ).fetchone()
        
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        
        # Save file to persistent location
        doc_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = DOCS_DIR / doc_filename
        file.save(str(file_path))
        
        try:
            # Process document with free embeddings
            doc_id = process_and_store_document(str(file_path), user_id)
            
            # Store document-chat relationship
            db.execute(
                "INSERT INTO chat_documents (chat_id, document_id, filename) VALUES (?, ?, ?)",
                (chat_id, doc_id, file.filename)
            )
            db.commit()
            
            return jsonify({
                "ok": True,
                "document_id": doc_id,
                "filename": file.filename,
                "message": f"Document '{file.filename}' uploaded successfully!"
            })
        finally:
            # Clean up the saved file after processing
            if file_path.exists():
                os.unlink(str(file_path))
                
    except Exception as e:
        return jsonify({"error": f"Failed to process document: {str(e)}"}), 500


@app.route("/api/chats/<int:chat_id>/documents", methods=["GET"])
@login_required
def get_chat_documents(chat_id):
    """Get all documents uploaded to a specific chat"""
    user_id = session["user_id"]
    db = get_db()
    
    # Verify chat belongs to user
    chat = db.execute(
        "SELECT id FROM chat_history WHERE id = ? AND user_id = ?",
        (chat_id, user_id)
    ).fetchone()
    
    if not chat:
        return jsonify({"error": "Chat not found"}), 404
    
    # Get documents for this chat
    documents = db.execute(
        "SELECT id, document_id, filename, created_at FROM chat_documents WHERE chat_id = ? ORDER BY created_at DESC",
        (chat_id,)
    ).fetchall()
    
    return jsonify([dict(doc) for doc in documents])


@app.route("/api/models/<int:model_id>/health", methods=["POST"])
@login_required
def model_health_check(model_id):
    """Check health and connectivity of a model"""
    from health_check import check_huggingface_health, check_nvidia_health, check_custom_health
    
    user_id = session["user_id"]
    db = get_db()
    
    # Get model configuration
    model = db.execute(
        "SELECT * FROM user_models WHERE id = ? AND user_id = ?",
        (model_id, user_id)
    ).fetchone()
    
    if not model:
        return jsonify({"error": "Model not found"}), 404
    
    try:
        health_result = {"status": "unknown", "message": ""}
        
        # Database is returning tuple, not sqlite3.Row
        # Column order: id(0), user_id(1), display_name(2), model_id(3), provider(4), base_url(5), api_key_encrypted(6)
        provider = model[4]  # provider is at index 4
        model_id = model[3]  # model_id is at index 3
        base_url = model[5]  # base_url is at index 5
        api_key_encrypted = model[6]  # api_key_encrypted is at index 6
        
        # Handle HuggingFace and NVIDIA
        if provider == "hf_router":
            # Check if API key is configured for HuggingFace
            if not api_key_encrypted:
                health_result = {
                    "status": "error",
                    "message": "No API key configured for HuggingFace"
                }
            else:
                api_key = decrypt_key(api_key_encrypted)
                health_result = check_huggingface_health(model_id, api_key)
        elif provider == "nvidia":
            # Get API key from user_models table (required for NVIDIA)
            if not api_key_encrypted:
                health_result = {
                    "status": "error",
                    "message": "No API key configured for NVIDIA"
                }
            else:
                api_key = decrypt_key(api_key_encrypted)
                health_result = check_nvidia_health(api_key, model_id)
        elif provider == "deh":
            # DEH uses custom endpoint
            if not base_url:
                health_result = {
                    "status": "error",
                    "message": "No base URL configured for DEH"
                }
            else:
                health_result = check_custom_health(base_url)
        else:
            health_result = {
                "status": "error",
                "message": f"Provider not supported yet: {provider}"
            }
        
        return jsonify(health_result)
        
    except Exception as e:
        import traceback
        print(f"DEBUG: Exception in health check: {str(e)}")
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Health check failed: {str(e)}"
        }), 500


# ── Chat History ───────────────────────────────────────────────────────────────────

@app.route("/api/chats", methods=["GET"])
@login_required
def get_chats():
    """Get all chat conversations for a user"""
    user_id = session["user_id"]
    model_id = request.args.get("model_id", type=int)
    
    db = get_db()
    query = """
        SELECT ch.*, um.display_name as model_name, um.provider
        FROM chat_history ch
        JOIN user_models um ON ch.model_id = um.id
        WHERE ch.user_id = ?
    """
    params = [user_id]
    
    if model_id:
        query += " AND ch.model_id = ?"
        params.append(model_id)
    
    query += " ORDER BY ch.updated_at DESC"
    
    chats = db.execute(query, params).fetchall()
    return jsonify([dict(chat) for chat in chats])

@app.route("/api/chats", methods=["POST"])
@login_required
def create_chat():
    """Create a new chat conversation"""
    user_id = session["user_id"]
    model_id = request.json.get("model_id")
    title = request.json.get("title", "New Chat")
    
    if not model_id:
        return jsonify({"error": "model_id is required"}), 400
    
    db = get_db()
    
    # Check limit: max 6 chats per model per user
    existing_count = db.execute(
        "SELECT COUNT(*) as count FROM chat_history WHERE user_id = ? AND model_id = ?",
        (user_id, model_id)
    ).fetchone()["count"]
    
    if existing_count >= 6:
        return jsonify({"error": "Maximum 6 chats allowed per model"}), 400
    
    # Create new chat
    chat_id = db.execute(
        "INSERT INTO chat_history (user_id, model_id, title) VALUES (?, ?, ?)",
        (user_id, model_id, title)
    ).lastrowid
    db.commit()
    
    return jsonify({"id": chat_id, "title": title})

@app.route("/api/chats/<int:chat_id>/messages", methods=["GET"])
@login_required
def get_chat_messages(chat_id):
    """Get all messages for a chat"""
    user_id = session["user_id"]
    
    db = get_db()
    
    # Verify chat belongs to user
    chat = db.execute(
        "SELECT id FROM chat_history WHERE id = ? AND user_id = ?",
        (chat_id, user_id)
    ).fetchone()
    
    if not chat:
        return jsonify({"error": "Chat not found"}), 404
    
    messages = db.execute(
        "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC",
        (chat_id,)
    ).fetchall()
    
    return jsonify([dict(msg) for msg in messages])

@app.route("/api/chats/<int:chat_id>", methods=["PUT"])
@login_required
def update_chat(chat_id):
    """Update chat title"""
    user_id = session["user_id"]
    title = request.json.get("title")
    
    if not title:
        return jsonify({"error": "title is required"}), 400
    
    db = get_db()
    
    # Verify chat belongs to user
    result = db.execute(
        "UPDATE chat_history SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        (title, chat_id, user_id)
    )
    
    if result.rowcount == 0:
        return jsonify({"error": "Chat not found"}), 404
    
    db.commit()
    return jsonify({"ok": True})

@app.route("/api/chats/<int:chat_id>", methods=["DELETE"])
@login_required
def delete_chat(chat_id):
    """Delete a chat and all its messages and documents"""
    user_id = session["user_id"]
    
    db = get_db()
    
    # First, get all documents for this chat to clean up files
    documents = db.execute(
        "SELECT document_id FROM chat_documents WHERE chat_id = ?",
        (chat_id,)
    ).fetchall()
    
    # Clean up vector stores for this chat's documents
    for doc in documents:
        doc_id = doc[0]
        # Remove vector store
        vector_store_path = VECTOR_STORE_DIR / f"user_{user_id}_{doc_id}"
        if vector_store_path.exists():
            import shutil
            shutil.rmtree(vector_store_path)
    
    # Clean up any uploaded files for this chat
    # Note: uploaded files are already cleaned up after processing
    # But if any remain, clean them up
    for file_path in DOCS_DIR.glob("*"):
        if file_path.is_file():
            file_path.unlink()
    
    # Now delete the chat (cascade will handle chat_documents)
    result = db.execute(
        "DELETE FROM chat_history WHERE id = ? AND user_id = ?",
        (chat_id, user_id)
    )
    
    if result.rowcount == 0:
        return jsonify({"error": "Chat not found"}), 404
    
    db.commit()
    return jsonify({"ok": True})

# ── Chat ──────────────────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    data = request.get_json()
    messages = data.get("messages", [])
    custom_model_db_id = data.get("custom_model_id")
    chat_id = data.get("chat_id")           # Optional: save to this chat
    enable_thinking = data.get("enable_thinking", False)
    temperature = float(data.get("temperature", 0.7))
    max_tokens = int(data.get("max_tokens", 1024))

    db = get_db()
    user_id = session["user_id"]

    # Get user's model
    row = db.execute(
        "SELECT * FROM user_models WHERE id = ? AND user_id = ?",
        (custom_model_db_id, user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "Model not found"}), 404
    
    # Hardcoded provider URLs for hf_router and nvidia
    provider_urls = {
        "hf_router": "https://router.huggingface.co/v1",
        "nvidia": "https://integrate.api.nvidia.com/v1",
    }
    
    # Use custom base_url if provided, otherwise use hardcoded URL
    if row["base_url"]:
        base_url = row["base_url"].rstrip("/")
    else:
        # Use hardcoded URL based on provider
        base_url = provider_urls.get(row["provider"], "")
    
    model_id = row["model_id"]
    if row["api_key_encrypted"]:
        api_key = decrypt_key(row["api_key_encrypted"])
    else:
        # For custom models, try to find a matching key
        # HF models need HF keys, etc.
        if row["provider"] == "deh":
            # Hardcoded DEH API key
            api_key = "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        elif row["provider"] == "hf_router":
            key_row = db.execute(
                "SELECT api_key_encrypted FROM user_keys WHERE user_id = ? AND provider = 'hf_router'",
                (user_id,),
            ).fetchone()
            if key_row:
                api_key = decrypt_key(key_row["api_key_encrypted"])
            else:
                api_key = "none"
        elif row["provider"] == "nvidia":
            key_row = db.execute(
                "SELECT api_key_encrypted FROM user_keys WHERE user_id = ? AND provider = 'nvidia'",
                (user_id,),
            ).fetchone()
            if key_row:
                api_key = decrypt_key(key_row["api_key_encrypted"])
            else:
                api_key = "none"
        else:
            # For custom provider, use "none" as placeholder
            api_key = "none"

    # Retrieve relevant documents if user has uploaded any
    enhanced_messages = messages.copy()
    if messages and messages[-1].get("role") == "user" and chat_id:
        user_query = messages[-1].get("content", "")
        try:
            relevant_docs = retrieve_relevant_docs(user_query, user_id, chat_id, k=3)
            
            if relevant_docs:
                # Create context from retrieved documents
                doc_context = "\n\n".join([f"Document excerpt:\n{doc.page_content}" for doc in relevant_docs])
                system_message = {
                    "role": "system",
                    "content": f"You have access to the following documents. Use them to answer the user's question if relevant:\n\n{doc_context}\n\nIf the documents don't contain relevant information, answer based on your knowledge."
                }
                # Insert system message at the beginning
                enhanced_messages = [system_message] + messages
        except Exception as e:
            # Continue without document context
            pass

    # Use ChatOpenAI for all providers (HF Router, NVIDIA, DEH, Custom)
    model_kwargs = {}
    if enable_thinking:
        model_kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": True}}

    llm = ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model_id,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
        model_kwargs=model_kwargs,
    )

    def generate():
        full_response = ""
        full_reasoning = ""
        
        # Save user messages if chat_id provided
        if chat_id:
            db_local = get_db()
            # Verify chat belongs to user
            chat = db_local.execute(
                "SELECT id FROM chat_history WHERE id = ? AND user_id = ?",
                (chat_id, user_id)
            ).fetchone()
            
            if chat:
                # Check message limit (500 per chat)
                msg_count = db_local.execute(
                    "SELECT COUNT(*) as count FROM chat_messages WHERE chat_id = ?",
                    (chat_id,)
                ).fetchone()["count"]
                
                if msg_count + len(messages) <= 500:
                    # Save new messages
                    for msg in messages:
                        db_local.execute(
                            "INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)",
                            (chat_id, msg["role"], msg["content"])
                        )
                    db_local.commit()
        
        try:
            for chunk in llm.stream(enhanced_messages):
                # ChatOpenAI returns structured chunks
                content = chunk.content or ""
                reasoning = (
                    chunk.additional_kwargs.get("reasoning", "")
                    if chunk.additional_kwargs
                    else ""
                )
                
                if content or reasoning:
                    full_response += content
                    full_reasoning += reasoning
                    yield f"data: {json.dumps({'content': content, 'reasoning': reasoning})}\n\n"
            
            # Save assistant response if chat_id provided
            if chat_id and full_response:
                db_local = get_db()
                db_local.execute(
                    "INSERT INTO chat_messages (chat_id, role, content, reasoning) VALUES (?, ?, ?, ?)",
                    (chat_id, "assistant", full_response, full_reasoning or None)
                )
                db_local.commit()
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
