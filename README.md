📄 PDF-RAG
Enterprise-Grade Retrieval-Augmented Generation System for Intelligent PDF Querying

PDF-RAG is a scalable, full-stack Retrieval-Augmented Generation (RAG) platform that enables users to upload PDF documents and interact with them through natural language queries.
Built entirely in TypeScript, the system combines modern web technologies, vector databases, background job processing, and large language models to deliver accurate, context-aware responses at scale.

✨ Key Capabilities

Secure PDF ingestion with authenticated access
Semantic document understanding using vector embeddings
Context-aware question answering via Retrieval-Augmented Generation
Asynchronous, queue-based processing for high scalability
Production-ready, Dockerized architecture
Modern, responsive UI built with Next.js and TailwindCSS

🏗️ System Architecture
```
User → Next.js Frontend → Express API → Redis Queue → Worker
                                    ↓
                               Vector DB (Qdrant)
                                    ↓
                            LLM (OpenAI / Gemini)
```

🧰 Technology Stack
Frontend

Next.js (App Router)
TypeScript
TailwindCSS
Clerk for authentication

Backend

Express.js (TypeScript)
RESTful APIs
Secure file upload and document processing

AI & Data Layer

OpenAI — LLM inference
Google Gemini — Embedding generation
Qdrant — Vector database for semantic search
Infrastructure
Redis — Queueing and caching
BullMQ — Background job orchestration
Docker & Docker Compose — Containerized services

🚀 Feature Overview
🔐 Authentication

Secure user authentication and session management using Clerk
Document isolation and access control per user

📄 PDF Ingestion Pipeline

PDF upload via frontend
Text extraction and intelligent chunking
Embedding generation using Gemini or OpenAI
Persistent vector storage in Qdrant

⚙️ Background Processing

CPU-intensive tasks handled by BullMQ workers
Non-blocking API responses
Independent horizontal scaling of workers

🧠 Query & Answer Flow

User submits a natural language query
Relevant document chunks retrieved via vector similarity search
LLM generates grounded answers using retrieved context

📁 Project Structure
```
Pdf-Rag/
├── client/              # Next.js frontend
├── server/              # Express backend (API)
├── worker/              # BullMQ background workers
├── docker-compose.yml   # Redis & Qdrant services
├── .env.example
└── README.md
```

⚙️ Setup & Installation
1️⃣ Clone the Repository
git clone https://github.com/krish-maurya/Pdf-Rag.git
cd Pdf-Rag

2️⃣ Environment Configuration

Create a .env file from the example:
cp .env.example .env


Required environment variables:
```
# Authentication
CLERK_SECRET_KEY=
CLERK_FRONTEND_API=

# LLM & Embeddings
OPENAI_API_KEY=
GOOGLE_GEMINI_KEY=

# Infrastructure
REDIS_URL=
QDRANT_URL=

# Application
NEXT_PUBLIC_APP_URL=
```

3️⃣ Install Dependencies
```
# Root
npm install

# Frontend
cd client && npm install

# Backend
cd server && npm install
```
4️⃣ Run with Docker (Recommended)
```
docker compose up --build


This will start:

Redis

Qdrant

Express API

BullMQ Worker

Next.js Frontend
```
5️⃣ Local Development (Optional)
```
# Start infrastructure
docker compose up redis qdrant

# Backend
cd server && npm run dev

# Worker
cd worker && npm run dev

# Frontend
cd client && npm run dev
```

📌 Use Cases

AI-powered document assistants
Knowledge-base chatbots
Research paper and technical document analysis
Enterprise document search systems
Educational and legal document querying

🤝 Contributing

Contributions are welcome.
Please open an issue or submit a pull request for improvements or bug fixes.

📜 License

This project is licensed under the MIT License.
