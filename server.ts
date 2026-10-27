import 'dotenv/config';
import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { store } from './src/server/store.ts';
import { apiRouter, openApiSpec } from './src/server/routes.ts';

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function bootstrap() {
  // 1. Initialize MySQL connection pool & schema (or local persistent store)
  await store.init();

  // 2. Mount API routes and OpenAPI / Swagger documentation
  app.use('/api', apiRouter);

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.get('/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NoteBound AI API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
      });
    </script>
  </body>
</html>`);
  });

  // 3. Mount Vite middleware for dev or static dist for production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      app.use(express.static(process.cwd()));
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`[🚀] NoteBound AI server active on port ${PORT}`);
    console.log(`[🔗] Frontend: http://0.0.0.0:${PORT}`);
    console.log(`[📄] Swagger API Docs: http://0.0.0.0:${PORT}/docs`);
    console.log('====================================================');
  });
}

bootstrap().catch((err) => {
  console.error('[FATAL] Bootstrap failed:', err);
});
