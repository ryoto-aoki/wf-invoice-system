export default async function handler(req, res) {
  try {
    const gasUrl = process.env.GAS_WEBAPP_URL;
    if (!gasUrl) {
      res.status(500).json({ ok: false, error: 'GAS_WEBAPP_URL is not set' });
      return;
    }

    const target = new URL(gasUrl);

    const incomingUrl = new URL(req.url, 'http://localhost');
    incomingUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));

    const init = {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] || 'application/json' }
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      init.body = body;
    }

    const r = await fetch(target, init);
    const text = await r.text();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
