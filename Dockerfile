# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- Build: Spiel + Server
FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Ohne .git im Build-Kontext: Version und Commit kommen aus der Datei VERSION (falls vorhanden),
# sonst steht als Commit "unbekannt" (siehe scripts/version.mjs)
RUN npm run build && npm run build:server

# ---------------------------------------------------------------- Laufzeit
# Der Server ist mit esbuild gebündelt (server.mjs + Worker für die Replay-Nachsimulation) und
# nutzt nur Node-Bordmittel (node:http, node:sqlite, node:worker_threads) – daher keine
# node_modules im Runtime-Image.
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/oganesson.db
WORKDIR /app
COPY --from=build /src/server/dist/server.mjs /src/server/dist/verify-worker.mjs ./server/dist/
COPY --from=build /src/dist/oganesson.html /src/dist/replay.html /src/dist/third-party-licenses.txt ./dist/
# Icons und Vorschaubilder für Link-Vorschau und Home-Bildschirm
COPY --from=build /src/assets/public ./assets/public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server/dist/server.mjs"]
