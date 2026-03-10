# Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
# ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

# Build context: repository root (cd ../.. && docker build -f packages/ecl-slack-bot/Dockerfile .)

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Copy workspace root files needed for npm install
COPY package.json package-lock.json ./

# Copy only the packages needed (ecl-core + ecl-slack-bot)
COPY packages/ecl-core/package.json packages/ecl-core/
COPY packages/ecl-slack-bot/package.json packages/ecl-slack-bot/

# Install dependencies (workspace-aware, production + dev for compilation)
RUN npm ci --ignore-scripts

# Copy source for ecl-core and ecl-slack-bot
COPY packages/ecl-core/ packages/ecl-core/
COPY packages/ecl-slack-bot/ packages/ecl-slack-bot/

# Compile ecl-core (tsc -b directly — generated ANTLR parser files are already
# in the source tree, so we skip the precompile antlr4ts hook which needs Java)
# Then compile ecl-slack-bot
RUN cd packages/ecl-core && npx tsc -b && cd ../ecl-slack-bot && npx tsc -b

# ── Stage 2: Production ──────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Non-root user for security
RUN addgroup -S ecl && adduser -S ecl -G ecl

# Copy workspace root files
COPY package.json package-lock.json ./

# Copy package.json for both packages (needed for npm ci)
COPY packages/ecl-core/package.json packages/ecl-core/
COPY packages/ecl-slack-bot/package.json packages/ecl-slack-bot/

# Install production dependencies only
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force

# Copy compiled output from build stage
COPY --from=build /app/packages/ecl-core/dist/ packages/ecl-core/dist/
COPY --from=build /app/packages/ecl-slack-bot/dist/ packages/ecl-slack-bot/dist/

USER ecl

ENV NODE_ENV=production

ENTRYPOINT ["node", "packages/ecl-slack-bot/dist/app.js"]
