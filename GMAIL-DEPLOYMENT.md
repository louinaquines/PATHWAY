# Gmail HTTPS transport — no billing enabled

The backend supports two explicit delivery modes:

- `MAIL_PROVIDER=smtp` (default): existing SMTP configuration, retained for local QA.
- `MAIL_PROVIDER=gmail`: Google's HTTPS Gmail API. No automatic SMTP fallback or automatic resend after a failed/uncertain send.

## Secure deployment configuration

In the backend hosting platform's secret/environment settings, configure:

```text
MAIL_PROVIDER=gmail
GMAIL_FROM=louinaquines@gmail.com
GMAIL_CLIENT_ID=<authorized client ID>
GMAIL_CLIENT_SECRET=<authorized client secret>
GMAIL_REFRESH_TOKEN=<send-only refresh token>
EVALUATION_WEB_URL=https://<public staff frontend host>
```

The OAuth values are saved locally in `PATHWAY-backend/.env.gmail-oauth.json`. Do not upload that file to Git, the frontend, chat, screenshots, or the Docker image. Enter deployment secrets privately. Production never auto-loads that local file. Keep backend Firebase identity, Cloudinary settings and exact CORS origins configured separately; email configuration does not replace production preflight.

Run `npm run check:email` and `npm run check:production` with the intended environment. These validate shape only, not real delivery. The running demo is not switched automatically by adding this transport.

## Acceptance evidence and limits

On October 10, 2026, Google accepted one synthetic message to the explicitly approved sender/test recipient. Subject: `PATHWAY — Gmail API delivery test`. No student data, attachment or evaluation token was sent. Inbox arrival still requires recipient confirmation. The ignored `.env.gmail-delivery-test.json` receipt prevents accidentally replaying this test; do not remove it to blindly retry.

Transport/configuration/preflight tests passed 17/17; isolated backend/security workflow tests passed 35/35 with local provider stubs. Gmail attachment MIME handling is tested with synthetic bytes, not yet real-provider attachment acceptance. No public backend/frontend deployment, live evaluation invitation or supervisor submission acceptance is claimed.

The Gmail send-only scope does not permit reading the inbox. Google External Testing refresh tokens generally expire after seven days, and may also be revoked; complete the appropriate authorization lifecycle review before unattended use. Free backend availability, account onboarding and quotas must be verified separately. No paid plan, billing activation or quota increase is authorized.

Sources: [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [OAuth token lifetime](https://developers.google.com/identity/protocols/oauth2), [Gmail usage limits](https://developers.google.com/workspace/gmail/api/reference/quota).
