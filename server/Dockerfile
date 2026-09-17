FROM node:20-alpine

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY server.ts worker.ts ./

RUN npm run build

EXPOSE 8000

ENV PORT=8000
ENV RUN_WORKER=true

CMD ["npm", "start"]
