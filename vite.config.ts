import { defineConfig, loadEnv, type Plugin } from 'vite';

function openAiDevApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'ezop4-openai-dev-api',
    configureServer(server) {
      attachAiRoute(server.middlewares, apiKey);
    },
    configurePreviewServer(server) {
      attachAiRoute(server.middlewares, apiKey);
    },
  };
}

function attachAiRoute(middlewares: { use: (path: string, handler: (req: any, res: any) => void) => void }, apiKey: string | undefined): void {
  middlewares.use('/api/ai/order-summary', async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    if (!apiKey) {
      res.statusCode = 503;
      res.end('OPENAI_API_KEY is not configured on the server.');
      return;
    }

    try {
      const body = await readJsonBody(req);
      const result = await buildOrderSummary(apiKey, body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'AI summary failed.');
    }
  });
}

async function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function buildOrderSummary(apiKey: string, payload: unknown) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: 'Jsi výrobní asistent pro elektronickou výrobu. Odpovídej stručně česky a vrať pouze validní JSON.',
        },
        {
          role: 'user',
          content: `Shrň stav zakázky, hlavní rizika a další kroky. Vrať JSON se strukturou {"summary":string,"risks":string[],"nextSteps":string[]}. Data: ${JSON.stringify(payload).slice(0, 12000)}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'order_summary',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              risks: { type: 'array', items: { type: 'string' } },
              nextSteps: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'risks', 'nextSteps'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${message}`);
  }

  const data = await response.json() as { output_text?: string };
  return JSON.parse(data.output_text || '{"summary":"","risks":[],"nextSteps":[]}');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const openAiApiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  return {
    base: './',
    server: { port: 8085, host: '0.0.0.0' },
    preview: { port: 8085, host: '0.0.0.0' },
    plugins: [openAiDevApiPlugin(openAiApiKey)],
  };
});
