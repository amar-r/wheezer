# Node 20 went end of life on 2026-04-30 and stopped getting security fixes,
# which is where most base-image CVEs come from. 24 is active LTS until 2028.
FROM node:24-alpine

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
