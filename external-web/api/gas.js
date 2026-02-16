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

    // ---- ステップ 1: 元のリクエスト（POST or GET）を GAS に送る ----
    const firstResponse = await fetch(target.toString(), {
      method,
      headers: { 'Content-Type': contentType },
      body,
      redirect: 'manual'
    });

    // ---- ステップ 2: リダイレクトを GET で追跡して結果を取得する ----
    // GAS は処理後に 302 で結果 URL を返す。結果は GET で取りに行く。
    let response = firstResponse;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        response = await fetch(location, {
          method: 'GET',
          redirect: 'follow'
        });
      }
    }

    const text = await response.text();

    // HTML が返ってきた場合のエラーハンドリング
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE')) {
      res.status(502).json({
        ok: false,
        error: 'GAS が HTML を返しました。Apps Script の Web アプリが正しくデプロイされているか確認してください。',
        hint: 'Apps Script → デプロイ → 新しいデプロイ → アクセスできるユーザー を「全員」に設定してください。'
      });
      return;
    }

    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
