import { createServer } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const PORT = 4001;
const DATA_DIR = join(import.meta.dirname, "extensions");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

interface Extension {
  id: string;
  name: string;
  description: string;
  code: string;
  author: string;
  createdAt: string;
}

function listExtensions(): Extension[] {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  return files.map(f => JSON.parse(readFileSync(join(DATA_DIR, f), "utf-8")));
}

function saveExtension(ext: Extension) {
  writeFileSync(join(DATA_DIR, `${ext.id}.json`), JSON.stringify(ext, null, 2));
}

const server = createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /api/extensions
  if (req.method === "GET" && path === "/api/extensions") {
    const exts = listExtensions();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(exts));
    return;
  }

  // GET /api/extensions/:id
  if (req.method === "GET" && path.startsWith("/api/extensions/")) {
    const id = path.split("/").pop()!;
    const file = join(DATA_DIR, `${id}.json`);
    if (existsSync(file)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(readFileSync(file, "utf-8"));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    }
    return;
  }

  // POST /api/extensions
  if (req.method === "POST" && path === "/api/extensions") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const ext: Extension = {
          id: crypto.randomUUID(),
          name: data.name,
          description: data.description,
          code: data.code,
          author: data.author || "Anonymous",
          createdAt: new Date().toISOString(),
        };
        saveExtension(ext);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(ext));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Extension store running on http://localhost:${PORT}`);
});
