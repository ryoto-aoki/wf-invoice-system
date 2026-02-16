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

    const method = req.method;
    const contentType = req.headers['content-type'] || 'application/json';
    let body = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    let r = await fetch(target.toString(), {
      method,
      headers: { 'Content-Type': contentType },
      body,
      redirect: 'manual'
    });

    // Google Apps Script は 302 リダイレクトを返す。
    // リダイレクト先にも同じメソッド・ボディで再送する（最大 5 回）。
    let redirects = 0;
    while ((r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308) && redirects < 5) {
      const location = r.headers.get('location');
      if (!location) break;
      r = await fetch(location, {
        method,
        headers: { 'Content-Type': contentType },
        body,
        redirect: 'manual'
      });
      redirects++;
    }

    const text = await r.text();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
