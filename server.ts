import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);

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
  async ({ query }: { query: string }) => ({
    content: [{ type: "text" as const, text: `Query was: ${query}` }],
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
  })
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

// ------------------------
// HTTP transport (session-aware)
// ------------------------

const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

async function getOrCreateTransport(
  req: express.Request,
  _res: express.Response
): Promise<StreamableHTTPServerTransport> {
  const sessionId = req.header("mcp-session-id");

  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  await server.connect(transport);
  return transport;
}

app.get("/mcp", async (req, res) => {
  try {
    const transport = await getOrCreateTransport(req, res);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("MCP GET failed:", err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.post("/mcp", async (req, res) => {
  try {
    const transport = await getOrCreateTransport(req, res);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP POST failed:", err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.delete("/mcp", async (req, res) => {
  try {
    const transport = await getOrCreateTransport(req, res);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("MCP DELETE failed:", err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get("/", (_req, res) => {
  res.send("Debug MCP server is running.");
});

app.listen(PORT, () => {
  console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
});
