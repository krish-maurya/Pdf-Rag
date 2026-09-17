import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
// Ensure uploads folder exists for local storage fallback
const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
}
// Check Cloudinary configuration (optional fallback to disk storage)
const hasCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET);
if (hasCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}
// Redis connection configuration
function getRedisConnection() {
    if (process.env.REDIS_URL) {
        const redisUrl = new URL(process.env.REDIS_URL);
        const hostname = redisUrl.hostname.toLowerCase();
        if (hostname.endsWith(".upstash.io") || hostname.includes("upstash")) {
            redisUrl.protocol = "rediss:";
            if (!redisUrl.port) {
                redisUrl.port = "6379";
            }
        }
        return {
            url: redisUrl.toString(),
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        };
    }
    if (process.env.REDIS_HOST) {
        return {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        };
    }
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        return {
            host: new URL(process.env.UPSTASH_REDIS_REST_URL).hostname,
            port: 6379,
            password: process.env.UPSTASH_REDIS_REST_TOKEN,
            tls: {},
            maxRetriesPerRequest: null,
        };
    }
    return { host: "127.0.0.1", port: 6379, maxRetriesPerRequest: null };
}
const redisConnection = getRedisConnection();
const queue = new Queue('file-upload-queue', {
    connection: redisConnection,
});
queue.on('error', (err) => {
    console.error('[BullMQ Queue Error]:', err.message);
});
// Qdrant client
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const client = new QdrantClient({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
});
// Deterministic fallback vector generator for local testing without API keys
function deterministicVector(text, dim = 768) {
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let hash = 0;
        for (let c = 0; c < word.length; c++) {
            hash = (hash << 5) - hash + word.charCodeAt(c);
            hash |= 0;
        }
        const idx = Math.abs(hash) % dim;
        vec[idx] += 1;
    }
    let norm = 0;
    for (let i = 0; i < dim; i++)
        norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++)
        vec[i] /= norm;
    return vec;
}
// Embeddings helper
function getEmbeddings() {
    const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_KEY;
    if (googleKey) {
        return new GoogleGenerativeAIEmbeddings({
            apiKey: googleKey,
            modelName: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
        });
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        return new OpenAIEmbeddings({
            openAIApiKey: openaiKey,
            modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        });
    }
    return {
        async embedDocuments(documents) {
            return documents.map((doc) => deterministicVector(doc, 768));
        },
        async embedQuery(document) {
            return deterministicVector(document, 768);
        },
    };
}
// Safe vector store initialization (non-blocking)
let cachedVectorStore = null;
async function getVectorStore() {
    if (!cachedVectorStore) {
        const embeddings = getEmbeddings();
        cachedVectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
            client,
            collectionName: 'pdf-collection',
        });
    }
    return cachedVectorStore;
}
// Multer storage
const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
        cb(null, `${Date.now()}-${safeName}`);
    },
});
const upload = hasCloudinary
    ? multer({ storage: multer.memoryStorage() })
    : multer({ storage: diskStorage });
const uploadToCloudinary = (file) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
        resource_type: 'raw',
        folder: 'pdfchat',
        public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`,
    }, (error, result) => {
        if (error || !result) {
            reject(error || new Error('Cloudinary upload failed'));
            return;
        }
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
    });
    stream.end(file.buffer);
});
// LLM completion helper
async function generateAnswer(query, contextDocs) {
    const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const SYSTEM_PROMPT = `You are a helpful assistant for answering questions related to the uploaded document.
Do not format the answer using bullets, stars, markdown, or headings.
Respond in clear, natural paragraph text only.
You have access to the following pieces of context:
${JSON.stringify(contextDocs)}

User question: ${query}`;
    if (googleKey) {
        const openai = new OpenAI({
            apiKey: googleKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        });
        const model = process.env.LLM_MODEL || 'gemini-2.5-flash';
        const response = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: query },
            ],
        });
        return response.choices[0]?.message?.content || 'No response generated.';
    }
    if (openaiKey) {
        const openai = new OpenAI({ apiKey: openaiKey });
        const model = process.env.LLM_MODEL || 'gpt-4o-mini';
        const response = await openai.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: query },
            ],
        });
        return response.choices[0]?.message?.content || 'No response generated.';
    }
    // Fallback if no API key is set
    if (contextDocs.length === 0) {
        return 'No relevant context found in the uploaded document for this query.';
    }
    return contextDocs.map((d) => d.pageContent).join('\n\n');
}
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.get('/', (_req, res) => {
    res.send('Server running');
});
app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'A PDF file is required' });
    }
    try {
        let documentId;
        let fileUrl;
        let filePath;
        if (hasCloudinary) {
            const storedFile = await uploadToCloudinary(req.file);
            documentId = storedFile.public_id;
            fileUrl = storedFile.secure_url;
        }
        else {
            documentId = req.file.filename;
            filePath = req.file.path;
            const host = req.get('host') || 'localhost:8000';
            fileUrl = `${req.protocol}://${host}/uploads/${req.file.filename}`;
        }
        await queue.add('file-ready', {
            documentId,
            fileName: req.file.originalname,
            fileUrl,
            filePath,
        });
        return res.json({ success: true, message: 'File uploaded', documentId });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'File upload failed';
        return res.status(500).json({ success: false, message });
    }
});
app.post('/search', async (req, res) => {
    try {
        const { query, documentId } = req.body;
        if (!query || !documentId) {
            return res.status(400).json({ success: false, message: 'Query and uploaded document are required' });
        }
        let vectorStore;
        try {
            vectorStore = await getVectorStore();
        }
        catch (e) {
            return res.status(400).json({
                success: false,
                message: 'The document collection is not ready yet. Please wait a moment for indexing to complete.',
            });
        }
        const retriever = vectorStore.asRetriever({
            k: 4,
            filter: {
                must: [
                    {
                        key: 'metadata.documentId',
                        match: { value: documentId },
                    },
                ],
            },
        });
        const result = await retriever.invoke(query);
        const uniqueResult = result.filter((doc, index, documents) => {
            const pageNumber = doc.metadata.loc?.pageNumber ?? '';
            const source = doc.metadata.source ?? '';
            return (documents.findIndex((candidate) => candidate.metadata.source === source &&
                candidate.metadata.loc?.pageNumber === pageNumber &&
                candidate.pageContent === doc.pageContent) === index);
        });
        const answer = await generateAnswer(query, uniqueResult);
        return res.status(200).json({ success: true, message: answer, docs: uniqueResult });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: 'Unknown error occurred' });
    }
});
// Auto-start worker in-process unless explicitly disabled
const runWorker = process.env.RUN_WORKER !== 'false';
if (runWorker) {
    try {
        await import('./worker.js');
        console.log('Worker initialized');
    }
    catch (err) {
        console.warn('Could not auto-start worker.js:', err.message);
    }
}
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on the port ${PORT}`);
});
