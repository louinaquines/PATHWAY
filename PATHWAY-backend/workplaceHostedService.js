// Prepared handlers only: no server registration, environment loading, scheduler or default transport.
const { timingSafeEqual } = require('node:crypto');
function createWorkplaceHostedService(options = {}) {
  const unavailable = () => ({ status: 503, body: { error: 'Workplace service unavailable.' } });
  if (options.enabled !== true) return { handleWake: async () => unavailable(), handleStop: async () => unavailable() };
  const { workplaceSecret, operatorSecret } = options;
  if (options.readinessGate !== true || !/^[a-f0-9]{64}$/.test(workplaceSecret || '')
    || !/^[a-f0-9]{64}$/.test(operatorSecret || '') || workplaceSecret === operatorSecret) throw Error('Separate explicit workplace/operator credentials required.');
  const authorized = (request, secret) => typeof request?.authorization === 'string' && /^Bearer [a-f0-9]{64}$/.test(request.authorization)
    && timingSafeEqual(Buffer.from(request.authorization.slice(7), 'ascii'), Buffer.from(secret, 'ascii'));
  const unauthorized = () => ({ status: 401, body: { error: 'Workplace authorization required.' } });
  let composition;
  return {
    async handleWake(request = {}) {
      if (!authorized(request, workplaceSecret)) return unauthorized();
      try {
        composition ||= require('./workplaceReadinessGate').createReadinessWorkplaceComposition(options);
        return await composition.handle(request);
      } catch { return unavailable(); }
    },
    async handleStop(request = {}) {
      if (!authorized(request, operatorSecret)) return unauthorized();
      if (request.method !== 'POST') return { status: 405, body: { error: 'POST required.' } };
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || body.action !== 'stop')
        return { status: 400, body: { error: 'Exact stop action required.' } };
      try {
        const result = await require('./workplaceHostedControl').createHostedWorkplaceControl(options).stop();
        return { status: 200, body: result };
      } catch { return unavailable(); }
    },
  };
}
function installWorkplaceHostedHttp({ enabled = false, app, service } = {}) {
  if (enabled !== true) return false;
  if (typeof app?.all !== 'function' || typeof service?.handleWake !== 'function' || typeof service?.handleStop !== 'function')
    throw Error('Explicit workplace HTTP dependencies required.');
  const json = require('express').json({ limit: '2kb' });
  for (const [route, method] of [['/internal/workplace/wake', 'handleWake'], ['/internal/workplace/stop', 'handleStop']]) {
    app.all(route, json, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const result = await service[method]({ method: req.method, authorization: req.headers.authorization, body: req.body });
        res.status(result.status).json(result.body);
      } catch { res.status(503).json({ error: 'Workplace service unavailable.' }); }
    }, (error, req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.status(error?.status === 413 ? 413 : 400).json({ error: 'Invalid workplace request.' });
    });
  }
  return true;
}
module.exports = { createWorkplaceHostedService, installWorkplaceHostedHttp };
