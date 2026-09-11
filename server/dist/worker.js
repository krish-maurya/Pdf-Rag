import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        : { host: "localhost", port: 6379 };
const worker = new Worker("file-upload-queue", async (job) => {
    try {
        console.log("Job:", job.data);
        const data = JSON.parse(job.data);
        const temporaryDirectory = await mkdtemp(join(tmpdir(), "pdfchat-"));
        const temporaryPdfPath = join(temporaryDirectory, "document.pdf");
        try {
            const response = await fetch(data.fileUrl);
            if (!response.ok) {
                throw new Error(`Cloudinary download failed with status ${response.status}`);
            }
            const pdfBuffer = Buffer.from(await response.arrayBuffer());
            await writeFile(temporaryPdfPath, pdfBuffer);
            const loader = new PDFLoader(temporaryPdfPath);
            const docs = await loader.load();
            // Split PDF
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 500,
                chunkOverlap: 200,
            });
            const chunks = await splitter.splitDocuments(docs);
            const indexedChunks = chunks.map(chunk => ({
                ...chunk,
                metadata: {
                    ...chunk.metadata,
                    source: data.fileName,
                    documentId: data.documentId,
                },
            }));
            //  Qdrant client
            const client = new QdrantClient({
                url: process.env.QDRANT_URL,
                apiKey: process.env.QDRANT_API_KEY,
            });
            //  Embeddings
            const embeddings = new GoogleGenerativeAIEmbeddings({
                apiKey: process.env.GOOGLE_API_KEY,
                modelName: "gemini-embedding-001",
            });
            const testEmbedding = await embeddings.embedQuery("dimension test");
            console.log("Embedding dimension:", testEmbedding.length);
            //  Store vectors
            await QdrantVectorStore.fromDocuments(indexedChunks, embeddings, {
                client,
                collectionName: "pdf-collection",
            });
            console.log(" PDF indexed successfully");
        }
        finally {
            await rm(temporaryDirectory, { recursive: true, force: true });
        }
    }
    catch (error) {
        console.error("Worker failed:", error);
        throw error; // BullMQ will retry
    }
}, {
    connection: redisConnection,
});
