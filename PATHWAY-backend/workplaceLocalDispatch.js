function localDispatchAllowed(db, env) {
  const local = value => /^(127\.0\.0\.1|localhost):[1-9]\d{0,4}$/.test(value || '') && Number(value.split(':')[1]) <= 65535;
  return env.PATHWAY_WORKPLACE_FAKE_DISPATCH === '1' && env.PATHWAY_LOCAL_WORKFLOW === '1'
    && env.GOOGLE_CLOUD_PROJECT === 'demo-pathway-security' && db?.projectId === 'demo-pathway-security'
    && local(env.FIRESTORE_EMULATOR_HOST) && local(env.FIREBASE_AUTH_EMULATOR_HOST)
    && env.NODE_ENV !== 'production' && !env.K_SERVICE;
}
function createWorkplaceLocalDispatch({ db, env = process.env, runBatch, runRecovery, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  const allowed = localDispatchAllowed(db, env);
  let started = false, stopped = false, timer, active, pending = false;
  function wake() {
    if (!allowed || !started || stopped) return Promise.resolve();
    if (active) { pending = true; return active; }
    // Defer execution until active is assigned, including synchronously throwing workers.
    active = Promise.resolve().then(async () => {
      if (!stopped && runRecovery) { try { await runRecovery(); } catch { /* Durable recovery can retry on the next wake. */ } }
      for (let batches = 0; batches < 4 && !stopped; batches++) {
        pending = false;
        let result;
        try { result = await runBatch({ limit: 5 }); } catch { break; }
        if (result?.status !== 'complete' || (!pending && result.processed < 5)) break;
      }
    }).finally(() => { active = undefined; pending = false; });
    return active;
  }
  return {
    start() {
      if (!allowed || started || stopped) return active || Promise.resolve();
      started = true; timer = setIntervalFn(wake, 900000); timer?.unref?.();
      return wake();
    },
    wake,
    stop() { if (stopped) return; stopped = true; pending = false; if (timer !== undefined) clearIntervalFn(timer); },
  };
}
module.exports = { createWorkplaceLocalDispatch, localDispatchAllowed };
