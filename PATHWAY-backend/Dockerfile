FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js firebaseAdmin.js ./

USER node
EXPOSE 8080
CMD ["npm", "start"]
