import { Worker } from 'bullmq';
import { OpenAIEmbeddings } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Document } from 'langchain';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";



const worker = new Worker(
    'file-upload-queue',
    async job => {
        console.log('Job : ', job.data);
        const data = JSON.parse(job.data);

        //load pdf
        const loader = new PDFLoader(data.path)
        const docs = await loader.load()

        const TextSplitters = new CharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        
    },
    {
        connection: {
            host: 'localhost',
            port: 6379,
        }
    }
);

