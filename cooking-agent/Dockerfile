FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --omit=dev

COPY dist/ ./dist/

RUN mkdir -p /app/data

EXPOSE 9000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]