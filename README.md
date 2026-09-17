# 📄 PDF-RAG
**Enterprise-Grade Retrieval-Augmented Generation System for Intelligent PDF Querying**

PDF-RAG is a full-stack Retrieval-Augmented Generation (RAG) platform that enables users to upload PDF documents and interact with them through natural language queries.
Built entirely in TypeScript, the system combines modern web technologies, vector databases, background job processing, and large language models to deliver accurate, context-aware responses at scale.

---

## ✨ Key Capabilities

- **Secure PDF Ingestion:** Upload via web interface with Cloudinary cloud storage or local disk storage fallback.
- **Semantic Understanding:** Document chunking with LangChain and vector embeddings (Google Gemini, OpenAI, or local deterministic fallback).
- **Scalable Vector Search:** High-performance similarity retrieval backed by Qdrant.
- **Asynchronous Background Processing:** BullMQ + Redis job queue for non-blocking document ingestion and worker scaling.
- **Context-Aware Question Answering:** Grounded LLM generation with deduplicated source citations (page numbers and excerpt snippets).
- **Flexible Authentication:** Clerk authentication for user accounts, with graceful dev-mode fallback when credentials are not configured.
- **Production-Ready Containerization:** Complete multi-service Docker Compose architecture.

---

## 🏗️ System Architecture

```text
User → Next.js Frontend (Port 3000)
              ↓
       Express REST API (Port 8000)
         ↙              ↘
  Redis (BullMQ Queue)   Qdrant Vector DB (Port 6333)
         ↓                      ↑
   Worker Process ──────────────┘
         ↓
  LLM / Embeddings (Gemini / OpenAI)
```

---

## 🧰 Technology Stack

- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS, Lucide Icons, Sonner toasts, React-PDF.
- **Backend:** Express.js 5 (TypeScript), Multer, Cloudinary SDK, LangChain.
- **AI & Embeddings:** Google Generative AI (Gemini 2.5 / 1.5 / embeddings) or OpenAI (GPT-4o-mini / text-embedding-3-small).
- **Vector Database:** Qdrant Vector Search Engine.
- **Task Queue:** BullMQ with Redis.
- **Auth (Optional):** Clerk (`@clerk/nextjs`).

---

## 📁 Project Structure

```text
Pdf-Rag/
├── client/              # Next.js 16 frontend application
│   ├── app/             # App router pages, layout, and HeroSection
│   ├── proxy.ts         # Middleware / request proxy (Clerk integration)
│   ├── Dockerfile       # Production frontend container
│   └── package.json
├── server/              # Express backend API & background worker
│   ├── server.ts        # Express REST API routes & lazy vector store
│   ├── worker.ts        # BullMQ worker: PDF chunking & vector indexing
│   ├── Dockerfile       # Production backend container
│   └── package.json
├── docker-compose.yml   # Multi-service composition (Redis, Qdrant, API, Frontend)
├── .env.example         # Template for all environment variables
└── README.md
```

---

## ⚙️ Setup & Quickstart

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/krish-maurya/Pdf-Rag.git
cd Pdf-Rag
```

### 2️⃣ Environment Configuration
Create a `.env` file from the example:
```bash
cp .env.example .env
```

**Required / Key Variables:**
```ini
# AI Provider (provide either Google Gemini or OpenAI)
GOOGLE_API_KEY=AIzaSy...
# or OPENAI_API_KEY=sk-...

# Infrastructure
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

# Optional: Cloudinary (if omitted, server saves PDFs locally to ./server/uploads)
# CLOUDINARY_CLOUD_NAME=
# CLOUDINARY_API_KEY=
# CLOUDINARY_API_SECRET=

# Optional: Clerk Authentication (if omitted, frontend runs in open development mode)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# CLERK_SECRET_KEY=sk_test_...

# Frontend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3️⃣ Install Dependencies
```bash
# Install server dependencies
cd server && npm install --legacy-peer-deps

# Install client dependencies
cd ../client && npm install --legacy-peer-deps
```

### 4️⃣ Run with Docker Compose (Recommended)
```bash
docker compose up --build
```
This starts:
- **Redis** at `localhost:6379`
- **Qdrant** at `localhost:6333`
- **Express API & Worker** at `localhost:8000`
- **Next.js Frontend** at `localhost:3000`

### 5️⃣ Local Development (Manual)
1. **Start Redis and Qdrant:**
   ```bash
   docker compose up redis qdrant
   ```
2. **Start the Backend (Server + Worker):**
   ```bash
   cd server
   npm run build
   npm run dev
   ```
   *(The worker automatically runs in-process with the server when `RUN_WORKER=true`)*
3. **Start the Frontend:**
   ```bash
   cd client
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check and service status |
| `POST` | `/upload/pdf` | Upload a PDF (multipart/form-data with field `pdf`) |
| `GET` | `/document/:documentId/status` | Check if document indexing has finished |
| `POST` | `/search` | Query indexed document (`{ query, documentId }`) |
| `GET` | `/uploads/:fileName` | Serve uploaded PDF locally (when Cloudinary is disabled) |

---

## 📜 License
This project is licensed under the MIT License.
