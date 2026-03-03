import { getSimulationEngine } from "@/lib/simulation";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const encoder = new TextEncoder();
  const engine = getSimulationEngine();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const payload =
          `event: ${event}\n` +
          `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      // Initial status event
      sendEvent("status", { message: "connected" });

      let closed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;

        if (interval !== null) {
          clearInterval(interval);
          interval = null;
        }

        try {
          controller.close();
        } catch {
          // ignore if already closed
        }
      };

      // Tick loop
      let sending = false;
      interval = setInterval(() => {
        if (sending) return;
        sending = true;

        engine
          .next()
          .then((payload) => {
            sendEvent("tick", payload);
          })
          .catch(() => {
            // swallow errors for now to keep stream alive
          })
          .finally(() => {
            sending = false;
          });
      }, 1000);

      // Stop when client disconnects
      request.signal.addEventListener("abort", () => {
        close();
      });
    },
    cancel() {
      // Stream cancelled by the client
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

