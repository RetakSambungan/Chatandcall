const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

let file = req.url === "/"
? "index.html"
: req.url.substring(1);

const filePath = path.join(__dirname, file);

fs.readFile(filePath, (err, data) => {

if (err) {

  res.writeHead(404);
  res.end("Not Found");

  return;
}

let type = "text/html";

if(file.endsWith(".css"))
  type = "text/css";

if(file.endsWith(".js"))
  type = "application/javascript";

if(file.endsWith(".png"))
  type = "image/png";

res.writeHead(200,{
  "Content-Type":type
});

res.end(data);

});

});

const wss = new WebSocket.Server({
server
});

const rooms = new Map();

wss.on("connection", ws => {

ws.id = null;
ws.room = null;
ws.name = null;

ws.on("message", raw => {

let data;

try{

  data = JSON.parse(raw.toString());

}catch(e){

  return;
}


/* JOIN */

if(data.type === "join"){

  ws.id = data.id;
  ws.room = data.room;
  ws.name = data.name;


  if(!rooms.has(ws.room))
    rooms.set(ws.room,new Map());


  rooms.get(ws.room).set(
    ws.id,
    ws
  );


  return;
}


/* SEND TO SPECIFIC USER */

if(data.to){

  const room =
    rooms.get(ws.room);

  if(!room) return;

  const target =
    room.get(data.to);

  if(target &&
     target.readyState === WebSocket.OPEN){

    target.send(
      JSON.stringify({
        ...data,
        from:ws.id,
        name:ws.name
      })
    );

  }

  return;
}


/* CHAT BROADCAST */

if(data.type === "chat"){

  const room =
    rooms.get(ws.room);

  if(!room) return;

  for(const [id,client] of room){

    if(
      id !== ws.id &&
      client.readyState === WebSocket.OPEN
    ){

      client.send(
        JSON.stringify({
          type:"chat",
          name:ws.name,
          msg:data.msg
        })
      );

    }

  }

}

});

ws.on("close",() => {

if(ws.room && ws.id){

  const room =
    rooms.get(ws.room);

  if(room){

    room.delete(ws.id);

    if(room.size === 0)
      rooms.delete(ws.room);

  }

}

});

});

server.listen(PORT, () => {

console.log(
"Server berjalan di port " + PORT
);

});
