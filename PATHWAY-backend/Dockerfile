FROM node:22-slim

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js firebaseAdmin.js cloudinaryUploads.js endorsementMail.js gmailMail.js studentAccounts.js evaluationMail.js evaluationForm.js studentInbox.js geofence.js localCloudinaryQa.js productionPreflight.js ./

USER node
EXPOSE 8080
CMD ["npm", "start"]
