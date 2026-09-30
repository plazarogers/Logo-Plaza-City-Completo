# Imagen mínima: Node 22 + SQLite embebido. Un solo proceso, un solo volumen.
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
 && mkdir -p /app/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/plaza-city.db
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
