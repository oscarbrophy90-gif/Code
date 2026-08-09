# The game server, ready to run anywhere that takes a container.
#
# Only the server and the shared package go in: the client is a static file the
# player already has, and nothing here serves it. Node runs the TypeScript
# directly with --experimental-strip-types, so there is no build step to get
# wrong — the container runs the same source the tests run against.
FROM node:22-slim

WORKDIR /app

# The workspace manifests first, so a dependency install is cached and only
# redone when the dependencies themselves change.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# The server needs `ws`; nothing here needs the client's build toolchain.
RUN npm ci --omit=dev --workspace=@hoops/server --include-workspace-root

COPY shared/ shared/
COPY server/ server/

# Hosts hand the port in through the environment. Binding 0.0.0.0 is what makes
# the socket reachable from outside the container at all.
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

# Records go here. Mount a volume at this path or they are thrown away with the
# container on every deploy — the ladder would quietly start over each push.
ENV HOOPS_DATA_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8787

# The health endpoint is the same one the game's Settings screen probes, so a
# platform health check and a player pressing "Test connection" agree.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
