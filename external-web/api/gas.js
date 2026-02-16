export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

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

    // GAS は 302 リダイレクトを返す。redirect: 'follow' だと POST→GET に変わるため、
    // 手動でリダイレクトを追い、POST のまま送り直す。
    let url = target.toString();
    let response;
    for (let i = 0; i < 6; i++) {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': contentType },
        body,
        redirect: 'manual'
      });

      const status = response.status;
      if (status >= 300 && status < 400) {
        const location = response.headers.get('location');
        if (location) {
          url = location;
          continue;
        }
      }
      break;
    }

    const text = await response.text();

    // GAS がリダイレクト後に HTML を返した場合（ログイン画面など）を検知
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
      res.status(502).json({
        ok: false,
        error: 'GAS が HTML を返しました。Apps Script の Web アプリが正しくデプロイされているか、アクセス権限を確認してください。',
        hint: 'Apps Script → デプロイ → ウェブアプリ → アクセスできるユーザー を「全員」に設定してください。',
        status: response.status,
        url: url
      });
      return;
    }

    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
