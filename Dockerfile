FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

# Data volume for persistence
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=8420
ENV DATA_DIR=/app/data

EXPOSE 8420

CMD ["node", "server.js"]
