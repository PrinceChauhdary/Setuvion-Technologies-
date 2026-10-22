FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data

COPY package.json server.js index.html styles.css script.js ./
COPY assets/ ./assets/

RUN addgroup -S web && adduser -S -G web web \
    && mkdir -p /data \
    && chown -R web:web /app /data

USER web
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server.js"]
