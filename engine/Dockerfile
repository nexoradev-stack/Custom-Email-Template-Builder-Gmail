FROM node:20-bookworm-slim

# Chromium + fonts for template thumbnails (Liberation Sans matches Arial's layout)
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

USER node
CMD ["node", "src/server.js"]
