export function localWorkplaceReviewEnabled(env = {
  NODE_ENV: process.env.NODE_ENV,
  REACT_APP_WORKPLACE_REVIEW_LOCAL: process.env.REACT_APP_WORKPLACE_REVIEW_LOCAL,
  REACT_APP_LOCAL_EMULATOR: process.env.REACT_APP_LOCAL_EMULATOR,
  REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
}) {
  return env.NODE_ENV !== 'production' && env.REACT_APP_WORKPLACE_REVIEW_LOCAL === '1'
    && env.REACT_APP_LOCAL_EMULATOR === '1' && env.REACT_APP_FIREBASE_PROJECT_ID === 'demo-pathway-security'
    && env.REACT_APP_BACKEND_URL === 'http://127.0.0.1:3100';
}
