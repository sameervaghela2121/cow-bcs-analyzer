# Vite bakes VITE_* env vars into the static bundle at build time, so the
# backend/AI-backend Cloud Run URLs must be known before this build runs -
# the deploy workflow builds this image last, after those two services
# exist, passing their URLs in as build args.
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_AI_BACKEND_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AI_BACKEND_URL=${VITE_AI_BACKEND_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Cloud Run injects PORT (defaults to 8080 locally); the official nginx
# image's entrypoint already runs envsubst over templates/*.template on
# startup, substituting ${PORT} into the real config.
ENV PORT=8080
EXPOSE 8080
