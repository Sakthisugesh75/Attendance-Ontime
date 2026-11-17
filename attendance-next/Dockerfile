# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS run
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=6001 HOSTNAME=0.0.0.0
COPY --from=build /app ./
RUN mkdir -p storage
EXPOSE 6001
# Apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 6001"]
