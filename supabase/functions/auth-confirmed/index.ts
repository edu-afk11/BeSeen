const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <title>Email confirmed · BeSeen</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff9f5;color:#171310;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px}.card{width:min(100%,430px);text-align:center}.mark{width:92px;height:92px;border-radius:28px;background:#f98f73;margin:0 auto 30px;display:grid;place-items:center;color:white;font-size:46px;font-weight:300}.brand{font-size:18px;font-weight:700;letter-spacing:-.02em;margin-bottom:42px}h1{font-size:34px;line-height:1.05;letter-spacing:-.04em;margin:0 0 14px}p{color:#786d66;font-size:17px;line-height:1.5;margin:0 auto 30px;max-width:350px}.button{display:block;width:100%;padding:16px 20px;border-radius:16px;background:#f98f73;color:white;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.04em}.hint{font-size:13px;margin-top:18px;color:#a59992}.error{display:none;color:#b64141}</style>
</head>
<body>
  <main class="card">
    <div class="mark">✓</div>
    <div class="brand">BeSeen</div>
    <h1 id="title">Email confirmed</h1>
    <p id="copy">Your account is ready. Returning to BeSeen.</p>
    <a class="button" id="open" href="beseen://auth/callback">OPEN BESEEN</a>
    <p class="hint">If the app does not open, return to BeSeen and sign in.</p>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const error = params.get('error_description') || fragment.get('error_description');
    const flow = params.get('flow') === 'recovery' ? 'recovery' : 'signup';
    params.delete('flow');
    params.set('type', flow);
    const callback = 'beseen://auth/callback?' + params.toString() + location.hash;
    document.getElementById('open').href = callback;
    if (flow === 'recovery') {
      document.title = 'New password · BeSeen';
      document.getElementById('title').textContent = 'Change your password';
      document.getElementById('copy').textContent = 'Opening BeSeen so you can choose a new password.';
      document.getElementById('open').textContent = 'OPEN BESEEN';
    }
    if (error) {
      document.getElementById('title').textContent = 'This link is not valid';
      document.getElementById('copy').textContent = decodeURIComponent(error.replace(/\\+/g, ' ')) + '. Request a new email from BeSeen.';
      document.getElementById('open').textContent = 'RETURN TO BESEEN';
    } else {
      setTimeout(() => { location.href = callback; }, 350);
    }
  </script>
</body>
</html>`;

Deno.serve(() => new Response(html, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  },
}));
