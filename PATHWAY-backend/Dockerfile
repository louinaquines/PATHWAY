FROM node:22-slim

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js firebaseAdmin.js cloudinaryUploads.js endorsementMail.js gmailMail.js studentAccounts.js evaluationMail.js evaluationEmailTemplate.js evaluationForm.js studentInbox.js geofence.js localCloudinaryQa.js productionPreflight.js ./
COPY dtrReview.js dtrComparison.js coordinatorAnalytics.js attendanceAnalytics.js reviewAnalysis.js ./
COPY companyProfileImport.js ./
COPY anthropicAnalysis.js ./
COPY journalAiReview.js ./
COPY attendanceAiReview.js ./
COPY attendanceExcusedDates.js attendanceRiskAlerts.js attendanceRiskSchedule.js ./
COPY documentAiReview.js ./
COPY companyMailInbox.js ./
COPY localCompanyInbox.js ./
COPY companyTestLink.js ./
COPY companyMailSender.js companyMailReplies.js companyMailAttachment.js announcementEmail.js evaluationOtp.js ./

USER node
EXPOSE 8080
CMD ["npm", "start"]
