FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json README.md LICENSE ./
COPY src ./src
RUN npm pack --silent && mv mcp-transport-bridge-*.tgz package.tgz

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /build/package.tgz /tmp/package.tgz
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund /tmp/package.tgz \
    && rm /tmp/package.tgz && npm cache clean --force
USER node
EXPOSE 3000
ENTRYPOINT ["/app/node_modules/.bin/mcp-transport-bridge"]
