FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY server.mjs ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
