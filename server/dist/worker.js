import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import "dotenv/config";
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
    // Normalize vector
    let norm = 0;
    for (let i = 0; i < dim; i++)
        norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++)
        vec[i] /= norm;
    return vec;
}
export function getEmbeddings() {
    const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_KEY;
    if (googleKey) {
        return new GoogleGenerativeAIEmbeddings({
            apiKey: googleKey,
            modelName: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
        });
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        return new OpenAIEmbeddings({
            openAIApiKey: openaiKey,
            modelName: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
        });
    }
    console.warn("⚠️ [Worker] No GOOGLE_API_KEY or OPENAI_API_KEY found. Using deterministic local embeddings for testing.");
    return {
        async embedDocuments(documents) {
            return documents.map(doc => deterministicVector(doc, 768));
        },
        async embedQuery(document) {
            return deterministicVector(document, 768);
        }
    };
}
export function getQdrantClient() {
    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    return new QdrantClient({
        url: qdrantUrl,
        apiKey: process.env.QDRANT_API_KEY || undefined,
        checkCompatibility: false,
    });
}
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
export const worker = new Worker("file-upload-queue", async (job) => {
    let temporaryDirectory = null;
    try {
        console.log(`[Worker] Processing job ${job.id}:`, typeof job.data === 'string' ? job.data.slice(0, 100) : job.data);
        const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data;
        temporaryDirectory = await mkdtemp(join(tmpdir(), "pdfchat-"));
        const temporaryPdfPath = join(temporaryDirectory, "document.pdf");
        let pdfBuffer;
        // Handle local file vs remote/Cloudinary file
        if (data.filePath && existsSync(data.filePath)) {
            console.log(`[Worker] Loading PDF from local path: ${data.filePath}`);
            pdfBuffer = await readFile(data.filePath);
        }
        else if (data.fileUrl) {
            console.log(`[Worker] Downloading PDF from URL: ${data.fileUrl}`);
            const response = await fetch(data.fileUrl);
            if (!response.ok) {
                throw new Error(`PDF download failed with status ${response.status}`);
            }
            pdfBuffer = Buffer.from(await response.arrayBuffer());
        }
        else {
            throw new Error("Job data missing both filePath and fileUrl");
        }
        await writeFile(temporaryPdfPath, pdfBuffer);
        // Load and parse PDF
        const loader = new PDFLoader(temporaryPdfPath);
        const docs = await loader.load();
        console.log(`[Worker] Loaded ${docs.length} pages from PDF`);
        // Split PDF text into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 100,
        });
        const chunks = await splitter.splitDocuments(docs);
        console.log(`[Worker] Created ${chunks.length} text chunks`);
        // Wrap as LangChain Documents with consistent metadata
        const indexedChunks = chunks.map((chunk) => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                ...chunk.metadata,
                source: data.fileName || "document.pdf",
                documentId: data.documentId,
            },
        }));
        const client = getQdrantClient();
        const embeddings = getEmbeddings();
        // Store vectors in Qdrant
        await QdrantVectorStore.fromDocuments(indexedChunks, embeddings, {
            client,
            collectionName: "pdf-collection",
        });
        console.log(`✅ [Worker] PDF indexed successfully for documentId: ${data.documentId}`);
        return { success: true, chunksCount: indexedChunks.length };
    }
    catch (error) {
        console.error("❌ [Worker] Job processing failed:", error);
        throw error;
    }
    finally {
        if (temporaryDirectory) {
            await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => { });
        }
    }
}, {
    connection: redisConnection,
});
worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
});
worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});
worker.on("error", (err) => {
    console.error("[Worker] Redis connection error:", err.message);
});
