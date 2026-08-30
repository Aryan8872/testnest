# ==========================================
# Multi-stage Production Dockerfile for NestJS
# ==========================================

# ------------------------------------------
# Stage 1: Build & Dependencies
# ------------------------------------------
FROM node:22-bullseye-slim AS builder

WORKDIR /usr/src/app

# Install OpenSSL required by Prisma CLI and engine binaries
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma.config.ts ./
COPY nest-cli.json ./
COPY prisma ./prisma/

# Install full dependencies (including devDependencies for TypeScript build)
RUN npm ci --legacy-peer-deps

# Copy source code and templates
COPY src ./src/

# Generate Prisma Client and build TypeScript project
RUN npx prisma generate
RUN npm run build

# Prune devDependencies to keep production image light
RUN npm prune --production --legacy-peer-deps

# ------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------
FROM node:22-bullseye-slim AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies required for Headless Chromium (Puppeteer PDF generation) and Prisma
RUN apt-get update -y && apt-get install -y \
    openssl \
    ca-certificates \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the installed Chromium executable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.ts ./
COPY --from=builder /usr/src/app/src/templates ./dist/src/templates

# Copy entrypoint script and ensure execution permissions
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Ensure non-root user permissions for security
RUN chown -R node:node /usr/src/app

# Run as non-root user
USER node

# Expose API port
EXPOSE 3000

# Execute entrypoint (runs migrations + optional seed, then launches app)
ENTRYPOINT ["./docker-entrypoint.sh"]
