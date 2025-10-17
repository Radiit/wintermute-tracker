# Node 20, kecil & cepat
FROM node:20-alpine

# Set workdir
WORKDIR /app

# Copy package files dulu (agar layer cache bagus)
COPY package*.json ./

# Install deps (production saja)
RUN npm ci --omit=dev

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Env default (bisa di-override via secrets)
ENV PORT=3000 NODE_ENV=production

# Healthcheck optional (app sudah punya /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

EXPOSE 3000
CMD ["node", "server/index.js"]
