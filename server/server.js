const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ======================================
// FILE WEBSITE
// ======================================

const publicFolder = path.join(__dirname, "..");

app.use(express.static(publicFolder));


// ======================================
// HEALTH CHECK
// ======================================

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "VideoChat"
    });
});


// ======================================
// KONFIGURASI WEBRTC
// ======================================

app.get("/config", (req, res) => {

    const iceServers = [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ];

    // TURN opsional
    if (
        process.env.TURN_URL &&
        process.env.TURN_USERNAME &&
        process.env.TURN_CREDENTIAL
    ) {

        const urls =
            process.env.TURN_URL
                .split(",")
                .map(url => url.trim())
                .filter(Boolean);

        iceServers.push({
            urls: urls,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL
        });
    }

    res.json({
        iceServers
    });

});


// ======================================
// WEBSOCKET SERVER
// ======================================

const wss = new WebSocket.Server({
    server: server
});


// ======================================
// ROOM
// ======================================
//
// rooms = Map {
//   roomId => Set<WebSocket>
// }
//
// Maksimal 2 orang dalam satu room.
//

const rooms = new Map();


// ======================================
// DATA USER
// ======================================

function getClientData(ws) {

    return {
        room: ws.room || null,
        name: ws.name || "Teman"
    };

}


// ======================================
// KIRIM PESAN KE CLIENT
// ======================================

function send(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(
            JSON.stringify(data)
        );

    }

}


// ======================================
// KIRIM KE SEMUA MEMBER ROOM
// KECUALI PENGIRIM
// ======================================

function broadcast(roomId, sender, data) {

    const room = rooms.get(roomId);

    if (!room) {
        return;
    }

    for (const client of room) {

        if (
            client !== sender &&
            client.readyState === WebSocket.OPEN
        ) {

            send(client, data);

        }

    }

}


// ======================================
// HAPUS CLIENT DARI ROOM
// ======================================

function removeFromRoom(ws) {

    const roomId = ws.room;

    if (!roomId) {
        return;
    }

    const room = rooms.get(roomId);

    if (!room) {
        ws.room = null;
        return;
    }

    room.delete(ws);

    broadcast(
        roomId,
        ws,
        {
            type: "leave"
        }
    );

    if (room.size === 0) {

        rooms.delete(roomId);

    }

    ws.room = null;

}


// ======================================
// WEBSOCKET CONNECTION
// ======================================

wss.on("connection", ws => {

    console.log("Client terhubung.");


    ws.room = null;
    ws.name = "Teman";


    // ==================================
    // TERIMA PESAN
    // ==================================

    ws.on("message", rawMessage => {

        let message;

        try {

            message =
                JSON.parse(
                    rawMessage.toString()
                );

        } catch (error) {

            send(ws, {
                type: "error",
                message: "Format pesan tidak valid."
            });

            return;

        }


        // ==================================
        // JOIN ROOM
        // ==================================

        if (message.type === "join") {

            joinRoom(ws, message);

            return;

        }


        // ==================================
        // PESAN HARUS SUDAH JOIN ROOM
        // ==================================

        if (!ws.room) {

            send(ws, {
                type: "error",
                message: "Anda belum masuk room."
            });

            return;

        }


        // ==================================
        // ACCEPT
        // ==================================

        if (message.type === "accept") {

            broadcast(
                ws.room,
                ws,
                {
                    type: "accepted",
                    name: ws.name
                }
            );

            return;

        }


        // ==================================
        // REJECT
        // ==================================

        if (message.type === "reject") {

            broadcast(
                ws.room,
                ws,
                {
                    type: "rejected"
                }
            );

            return;

        }


        // ==================================
        // CHAT
        // ==================================

        if (message.type === "chat") {

            const text =
                typeof message.text === "string"
                    ? message.text.trim()
                    : "";

            if (!text) {
                return;
            }

            // Batasi panjang pesan
            const safeText =
                text.substring(0, 500);

            broadcast(
                ws.room,
                ws,
                {
                    type: "chat",
                    name: ws.name,
                    text: safeText
                }
            );

            return;

        }


        // ==================================
        // SIGNALING WEBRTC
        // ==================================

        if (
            message.type === "offer" ||
            message.type === "answer" ||
            message.type === "candidate"
        ) {

            broadcast(
                ws.room,
                ws,
                message
            );

            return;

        }


        // ==================================
        // LEAVE
        // ==================================

        if (message.type === "leave") {

            removeFromRoom(ws);

            return;

        }

    });


    // ==================================
    // CLIENT TERPUTUS
    // ==================================

    ws.on("close", () => {

        console.log("Client terputus.");

        removeFromRoom(ws);

    });


    // ==================================
    // ERROR
    // ==================================

    ws.on("error", error => {

        console.error(
            "WebSocket error:",
            error.message
        );

    });

});


// ======================================
// FUNGSI JOIN ROOM
// ======================================

function joinRoom(ws, message) {

    // Kalau sudah ada di room
    if (ws.room) {

        send(ws, {
            type: "error",
            message: "Anda sudah berada di room."
        });

        return;

    }


    // Validasi room
    const roomId =
        typeof message.room === "string"
            ? message.room.trim()
            : "";

    if (!roomId) {

        send(ws, {
            type: "error",
            message: "Room tidak valid."
        });

        return;

    }


    // Nama
    let name =
        typeof message.name === "string"
            ? message.name.trim()
            : "Teman";

    if (!name) {
        name = "Teman";
    }

    name = name.substring(0, 30);


    // Ambil / buat room
    let room = rooms.get(roomId);

    if (!room) {

        room = new Set();

        rooms.set(
            roomId,
            room
        );

    }


    // Maksimal 2 orang
    if (room.size >= 2) {

        send(ws, {
            type: "full",
            message: "Room sudah penuh."
        });

        return;

    }


    // Simpan data client
    ws.room = roomId;
    ws.name = name;

    room.add(ws);


    // Orang pertama = caller
    if (room.size === 1) {

        send(ws, {
            type: "joined",
            role: "caller",
            name: name
        });

        console.log(
            `Room ${roomId}: ${name} membuat panggilan.`
        );

        return;

    }


    // Orang kedua = callee
    if (room.size === 2) {

        let caller = null;

        for (const client of room) {

            if (client !== ws) {
                caller = client;
                break;
            }

        }


        // Beri tahu orang kedua
        send(ws, {
            type: "joined",
            role: "callee",
            name: name
        });


        // Panggilan masuk ke orang kedua
        send(ws, {
            type: "incoming",
            name: caller
                ? caller.name
                : "Teman"
        });


        // Caller mendapat status memanggil
        if (caller) {

            send(caller, {
                type: "ringing",
                name: name
            });

        }


        console.log(
            `Room ${roomId}: ${name} bergabung.`
        );

    }

}


// ======================================
// KEEP ALIVE
// ======================================

setInterval(() => {

    for (const ws of wss.clients) {

        if (ws.isAlive === false) {

            ws.terminate();

            continue;

        }

        ws.isAlive = false;

        try {

            ws.ping();

        } catch (error) {

            ws.terminate();

        }

    }

}, 30000);


wss.on("connection", ws => {

    ws.isAlive = true;

    ws.on("pong", () => {

        ws.isAlive = true;

    });

});


// ======================================
// START SERVER
// ======================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `VideoChat berjalan di port ${PORT}`
        );

    }
);
