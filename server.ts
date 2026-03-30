import express from "express";
import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

function createServer() {
  const server = new McpServer({
    name: "debug-widget-server",
    version: "1.0.0",
  });

  server.registerTool(
    "search_products_ui",
    {
      title: "Search products",
      description: "Debug widget tool",
      inputSchema: z.object({
        query: z.string(),
      }),
      _meta: {
        "openai/outputTemplate": "ui://widget/products-grid.html",
        "openai/toolInvocation/invoking": "Loading",
        "openai/toolInvocation/invoked": "Loaded",
      },
    },
    async ({ query }: { query: string }) => {
      return {
        content: [
          {
            type: "text",
            text: `Query was: ${query}`,
          },
        ],
        structuredContent: {
          products: [
            {
              id: 1,
              title: "Test product",
              subtitle: "debug",
              price: "$1.00",
              imageUrl: "",
              summary: "If the widget loads, you should see HELLO FROM WIDGET.",
            },
          ],
        },
      };
    }
  );

  server.registerResource(
    "html",
    "ui://widget/products-grid.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/products-grid.html",
          mimeType: "text/html+skybridge",
          _meta: {
            "openai/widgetDescription": "Debug widget",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
            },
          },
          text: `<!doctype html>
<html>
  <body style="padding:20px;font-size:20px;font-family:sans-serif;">
    HELLO FROM WIDGET
  </body>
</html>`,
        },
      ],
    })
  );

  return server;
}

async function createTransport() {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    },
  });

  transport.onclose = async () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
    await server.close();
  };

  await server.connect(transport);
  return transport;
}

async function getTransport(req: express.Request) {
  const sessionId = req.header("mcp-session-id");

  if (sessionId) {
    const existing = transports.get(sessionId);
    if (existing) return existing;
  }

  return await createTransport();
}

app.all("/mcp", async (req, res) => {
  try {
    const transport = await getTransport(req);
    await transport.handleRequest(
      req,
      res,
      req.method === "POST" ? req.body : undefined
    );
  } catch (error) {
    console.error(`MCP ${req.method} failed:`, error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/", (_req, res) => {
  res.send("Debug MCP server is running");
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});