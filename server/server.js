const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream"
  });

  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocket.Server({ server });

const clients = new Map();

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendToRoom(room, sender, data) {
  for (const client of clients.keys()) {
    if (
      client !== sender &&
      client.room === room &&
      client.readyState === WebSocket.OPEN
    ) {
      send(client, data);
    }
  }
}

wss.on("connection", (ws) => {

  clients.set(ws, {
    room: null,
    name: "Pengguna"
  });

  send(ws, {
    type: "connected"
  });

  ws.on("message", (raw) => {

    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const info = clients.get(ws);

    if (!info) return;

    /* =========================
       JOIN ROOM
    ========================= */

    if (data.type === "join") {

      const room =
        String(data.room || "").trim();

      const name =
        String(data.name || "Pengguna").trim();

      if (!room) {
        send(ws, {
          type: "error",
          message: "ID teman/room belum diisi."
        });
        return;
      }

      info.room = room;
      info.name = name || "Pengguna";

      let users = 0;

      for (const client of clients.keys()) {
        const c = clients.get(client);

        if (
          client !== ws &&
          c.room === room
        ) {
          users++;
        }
      }

      send(ws, {
        type: "joined",
        room: room,
        users: users + 1
      });

      sendToRoom(room, ws, {
        type: "user-joined",
        name: info.name
      });

      return;
    }

    /* =========================
       DATA DALAM ROOM
    ========================= */

    if (!info.room) {
      send(ws, {
        type: "error",
        message: "Masuk ke room terlebih dahulu."
      });
      return;
    }

    /*
      Semua signaling WebRTC dan chat
      hanya dikirim ke pengguna lain
      di room yang sama.
    */

    sendToRoom(
      info.room,
      ws,
      data
    );
  });

  ws.on("close", () => {

    const info = clients.get(ws);

    if (info && info.room) {

      sendToRoom(
        info.room,
        ws,
        {
          type: "user-left"
        }
      );
    }

    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(
    "Chatandcall server berjalan di port " + PORT
  );
});
