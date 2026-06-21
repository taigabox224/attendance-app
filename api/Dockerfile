FROM node:20-bookworm

WORKDIR /app/api

RUN apt-get update \
  && apt-get install -y python3 make g++ sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY api/package*.json ./
RUN npm ci
RUN npm rebuild better-sqlite3 --build-from-source

COPY api ./

CMD ["npm", "run", "dev"]