import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import "dotenv/config";

const openai = new OpenAI({
  apiKey: process.env.GOOGLE_API_KEY!,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});


const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: 6379,
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

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Server running')
})

app.post('/upload/pdf', upload.single('pdf'), (req: Request, res: Response) => {
  queue.add('file-ready', JSON.stringify({
    fileName: req.file?.originalname,
    source: req.file?.destination,
    path: req.file?.path,
  }));
  return res.json({ success: true, message: "File uploaded" })
})

app.post('/search', async (req: Request, res: Response) => {
  try {
    const {query} = req.body;
    const retriver = vectorStore.asRetriever(2);
    const result = await retriver.invoke(query);

    const SYSTEM_PROMPT = `You are a helpful assistant for answering questions related to programming.
    Do not format the answer using bullets, stars, markdown, or headings.
Respond in clear, natural paragraph text only.
     You have access to the following pieces of context:
                ${JSON.stringify(result)}

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

    return res.status(200).json({ success: true, message: response.choices[0].message.content, docs: result })

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