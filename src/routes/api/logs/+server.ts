import type { RequestHandler } from './$types';
import { subscribeToLogs } from '$lib/server/log-stream';

const encoder = new TextEncoder();

const encodeEvent = (event: string, data: unknown) => {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

export const GET: RequestHandler = ({ request }) => {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const enqueue = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encodeEvent(event, data));
        }
      };

      controller.enqueue(
        encodeEvent('ready', {
          message: 'Log stream connected',
          timestamp: new Date().toISOString()
        })
      );

      const unsubscribe = subscribeToLogs((logEvent) => {
        enqueue('log', logEvent);
      });

      const heartbeat = setInterval(() => {
        enqueue('heartbeat', {
          timestamp: new Date().toISOString()
        });
      }, 30000);

      const cleanup = () => {
        if (closed) return;

        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      request.signal.addEventListener(
        'abort',
        () => {
          cleanup();
        },
        { once: true }
      );

      return cleanup;
    }
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no'
    }
  });
};
