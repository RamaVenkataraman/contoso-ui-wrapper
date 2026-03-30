import express from "express";
import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

// ------------------------
// Config
// ------------------------

const PORT = Number(process.env.PORT || 3000);
const CHANNEL_ID = 68719478279;
const CONTOSO_MCP_URL =
  "https://scuz40cmfbe23882394-rs.su.retail.test.dynamics.com/ecommerce/mcp";

// ------------------------
// Upstream Contoso MCP client
// ------------------------

let contosoClient: Client | null = null;

async function getContosoClient(): Promise<Client> {
  if (contosoClient) return contosoClient;

  const client = new Client({
    name: "contoso-ui-wrapper",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(new URL(CONTOSO_MCP_URL));
  await client.connect(transport);

  contosoClient = client;
  return client;
}

async function callContosoTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<any> {
  const client = await getContosoClient();
  return client.callTool({
    name: toolName,
    arguments: args,
  });
}

// ------------------------
// Helpers
// ------------------------

function normalizeToolPayload(result: any): any {
  if (result?.structuredContent) return result.structuredContent;

  const firstText = result?.content?.find?.((c: any) => c?.type === "text")?.text;
  if (typeof firstText === "string") {
    try {
      return JSON.parse(firstText);
    } catch {
      return {};
    }
  }

  return {};
}

function toImageUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";

  const v = value.trim();

  if (v.startsWith("http://") || v.startsWith("https://")) {
    return v;
  }

  const normalized = v.startsWith("/") ? v : `/${v}`;

  return `https://images-us-ppe.cms.commerce.dynamics.com/cms/api/lntklcqptt/imageFileData/search?fileName=${encodeURIComponent(
    normalized
  )}&w=300&h=300&q=100&m=6&cropfocalregion=true`;
}

function normalizeProducts(payload: any) {
  const rawProducts = payload?.products ?? payload?.Products ?? payload?.value ?? [];

  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.map((p: any) => {
    const rawPrice = p.price ?? p.Price ?? "";
    const imageCandidate =
      p.primaryImageUrl ??
      p.PrimaryImageUrl ??
      p.imageUrl ??
      p.ImageUrl ??
      "";

    return {
      id: p.productId ?? p.ProductId ?? p.RecordId ?? p.id,
      title: p.name ?? p.Name ?? "Untitled product",
      subtitle: p.itemId ?? p.ItemId ?? "",
      price:
        typeof rawPrice === "number" ? `$${rawPrice.toFixed(2)}` : String(rawPrice ?? ""),
      imageUrl: toImageUrl(imageCandidate),
      summary:
        p.description ??
        p.Description ??
        p.shortDescription ??
        p.ShortDescription ??
        "",
    };
  });
}

function normalizeProductDetail(payload: any) {
  const p = payload ?? {};

  const rawPrice = p.price ?? p.Price ?? "";

  return {
    id: p.productId ?? p.ProductId ?? p.RecordId ?? p.id,
    title: p.name ?? p.Name ?? "Untitled product",
    subtitle: p.itemId ?? p.ItemId ?? "",
    price:
      typeof rawPrice === "number" ? `$${rawPrice.toFixed(2)}` : String(rawPrice ?? ""),
    imageUrl: toImageUrl(
      p.primaryImageUrl ?? p.PrimaryImageUrl ?? p.imageUrl ?? p.ImageUrl ?? ""
    ),
    summary:
      p.description ??
      p.Description ??
      p.shortDescription ??
      p.ShortDescription ??
      "",
  };
}

// ------------------------
// Widget HTML
// ------------------------

function productsWidgetHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Products</title>
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: transparent;
        color: #ffffff;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
        gap: 14px;
      }

      .card {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(255,255,255,0.03);
        cursor: pointer;
        color: #ffffff;
      }

      .card:hover {
        background: rgba(255,255,255,0.08);
      }

      .imgwrap {
        aspect-ratio: 1 / 1;
        background: rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .imgwrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .placeholder {
        opacity: 0.7;
        font-size: 13px;
      }

      .body {
        padding: 12px;
      }

      .title {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.35;
        margin-bottom: 6px;
      }

      .subtitle {
        font-size: 13px;
        opacity: 0.7;
        margin-bottom: 8px;
      }

      .price {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .summary {
        font-size: 13px;
        line-height: 1.4;
        opacity: 0.82;
      }

      .detail {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(255,255,255,0.03);
      }

      .detailBody {
        padding: 16px;
      }

      .detailTitle {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .backBtn {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.18);
        background: transparent;
        color: inherit;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
        margin-bottom: 12px;
      }

      .empty {
        padding: 20px;
        border: 1px dashed rgba(255,255,255,0.2);
        border-radius: 16px;
        opacity: 0.8;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>

    <script>
      const app = document.getElementById("app");

      function esc(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function getProducts(output) {
        if (Array.isArray(output?.products)) return output.products;
        if (Array.isArray(output?.structuredContent?.products)) return output.structuredContent.products;
        if (Array.isArray(output?.result?.structuredContent?.products)) return output.result.structuredContent.products;
        return [];
      }

      function getDetail(output) {
        if (output?.product) return output.product;
        if (output?.structuredContent?.product) return output.structuredContent.product;
        if (output?.result?.structuredContent?.product) return output.result.structuredContent.product;
        return null;
      }

      async function showDetail(productId) {
        if (!window.openai?.callTool) return;
        await window.openai.callTool("get_product_details_ui", { productId });
      }

      function renderProducts(products) {
        if (!products.length) {
          app.innerHTML = '<div class="empty">No products found.</div>';
          window.openai?.notifyIntrinsicHeight?.();
          return;
        }

        app.innerHTML = \`
          <div class="grid">
            \${products.map((p) => \`
              <button class="card" data-id="\${esc(p.id)}" type="button">
                <div class="imgwrap">
                  \${p.imageUrl
                    ? \`<img src="\${esc(p.imageUrl)}" alt="\${esc(p.title)}" />\`
                    : \`<div class="placeholder">No image</div>\`}
                </div>
                <div class="body">
                  <div class="title">\${esc(p.title)}</div>
                  <div class="subtitle">\${esc(p.subtitle || "")}</div>
                  <div class="price">\${esc(p.price || "")}</div>
                  <div class="summary">\${esc(p.summary || "")}</div>
                </div>
              </button>
            \`).join("")}
          </div>
        \`;

        app.querySelectorAll(".card").forEach((el) => {
          el.addEventListener("click", () => {
            const id = Number(el.getAttribute("data-id"));
            if (id) showDetail(id);
          });
        });

        window.openai?.notifyIntrinsicHeight?.();
      }

      function renderDetail(product) {
        app.innerHTML = \`
          <div class="detail">
            <div class="imgwrap">
              \${product.imageUrl
                ? \`<img src="\${esc(product.imageUrl)}" alt="\${esc(product.title)}" />\`
                : \`<div class="placeholder">No image</div>\`}
            </div>
            <div class="detailBody">
              <div class="detailTitle">\${esc(product.title)}</div>
              <div class="subtitle">\${esc(product.subtitle || "")}</div>
              <div class="price">\${esc(product.price || "")}</div>
              <div class="summary">\${esc(product.summary || "No description available.")}</div>
            </div>
          </div>
        \`;

        window.openai?.notifyIntrinsicHeight?.();
      }

      let rendered = false;

      function render(rawOverride) {
        if (rendered) return;
        const raw = rawOverride ?? window.openai?.toolOutput;
        if (!raw) return;
        rendered = true;

        const detail = getDetail(raw);
        const products = getProducts(raw);
        if (detail) {
          renderDetail(detail);
        } else {
          renderProducts(products);
        }
      }

      // Primary: listen for postMessage from the parent frame.
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data) return;
        // Bridge may send the tool output directly or wrapped.
        const payload =
          data?.toolOutput ??
          data?.structuredContent ??
          (data?.products ? data : null);
        if (payload) render(payload);
      });

      // Fallback: poll for window.openai.toolOutput.
      function poll(attempts) {
        if (rendered) return;
        if (window.openai?.toolOutput !== undefined) {
          render();
        } else if (attempts > 0) {
          setTimeout(() => poll(attempts - 1), 100);
        } else {
          renderProducts([]); // show empty state after 5s
        }
      }

      poll(50); // up to 5 seconds
    </script>
  </body>
</html>`;
}

// ------------------------
// Per-session MCP server
// ------------------------

function createServer() {
  const server = new McpServer({
    name: "contoso-shopping-ui-wrapper",
    version: "1.0.0",
  });

  server.registerTool(
    "search_products_ui",
    {
      title: "Search products",
      description: "Search products and show them as clickable product cards",
      inputSchema: z.object({
        query: z.string(),
      }),
      _meta: {
        "openai/outputTemplate": "ui://widget/products-grid.html",
        "openai/toolInvocation/invoking": "Loading products",
        "openai/toolInvocation/invoked": "Products loaded",
      },
    },
    async ({ query }: { query: string }) => {
      const result = await callContosoTool("search_products", {
        searchTerm: query,
        channelId: CHANNEL_ID,
      });

      const payload = normalizeToolPayload(result);
      console.log("search_products raw result:", JSON.stringify(result).slice(0, 500));
      console.log("search_products payload keys:", Object.keys(payload ?? {}));
      const products = normalizeProducts(payload);
      console.log("search_products product count:", products.length);

      return {
        content: [
          {
            type: "text",
            text:
              products.length > 0
                ? `Found ${products.length} products.`
                : "No products found.",
          },
        ],
        structuredContent: {
          products,
        },
      };
    }
  );

  server.registerTool(
    "get_product_details_ui",
    {
      title: "Get product details",
      description: "Get detailed information for a selected product",
      inputSchema: z.object({
        productId: z.number(),
      }),
      _meta: {
        "openai/outputTemplate": "ui://widget/products-grid.html",
        "openai/toolInvocation/invoking": "Loading details",
        "openai/toolInvocation/invoked": "Details loaded",
      },
    },
    async ({ productId }: { productId: number }) => {
      const result = await callContosoTool("get_product_by_id", {
        productId,
        channelId: CHANNEL_ID,
      });

      const payload = normalizeToolPayload(result);
      const product = normalizeProductDetail(payload);

      return {
        content: [
          {
            type: "text",
            text: `${product.title}: ${product.summary || "No description available."}`,
          },
        ],
        structuredContent: {
          product,
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
            "openai/widgetDescription":
              "Shows product search results as clickable product cards.",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: ["https://images-us-ppe.cms.commerce.dynamics.com"],
            },
          },
          text: productsWidgetHtml(),
        },
      ],
    })
  );

  return server;
}

// ------------------------
// Streamable HTTP session handling
// ------------------------

const transports = new Map<string, StreamableHTTPServerTransport>();

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

// ------------------------
// HTTP app
// ------------------------

const app = express();
app.use(express.json({ limit: "1mb" }));

app.all("/mcp", async (req, res) => {
  try {
    console.log("MCP request:", req.method, "session:", req.header("mcp-session-id") ?? null);

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
  res.send("Contoso UI wrapper is running.");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});