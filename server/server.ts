import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import "dotenv/config";

const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : { host: 'localhost', port: 6379 };

const openai = new OpenAI({
  apiKey: process.env.GOOGLE_API_KEY!,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});


const queue = new Queue('file-upload-queue', {
  connection: {
    ...redisConnection,
  }
});

const client = new QdrantClient({
  url: process.env.QDRANT_URL!,
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY!,
  modelName: "gemini-embedding-001",
});

const vectorStore = await QdrantVectorStore.fromExistingCollection(
  embeddings,
  {
    client,
    collectionName: "pdf-collection",
  }
);


const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const uniquePreffix = Date.now() + "-" + Math.round(Math.random() * 1E9)
    cb(null, `${uniquePreffix}-${file.originalname}`)
  }
})

const upload = multer({ storage })


const app = express();

if (process.env.RUN_WORKER === 'true') {
  await import('./worker.js');
}

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Server running')
})

app.post('/upload/pdf', upload.single('pdf'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A PDF file is required' });
  }

  const documentId = req.file.filename;
  queue.add('file-ready', JSON.stringify({
    documentId,
    fileName: req.file.originalname,
    path: req.file.path,
  }));
  return res.json({ success: true, message: "File uploaded", documentId })
})

app.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, documentId } = req.body;
    if (!query || !documentId) {
      return res.status(400).json({ success: false, message: 'Query and uploaded document are required' });
    }

    const retriver = vectorStore.asRetriever({
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
    const result = await retriver.invoke(query);

    const uniqueResult = result.filter((doc, index, documents) => {
      const pageNumber = doc.metadata.loc?.pageNumber ?? '';
      const source = doc.metadata.source ?? '';
      return documents.findIndex(candidate =>
        candidate.metadata.source === source &&
        candidate.metadata.loc?.pageNumber === pageNumber &&
        candidate.pageContent === doc.pageContent
      ) === index;
    });

    const SYSTEM_PROMPT = `You are a helpful assistant for answering questions related to programming.
    Do not format the answer using bullets, stars, markdown, or headings.
Respond in clear, natural paragraph text only.
     You have access to the following pieces of context:
                ${JSON.stringify(uniqueResult)}

                User question: ${query}`;

    const response = await openai.chat.completions.create({
      model: "gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    return res.status(200).json({ success: true, message: response.choices[0].message.content, docs: uniqueResult })

  } catch (error) {
    if (error instanceof Error) {
      return res.status(500).json({ success: false, message: error.message })
    } else {
      return res.status(500).json({ success: false, message: 'Unknown error occurred' })
    }
  }
});

app.listen(8000, () => {
  console.log("Server is running on the port 8000")
})