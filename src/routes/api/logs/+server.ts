import type { RequestHandler } from './$types';
import { subscribeToLogs } from '$lib/server/log-stream';

const encoder = new TextEncoder();

const encodeEvent = (event: string, data: unknown) => {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

export const GET: RequestHandler = ({ request }) => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encodeEvent('ready', {
          message: 'Log stream connected',
          timestamp: new Date().toISOString()
        })
      );

      const unsubscribe = subscribeToLogs((logEvent) => {
        controller.enqueue(encodeEvent('log', logEvent));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(
          encodeEvent('heartbeat', {
            timestamp: new Date().toISOString()
          })
        );
      }, 30000);

      request.signal.addEventListener(
        'abort',
        () => {
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        },
        { once: true }
      );
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
