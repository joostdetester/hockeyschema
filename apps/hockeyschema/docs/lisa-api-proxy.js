// Lokale dev-only proxy zodat "Try it out" in lisa-api.html echte responses
// terugkrijgt van de "my"-endpoints. Een browser mag de Origin-header nooit
// zelf zetten (forbidden header, Fetch-spec), maar LISA accepteert een
// x-lisa-auth-token alleen met Origin/Referer van mijn.lisahockey.nl (zie de
// notes bij X-LISA-AUTH-TOKEN in lisa-api.yaml) - deze proxy draait
// server-side, waar die beperking niet geldt, en zet die headers alsnog goed
// voordat hij doorstuurt naar api.lisahockey.nl. Serveert ook meteen
// lisa-api.html zelf (zie GET_DOCS_PATHS), zodat de pagina en de API-calls
// vanaf hetzelfde origin komen - geen file://-CORS-gedoe nodig. Vult daarbij
// meteen de Authorize-velden X-LISA-AUTH-TOKEN en LISA_MY_AUTHORIZATION_
// HEADER in (via SwaggerUIBundle's preauthorizeApiKey), met waarden uit
// tests/hockeyschema/.env - die worden alleen server-side ingelezen en in de
// response geïnjecteerd, nooit in het statische lisa-api.html-bestand zelf
// geschreven, dus dat blijft geheim-vrij (ook als het ooit in git komt).
//
// Starten:  node lisa-api-proxy.js  (of dubbelklik start-lisa-docs.bat)
// Dan in Swagger UI (bovenaan bij "Servers") http://localhost:8787 kiezen
// i.p.v. https://api.lisahockey.nl.
//
// Alleen voor lokaal gebruik - bindt bewust aan 127.0.0.1, nooit op internet
// zetten (stuurt elke Authorization/x-lisa-auth-token die je meegeeft
// klakkeloos door).

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const UPSTREAM_HOST = 'api.lisahockey.nl';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';
const DOCS_FILE = path.join(__dirname, 'lisa-api.html');
const GET_DOCS_PATHS = new Set(['/', '/lisa-api.html']);
const TEST_ENV_FILE = path.join(__dirname, '..', '..', '..', 'tests', 'hockeyschema', '.env');

function loadEnv(file) {
  const out = {};
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function injectPreauthorize(html) {
  const env = loadEnv(TEST_ENV_FILE);
  const token = env['X-LISA-AUTH-TOKEN'];
  const myAuth = env['LISA_MY_AUTHORIZATION_HEADER'];
  const clubAuth = env['LISA_CLUB_AUTHORIZATION_HEADER'];
  if (!token && !myAuth && !clubAuth) return html;
  const calls = [
    token && `window.ui.preauthorizeApiKey('X-LISA-AUTH-TOKEN', ${JSON.stringify(token)});`,
    myAuth && `window.ui.preauthorizeApiKey('LISA_MY_AUTHORIZATION_HEADER', ${JSON.stringify(myAuth)});`,
    clubAuth && `window.ui.preauthorizeApiKey('LISA_CLUB_AUTHORIZATION_HEADER', ${JSON.stringify(clubAuth)});`,
  ].filter(Boolean).join('\n    ');
  const script = `<script>\n  window.addEventListener('load', function () {\n    if (!window.ui) return;\n    ${calls}\n  });\n</script>\n`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && GET_DOCS_PATHS.has(req.url)) {
    fs.readFile(DOCS_FILE, 'utf8', (err, data) => {
      if (err) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('lisa-api.html niet gevonden naast lisa-api-proxy.js.'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(injectPreauthorize(data));
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  const headers = { ...req.headers };
  delete headers.host;
  headers.origin = 'https://mijn.lisahockey.nl';
  headers.referer = 'https://mijn.lisahockey.nl/';
  headers['user-agent'] = BROWSER_USER_AGENT;

  const upstreamReq = https.request(
    { hostname: UPSTREAM_HOST, path: req.url, method: req.method, headers },
    upstreamRes => {
      // Upstream stuurt zijn eigen Access-Control-Allow-Origin: https://mijn.
      // lisahockey.nl mee (want wij spoofen die Origin hierboven) - die moet
      // overschreven worden, anders matcht 'm niet met waar Swagger UI zelf
      // op draait en blokkeert de browser het lezen van deze response alsnog.
      const responseHeaders = { ...upstreamRes.headers, ...corsHeaders(req) };
      res.writeHead(upstreamRes.statusCode, responseHeaders);
      upstreamRes.pipe(res);
    }
  );
  upstreamReq.on('error', err => {
    res.writeHead(502, { 'content-type': 'text/plain', ...corsHeaders(req) });
    res.end('Proxy kon api.lisahockey.nl niet bereiken: ' + err.message);
  });
  req.pipe(upstreamReq);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LISA-proxy actief op http://localhost:${PORT} (forward naar https://${UPSTREAM_HOST})`);
});
