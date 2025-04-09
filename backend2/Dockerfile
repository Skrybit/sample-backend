# Base stage
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Define build argument for APP_VERSION
ARG APP_VERSION=unknown
ENV APP_VERSION=${APP_VERSION}

# Development stage
FROM base AS development
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
ENV NODE_ENV=development
EXPOSE 3001
CMD ["npm", "run", "start:dev"]  # Adjust this if your dev script is different

# Production dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps --production

# Production builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build  # Adjust this if your build script is different

# Production runner
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

COPY --from=builder /app/dist ./dist  # Adjust if your build output isn’t in /dist
COPY --from=builder /app/*.db .       # Copies SQLite databases
COPY --from=builder /app/package.json ./package.json

USER nodeuser
EXPOSE 3001
CMD ["node", "dist/server.js"]  # Adjust this if your entry point is different