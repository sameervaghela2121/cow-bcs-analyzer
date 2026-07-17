FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Cloud Run injects PORT (defaults to 8080); config/env.js already reads
# process.env.PORT with a fallback, so no hardcoded value is needed here.
EXPOSE 8080

CMD ["node", "src/server.js"]
