import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
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
const redisConnection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? {
            host: new URL(process.env.UPSTASH_REDIS_REST_URL).hostname,
            port: 6379,
            password: process.env.UPSTASH_REDIS_REST_TOKEN,
            tls: {},
        }
        : { host: "127.0.0.1", port: 6379 };
export const worker = new Worker("file-upload-queue", async (job) => {
    let temporaryDirectory = null;
    try {
        console.log("[Worker] Processing job:", typeof job.data === 'string' ? job.data.slice(0, 100) : job.data);
        const data = typeof job.data === "string" ? JSON.parse(job.data) : job.data;
        temporaryDirectory = await mkdtemp(join(tmpdir(), "pdfchat-"));
        const temporaryPdfPath = join(temporaryDirectory, "document.pdf");
        let pdfBuffer;
        if (data.filePath && existsSync(data.filePath)) {
            pdfBuffer = await readFile(data.filePath);
        }
        else if (data.fileUrl) {
            const response = await fetch(data.fileUrl);
            if (!response.ok) {
                throw new Error(`PDF download failed with status ${response.status}`);
            }
            pdfBuffer = Buffer.from(await response.arrayBuffer());
        }
        else {
            throw new Error("Job missing fileUrl and filePath");
        }
        await writeFile(temporaryPdfPath, pdfBuffer);
        // Load PDF
        const loader = new PDFLoader(temporaryPdfPath);
        const docs = await loader.load();
        // Split PDF
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 200,
        });
        const chunks = await splitter.splitDocuments(docs);
        const indexedChunks = chunks.map(chunk => new Document({
            pageContent: chunk.pageContent,
            metadata: {
                ...chunk.metadata,
                source: data.fileName,
                documentId: data.documentId,
            },
        }));
        // Qdrant client
        const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
        const client = new QdrantClient({
            url: qdrantUrl,
            apiKey: process.env.QDRANT_API_KEY || undefined,
            checkCompatibility: false,
        });
        // Embeddings
        const googleKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_KEY || "dummy";
        let embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey: googleKey,
            modelName: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
        });
        // Store vectors
        try {
            await QdrantVectorStore.fromDocuments(indexedChunks, embeddings, {
                client,
                collectionName: "pdf-collection",
            });
        }
        catch (err) {
            console.warn(`[Worker] Embedding failed (${err.message}), trying text-embedding-004...`);
            embeddings = new GoogleGenerativeAIEmbeddings({
                apiKey: googleKey,
                modelName: "text-embedding-004",
            });
            await QdrantVectorStore.fromDocuments(indexedChunks, embeddings, {
                client,
                collectionName: "pdf-collection",
            });
        }
        console.log(`✅ [Worker] PDF indexed successfully for documentId: ${data.documentId}`);
    }
    catch (error) {
        console.error("Worker failed:", error);
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
