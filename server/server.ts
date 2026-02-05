import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import  {Queue}  from 'bullmq';

const queue = new Queue('file-upload-queue',{connection : {
        host : 'localhost',
        port: 6379,
    }});


const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const uniquePreffix = Date.now() + "-" + Math.round(Math.random()*1E9)
    cb(null, `${uniquePreffix}-${file.originalname}`)
  }
})

const upload = multer({ storage })


const app = express();

app.use(cors())

app.get('/', (req: Request, res: Response) => {
    res.send('Server running')
})

app.post('/upload/pdf',upload.single('pdf'),(req: Request, res: Response) => {
    queue.add('file-ready',JSON.stringify({
      fileName : req.file?.originalname,
      source: req.file?.destination,
      path: req.file?.path,
    }));
    return res.json({success: true , message :"File uploaded"})
})

app.listen(8000, () => {
    console.log("Server is running on the port 8000")
})