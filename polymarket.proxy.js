#!/usr/bin/env node
/**
 * polymarket.proxy.js — NinjaScores Local CORS Proxy
 *
 * Run: node polymarket.proxy.js
 * Port: 9878
 *
 * Proxies requests to gamma-api.polymarket.com and adds CORS headers
 * so the browser can fetch market data from localhost.
 *
 * Routes:
 *   GET /proxy/markets        → gamma-api.polymarket.com/markets/keyset
 *   GET /proxy/markets/:id    → gamma-api.polymarket.com/markets/:id
 *   GET /proxy/events         → gamma-api.polymarket.com/events
 *   GET /proxy/events/:id     → gamma-api.polymarket.com/events/:id
 *   GET /health               → { ok: true }
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT        = 9878;
const GAMMA_HOST  = 'gamma-api.polymarket.com';
const ALLOWED_ORIGIN = '*'; // lock down to 'http://localhost:9876' in production

// ── Route map ─────────────────────────────────────────────────────────────────
// Maps /proxy/<local-path> → /<upstream-path>
function resolveUpstream(pathname, query) {
  // /proxy/markets → /markets/keyset (new endpoint)
  if (pathname === '/proxy/markets' || pathname === '/proxy/markets/') {
    return '/markets/keyset?' + query;
  }
  // /proxy/markets/:id → /markets/:id
  if (pathname.startsWith('/proxy/markets/')) {
    const id = pathname.slice('/proxy/markets/'.length);
    return `/markets/${id}`;
  }
  // /proxy/events → /events
  if (pathname === '/proxy/events' || pathname === '/proxy/events/') {
    return '/events?' + query;
  }
  // /proxy/events/:id → /events/:id
  if (pathname.startsWith('/proxy/events/')) {
    const id = pathname.slice('/proxy/events/'.length);
    return `/events/${id}`;
  }
  // /proxy/series → /series (with query)
  if (pathname === '/proxy/series' || pathname === '/proxy/series/') {
    return '/series?' + query;
  }
  // /proxy/series/:id → /series/:id
  if (pathname.startsWith('/proxy/series/')) {
    const id = pathname.slice('/proxy/series/'.length);
    return `/series/${id}`;
  }
  // /proxy/sports → /sports
  if (pathname === '/proxy/sports' || pathname === '/proxy/sports/') {
    return '/sports';
  }
  return null;
}

// ── CORS headers ───────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Content-Type':                 'application/json',
  };
}

// ── Proxy a request upstream ───────────────────────────────────────────────────
function proxyRequest(upstreamPath, res) {
  const options = {
    hostname: GAMMA_HOST,
    port:     443,
    path:     upstreamPath,
    method:   'GET',
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'NinjaScores-Proxy/1.0',
    },
  };

  const req = https.request(options, (upstream) => {
    let body = '';
    upstream.on('data', chunk => (body += chunk));
    upstream.on('end', () => {
      res.writeHead(upstream.statusCode, corsHeaders());
      res.end(body);
    });
  });

  req.on('error', (err) => {
    console.error('[proxy] Upstream error:', err.message);
    res.writeHead(502, corsHeaders());
    res.end(JSON.stringify({ error: 'Upstream error', message: err.message }));
  });

  req.setTimeout(15000, () => {
    req.abort();
    res.writeHead(504, corsHeaders());
    res.end(JSON.stringify({ error: 'Gateway timeout' }));
  });

  req.end();
}

// ── HTTP server ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.search ? parsed.search.slice(1) : '';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, corsHeaders());
    res.end(JSON.stringify({ ok: true, upstream: GAMMA_HOST, ts: new Date().toISOString() }));
    return;
  }

  // Proxy routes
  const upstreamPath = resolveUpstream(pathname, query);
  if (upstreamPath) {
    console.log(`[proxy] ${req.method} ${pathname} → https://${GAMMA_HOST}${upstreamPath}`);
    proxyRequest(upstreamPath, res);
    return;
  }

  // 404
  res.writeHead(404, corsHeaders());
  res.end(JSON.stringify({ error: 'Route not found', path: pathname }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🎾 NinjaScores Polymarket Proxy running on http://localhost:${PORT}`);
  console.log(`   Upstream: https://${GAMMA_HOST}`);
  console.log(`\n   Routes:`);
  console.log(`   GET /proxy/markets?active=true&limit=100&...`);
  console.log(`   GET /proxy/markets/:id`);
  console.log(`   GET /proxy/events?tag=soccer&limit=50`);
  console.log(`   GET /health\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} already in use. Kill the existing process first:\n   lsof -ti:${PORT} | xargs kill\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
