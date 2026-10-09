// A tiny local web server for Labelbench. No dependencies, no internet needed.
// It only listens on this computer (127.0.0.1), and only serves the app's own files.
//
//   npm start               starts the server and opens Chrome
//   npm start -- --no-open  starts the server only
//   PORT=8080 npm start     uses another port
//
// The desktop app (electron/main.js) imports startServer() and runs the same server.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5511;
const HOST = '127.0.0.1';

// Only these folders (and index.html) can be fetched.
const ALLOWED = [
    'index.html',
    'src/',
    'examples/',
    'node_modules/@bradycorporation/brady-web-sdk/dist/',
    'node_modules/bwip-js/dist/',
    'node_modules/exceljs/dist/',
];

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

async function handle(request, response) {
    try {
        const url = new URL(request.url, `http://${HOST}`);
        let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        if (path === '') path = 'index.html';

        const clean = normalize(path).split(sep).join('/');
        const allowed = !clean.startsWith('..') && ALLOWED.some((prefix) => clean === prefix || clean.startsWith(prefix));
        if (!allowed) return send(response, 404, 'Not found');

        const file = join(ROOT, clean);
        if (!(await stat(file)).isFile()) return send(response, 404, 'Not found');

        response.writeHead(200, {
            'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        response.end(await readFile(file));
    } catch {
        send(response, 404, 'Not found');
    }
}

function send(response, status, text) {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(text);
}

/**
 * Start the server. Resolves with { server, port, url } once it is listening.
 * With `fallback`, a busy port is swapped for any free one instead of failing.
 */
export function startServer({ port = PORT, fallback = false } = {}) {
    return new Promise((resolvePromise, reject) => {
        const server = createServer(handle);

        server.once('error', (error) => {
            if (error.code === 'EADDRINUSE' && fallback && port !== 0) {
                startServer({ port: 0 }).then(resolvePromise, reject);
            } else {
                reject(error);
            }
        });

        server.listen(port, HOST, () => {
            const actual = server.address().port;
            // Web Bluetooth only works on secure pages; "localhost" counts as secure, so use that name.
            resolvePromise({ server, port: actual, url: `http://localhost:${actual}/` });
        });
    });
}

/**
 * Open the app in a browser that has Web Bluetooth. On macOS the default browser is often
 * Safari, which has none, so ask for Chrome first. Elsewhere the default browser is used.
 */
function openInBrowser(url) {
    const ignore = () => {};
    if (process.platform === 'darwin') {
        execFile('open', ['-a', 'Google Chrome', url], (error) => {
            if (error) execFile('open', [url], ignore);
        });
    } else if (process.platform === 'win32') {
        execFile('rundll32', ['url.dll,FileProtocolHandler', url], ignore);
    } else {
        execFile('xdg-open', [url], ignore);
    }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    try {
        const { url } = await startServer();
        console.log(`Labelbench is running at ${url}`);
        console.log('Keep this window open while printing. Press Ctrl+C to stop.');

        if (!process.argv.includes('--no-open')) openInBrowser(url);
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Is Labelbench already running? Try http://localhost:${PORT}/`);
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}
