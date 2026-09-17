import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
// Ensure uploads folder exists
const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
}
// Cloudinary configuration (optional fallback to local disk storage)
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
const redisConnection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? {
            host: new URL(process.env.UPSTASH_REDIS_REST_URL).hostname,
            port: 6379,
            password: process.env.UPSTASH_REDIS_REST_TOKEN,
            tls: {},
        }
        : { host: '127.0.0.1', port: 6379 };
const queue = new Queue('file-upload-queue', {
    connection: redisConnection,
});
// Qdrant client
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const client = new QdrantClient({
    url: qdrantUrl,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
});
// Embeddings & Vector Store
const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_KEY || 'dummy';
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: googleKey,
    modelName: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
});
const vectorStore = new QdrantVectorStore(embeddings, {
    client,
    collectionName: 'pdf-collection',
});
// OpenAI client pointing to Google's OpenAI-compatible endpoint
const openai = new OpenAI({
    apiKey: googleKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});
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
            fileUrl = cloudinary.utils.private_download_url(storedFile.public_id, 'pdf', {
                resource_type: 'raw',
                type: 'upload',
            });
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
        let result = [];
        try {
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
            result = await retriever.invoke(query);
        }
        catch (retrieverError) {
            console.warn('[Search] Retriever lookup warning:', retrieverError.message);
            return res.status(200).json({
                success: true,
                message: 'The document is still being indexed by the background worker. Please wait a few seconds and ask again.',
                docs: [],
            });
        }
        const uniqueResult = result.filter((doc, index, documents) => {
            const pageNumber = doc.metadata.loc?.pageNumber ?? '';
            const source = doc.metadata.source ?? '';
            return (documents.findIndex((candidate) => candidate.metadata.source === source &&
                candidate.metadata.loc?.pageNumber === pageNumber &&
                candidate.pageContent === doc.pageContent) === index);
        });
        if (uniqueResult.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No relevant information found in the document for your query, or the document is still finishing indexing. Please try asking again in a moment.',
                docs: [],
            });
        }
        const SYSTEM_PROMPT = `You are a helpful assistant for answering questions related to the uploaded document.
Do not format the answer using bullets, stars, markdown, or headings.
Respond in clear, natural paragraph text only.
You have access to the following pieces of context:
${JSON.stringify(uniqueResult)}

User question: ${query}`;
        const candidateModels = [
            process.env.LLM_MODEL || 'gemini-1.5-flash',
            'gemini-1.5-flash',
            'gemini-2.0-flash',
            'gemini-2.5-flash',
        ];
        let aiAnswer = null;
        let lastError = null;
        for (const model of candidateModels) {
            try {
                const response = await openai.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: query },
                    ],
                });
                aiAnswer = response.choices[0]?.message?.content || null;
                if (aiAnswer)
                    break;
            }
            catch (err) {
                lastError = err;
                console.warn(`[LLM] Model ${model} failed (${err.message}). Trying fallback...`);
            }
        }
        if (!aiAnswer) {
            if (lastError)
                throw lastError;
            aiAnswer = 'Unable to generate an answer at this time.';
        }
        return res.status(200).json({ success: true, message: aiAnswer, docs: uniqueResult });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: 'Unknown error occurred' });
    }
});
// Auto-start worker in same process so Render deployment processes background jobs automatically
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
