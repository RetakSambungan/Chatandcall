const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let filePath = path.join(
    __dirname,
    req.url === "/" ? "index.html" : req.url
  );

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);

  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  res.writeHead(200, {
    "Content-Type": types[ext] || "text/plain"
  });

  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);

  ws.send(JSON.stringify({
    type: "connected",
    message: "Terhubung ke server"
  }));

  ws.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Kirim pesan ke semua pengguna lain
    for (const client of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
