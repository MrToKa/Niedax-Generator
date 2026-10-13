# syntax=docker/dockerfile:1.7
FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS deps
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
CMD ["pnpm", "--filter", "@niedax/backend", "dev"]

FROM deps AS acceptance
COPY . .
CMD ["pnpm", "exec", "vitest", "run", "--config", "vitest.integration.config.ts", "--no-file-parallelism", "apps/backend/tests/project-flow.integration.test.ts", "apps/backend/tests/stage10-postgres.integration.test.ts"]

FROM deps AS build
COPY . .
RUN pnpm --filter @niedax/domain build \
    && pnpm --filter @niedax/calculation-engine build \
    && pnpm --filter @niedax/catalog-import build \
    && pnpm --filter @niedax/export build \
    && pnpm --filter @niedax/backend build
RUN pnpm --filter @niedax/backend deploy --prod /runtime

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /workspace/apps/backend
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /runtime ./
COPY --from=build --chown=node:node /workspace/package.json /workspace/package.json
COPY --from=build --chown=node:node /workspace/catalogue /workspace/catalogue
COPY --from=build --chown=node:node /workspace/rules/manifest.json /workspace/rules/manifest.json
USER node
ARG NIEDAX_GIT_COMMIT=""
ARG NIEDAX_BUILD_TIMESTAMP=""
ENV NIEDAX_GIT_COMMIT=$NIEDAX_GIT_COMMIT NIEDAX_BUILD_TIMESTAMP=$NIEDAX_BUILD_TIMESTAMP
EXPOSE 3001
CMD ["node", "dist/server.js"]
