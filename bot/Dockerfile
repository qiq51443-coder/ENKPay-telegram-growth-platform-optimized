# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine
RUN addgroup -S botgroup && adduser -S botuser -G botgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN chown -R botuser:botgroup /app
USER botuser
CMD ["node", "dist/index.js"]
