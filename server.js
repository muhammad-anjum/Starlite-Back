import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
try {
  const localEnv = readFileSync(join(root, '.env'), 'utf8');
  localEnv.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch {
  // Production hosts provide environment variables through their dashboard.
}
const port = Number(process.env.PORT || 3000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
const inquiryTo = process.env.INQUIRY_TO_EMAIL || '';
const resendKey = process.env.RESEND_API_KEY || '';
const resendFrom = process.env.RESEND_FROM_EMAIL || 'Website Inquiry <onboarding@resend.dev>';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(response, status, data) {
  response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
  response.setHeader('Vary', 'Origin');
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) request.destroy();
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function sendInquiry(fields) {
  if (!inquiryTo || !resendKey) {
    throw new Error('Email delivery is not configured on the server.');
  }

  const safe = (value, fallback = 'Not provided') => String(value || fallback).trim().slice(0, 2_000);
  const name = safe(fields.name, 'Website visitor');
  const email = safe(fields.email, 'Not provided');
  const age = safe(fields.age);
  const care = safe(fields.care);
  const message = safe(fields.message);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [inquiryTo],
      reply_to: email.includes('@') ? email : undefined,
      subject: `New childcare inquiry from ${name}`,
      text: [
        'A new inquiry was submitted through the Starlite Childcare website.',
        '',
        `Parent or guardian: ${name}`,
        `Visitor email: ${email}`,
        `Child age: ${age}`,
        `Care needed: ${care}`,
        '',
        message,
      ].join('\n'),
    }),
  });

  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requested = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = normalize(join(publicRoot, requested));
  if (!safePath.startsWith(publicRoot)) return sendJson(response, 403, { error: 'Forbidden' });

  try {
    const file = await readFile(safePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(safePath)] || 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/inquiries') {
    try {
      const fields = JSON.parse(await readBody(request));
      if (!fields.name || !fields.email || !String(fields.email).includes('@')) {
        return sendJson(response, 400, { error: 'Please provide a name and valid email address.' });
      }
      await sendInquiry(fields);
      return sendJson(response, 200, { ok: true });
    } catch (error) {
      console.error(error);
      return sendJson(response, 500, { error: 'The inquiry could not be sent right now. Please try again shortly.' });
    }
  }

  return serveStatic(request, response);
});

server.listen(port, '0.0.0.0', () => console.log(`Starlite Childcare site running on port ${port}`));
