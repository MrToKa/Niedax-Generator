# syntax=docker/dockerfile:1.7
FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS deps
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/calculation-engine/package.json packages/calculation-engine/package.json
COPY packages/catalog-import/package.json packages/catalog-import/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/export/package.json packages/export/package.json
COPY database/package.json database/package.json
COPY rules/package.json rules/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
CMD ["pnpm", "--filter", "@niedax/frontend", "dev"]

FROM deps AS build
COPY . .
RUN pnpm --filter @niedax/domain build \
    && pnpm --filter @niedax/frontend build

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS runtime
ENV HOSTNAME=0.0.0.0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /workspace/apps/frontend/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=node:node /workspace/apps/frontend/public ./apps/frontend/public
USER node
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
