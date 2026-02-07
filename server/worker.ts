import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import "dotenv/config";


const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log("Job:", job.data);

      const data = JSON.parse(job.data); 

      // Load pdf
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();

      // Split PDF
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 200,
      });

      const chunks = await splitter.splitDocuments(docs);

      //  Qdrant client
      const client = new QdrantClient({
        url: process.env.QDRANT_URL!,
      });

      //  Embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY!,
        modelName: "gemini-embedding-001",
      });


      //  Store vectors
      await QdrantVectorStore.fromDocuments(
        chunks,
        embeddings,
        {
          client,
          collectionName: "pdf-collection",
        }
      );

      console.log(" PDF indexed successfully");
    } catch (error) {
      console.error("Worker failed:", error);
      throw error; // BullMQ will retry
    }
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);
