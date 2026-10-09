import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { startServer } from '../server.mjs';

const running = [];

async function start(options) {
    const started = await startServer(options);
    running.push(started.server);
    return started;
}

function occupy(port) {
    return new Promise((resolve) => {
        const blocker = createServer();
        blocker.listen(port, '127.0.0.1', () => {
            running.push(blocker);
            resolve(blocker.address().port);
        });
    });
}

afterEach(async () => {
    await Promise.all(running.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe('startServer', () => {
    it('serves the app on localhost, so Web Bluetooth sees a secure page', async () => {
        const { url } = await start({ port: 0 });
        expect(url).toMatch(/^http:\/\/localhost:\d+\/$/);

        const response = await fetch(url);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('<title>Labelbench</title>');
    });

    it('only serves the app\'s own files', async () => {
        const { url } = await start({ port: 0 });
        expect((await fetch(new URL('package.json', url))).status).toBe(404);
        expect((await fetch(new URL('src/app.js', url))).status).toBe(200);
    });

    it('fails when the port is taken and no fallback is allowed', async () => {
        const taken = await occupy(0);
        await expect(startServer({ port: taken })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    });

    it('picks a free port when the wanted one is taken and fallback is allowed', async () => {
        const taken = await occupy(0);
        const { url, port } = await start({ port: taken, fallback: true });
        expect(port).not.toBe(taken);
        expect(url).toBe(`http://localhost:${port}/`);
    });
});
