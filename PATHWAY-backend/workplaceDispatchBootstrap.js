const { localDispatchAllowed } = require('./workplaceLocalDispatch');
function createServerWorkplaceDispatch({ db, env = process.env,
  loadFake = () => require('./security-tests/workplace-local-runtime'),
  loadControlled = () => require('./security-tests/workplace-controlled-runtime') }) {
  const fake = env.PATHWAY_WORKPLACE_FAKE_DISPATCH === '1', controlled = env.PATHWAY_WORKPLACE_CONTROLLED_CLAUDE === '1';
  if (fake && controlled) return null;
  if (fake && localDispatchAllowed(db, env)) return loadFake().createLocalRuntime({ db, env });
  // Validate local context without copying unrelated environment values (including credentials).
  const local = localDispatchAllowed(db, { PATHWAY_WORKPLACE_FAKE_DISPATCH: '1', PATHWAY_LOCAL_WORKFLOW: env.PATHWAY_LOCAL_WORKFLOW,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT, FIRESTORE_EMULATOR_HOST: env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: env.FIREBASE_AUTH_EMULATOR_HOST, NODE_ENV: env.NODE_ENV, K_SERVICE: env.K_SERVICE });
  if (controlled && local) return loadControlled().createControlledRuntime({ db, env });
  return null;
}
module.exports = { createServerWorkplaceDispatch };
