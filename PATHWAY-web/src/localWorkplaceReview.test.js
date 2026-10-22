import { localWorkplaceReviewEnabled } from './localWorkplaceReview';
const local = { NODE_ENV: 'test',REACT_APP_WORKPLACE_REVIEW_LOCAL: '1',REACT_APP_LOCAL_EMULATOR: '1',
  REACT_APP_FIREBASE_PROJECT_ID: 'demo-pathway-security',REACT_APP_BACKEND_URL: 'http://127.0.0.1:3100' };
test('local review requires all pinned demo flags and never enables in a production bundle', () => {
  expect(localWorkplaceReviewEnabled(local)).toBe(true);
  for (const [key,value] of [['NODE_ENV','production'],['REACT_APP_WORKPLACE_REVIEW_LOCAL','true'],['REACT_APP_LOCAL_EMULATOR','0'],
    ['REACT_APP_FIREBASE_PROJECT_ID','demo-other'],['REACT_APP_BACKEND_URL','https://production.invalid'],['REACT_APP_BACKEND_URL',undefined]]) {
    expect(localWorkplaceReviewEnabled({ ...local,[key]: value })).toBe(false);
  }
  expect(localWorkplaceReviewEnabled({})).toBe(false);
});
