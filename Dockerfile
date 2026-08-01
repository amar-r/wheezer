FROM node:20-alpine

WORKDIR /app

# Copy the lockfile too and use `npm ci`, so image builds are reproducible and
# match the committed dependency tree exactly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

# Data volume for persistence. Owned by the built-in `node` user (uid 1000) so
# the container never has to run as root to write entries.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

ENV PORT=8420
ENV DATA_DIR=/app/data

EXPOSE 8420

USER node

CMD ["node", "server.js"]
