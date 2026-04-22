import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const devProxyAssetBasePlugin = (assetBase: string | undefined): Plugin => {
  const normalizedBase = assetBase?.replace(/\/$/, '');

  return {
    name: 'dev-proxy-asset-base',
    apply: 'serve',
    configureServer(server) {
      if (!normalizedBase) return;

      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith(`${normalizedBase}/`)) {
          request.url = request.url.slice(normalizedBase.length);

          const requestWithOriginalUrl = request as typeof request & { originalUrl?: string };
          if (requestWithOriginalUrl.originalUrl?.startsWith(`${normalizedBase}/`)) {
            requestWithOriginalUrl.originalUrl = requestWithOriginalUrl.originalUrl.slice(
              normalizedBase.length
            );
          }
        }

        const rewriteableModulePrefixes = [
          '/.svelte-kit/',
          '/@fs/',
          '/@id/',
          '/@vite/',
          '/node_modules/',
          '/src/'
        ];
        const acceptsRewriteableContent =
          request.headers.accept?.includes('text/html') ||
          rewriteableModulePrefixes.some((prefix) => request.url?.startsWith(prefix)) ||
          request.url?.endsWith('.js') ||
          request.url?.includes('.js?');

        if (!acceptsRewriteableContent) {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        const toBuffer = (chunk: unknown) => {
          if (Buffer.isBuffer(chunk)) return chunk;
          if (chunk instanceof Uint8Array) return Buffer.from(chunk);
          return Buffer.from(String(chunk));
        };

        const writeHead = response.writeHead.bind(response);
        const end = response.end.bind(response);

        response.writeHead = ((...args: Parameters<typeof response.writeHead>) => {
          response.removeHeader('content-length');
          return writeHead(...args);
        }) as typeof response.writeHead;

        response.write = ((chunk: unknown, encodingOrCallback?: unknown, callback?: unknown) => {
          if (chunk) {
            chunks.push(toBuffer(chunk));
          }

          const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
          if (typeof done === 'function') {
            done();
          }

          return true;
        }) as typeof response.write;

        response.end = ((chunk?: unknown, encodingOrCallback?: unknown, callback?: unknown) => {
          if (chunk) {
            chunks.push(toBuffer(chunk));
          }

          const html = Buffer.concat(chunks)
            .toString('utf8')
            .replaceAll('"/node_modules/', `"${normalizedBase}/node_modules/`)
            .replaceAll('"/@fs/', `"${normalizedBase}/@fs/`)
            .replaceAll('"/@id/', `"${normalizedBase}/@id/`)
            .replaceAll('"/@vite/', `"${normalizedBase}/@vite/`)
            .replaceAll('"/src/', `"${normalizedBase}/src/`)
            .replaceAll('"/.svelte-kit/', `"${normalizedBase}/.svelte-kit/`);

          if (!response.headersSent) {
            response.removeHeader('content-length');
          }

          const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
          const result = end(html);

          if (typeof done === 'function') {
            done();
          }

          return result;
        }) as typeof response.end;

        next();
      });
    }
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hmrHost = env.DEV_SERVER_HMR_HOST;
  const hmrProtocol = env.DEV_SERVER_HMR_PROTOCOL;
  const hmrClientPort = env.DEV_SERVER_HMR_CLIENT_PORT
    ? Number(env.DEV_SERVER_HMR_CLIENT_PORT)
    : undefined;
  const hmrPath = env.DEV_SERVER_HMR_PATH;

  return {
    plugins: [devProxyAssetBasePlugin(env.DEV_SERVER_BASE), tailwindcss(), sveltekit()],
    server: {
      allowedHosts: ['code.darkmode.tools'],
      origin: env.DEV_SERVER_ORIGIN || undefined,
      hmr: hmrHost
        ? {
            host: hmrHost,
            protocol: hmrProtocol,
            clientPort: hmrClientPort,
            path: hmrPath
          }
        : undefined
    }
  };
});
