const homePage = document.getElementById("homePage");
const callPage = document.getElementById("callPage");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");

const remoteVideo = document.getElementById("remoteVideo");
const localVideo = document.getElementById("localVideo");

const waitingScreen = document.getElementById("waitingScreen");
const waitingTitle = document.getElementById("waitingTitle");
const waitingText = document.getElementById("waitingText");

const peerName = document.getElementById("peerName");
const callStatus = document.getElementById("callStatus");

const chatPanel = document.getElementById("chatPanel");
const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const chatBtn = document.getElementById("chatBtn");
const closeChatBtn = document.getElementById("closeChatBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const hangupBtn = document.getElementById("hangupBtn");

const incomingCall = document.getElementById("incomingCall");
const incomingName = document.getElementById("incomingName");
const acceptBtn = document.getElementById("acceptBtn");
const rejectBtn = document.getElementById("rejectBtn");

const homeStatus = document.getElementById("homeStatus");
const toast = document.getElementById("toast");

let socket = null;
let peerConnection = null;
let localStream = null;

let myName = "";
let roomId = "";
let myRole = "";
let otherName = "";

let pendingCandidates = [];
let callAccepted = false;

const rtcConfig = {
iceServers: [
{
urls: "stun:stun.l.google.com:19302"
},
{
urls: "stun:stun1.l.google.com:19302"
}
]
};

// ===============================
// UTILITAS
// ===============================

function showToast(text) {
toast.textContent = text;
toast.classList.remove("hidden");

setTimeout(() => {
    toast.classList.add("hidden");
}, 3000);

}

function showHomeStatus(text) {
if (homeStatus) {
homeStatus.textContent = text;
}
}

function randomRoomId() {
return Math.random().toString(36).substring(2, 10);
}

function getRoomLink() {
return window.location.origin + "/?room=" + encodeURIComponent(roomId);
}

function updateRoomLink() {
const link = getRoomLink();

waitingText.innerHTML =
    "Bagikan link ini kepada teman:<br><br>" +
    "<strong style='word-break:break-all'>" +
    link +
    "</strong>";

copyLinkBtn.textContent = "🔗 Salin Link Panggilan";

}

function copyRoomLink() {
const link = getRoomLink();

navigator.clipboard.writeText(link)
    .then(() => {
        showToast("Link panggilan berhasil disalin");
    })
    .catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();

        showToast("Link panggilan berhasil disalin");
    });

}

// ===============================
// CEK BROWSER
// ===============================

function checkBrowser() {
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
alert(
"Browser ini tidak mendukung kamera/mikrofon.\n" +
"Gunakan Chrome atau browser modern."
);

    return false;
}

if (!window.WebSocket) {
    alert("Browser tidak mendukung WebSocket.");
    return false;
}

if (!window.RTCPeerConnection) {
    alert("Browser tidak mendukung video call WebRTC.");
    return false;
}

return true;

}

// ===============================
// KAMERA + MIKROFON
// ===============================

async function startCamera() {
try {
localStream = await navigator.mediaDevices.getUserMedia({
video: true,
audio: true
});

    localVideo.srcObject = localStream;

    return true;

} catch (error) {
    console.error("Camera error:", error);

    alert(
        "Kamera atau mikrofon tidak diizinkan.\n\n" +
        "Silakan izinkan kamera dan mikrofon di browser."
    );

    return false;
}

}

// ===============================
// WEBSOCKET
// ===============================

function connectSocket() {
return new Promise((resolve, reject) => {

    const protocol =
        window.location.protocol === "https:"
            ? "wss:"
            : "ws:";

    const socketUrl =
        protocol + "//" + window.location.host;

    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
        console.log("WebSocket connected");

        socket.send(JSON.stringify({
            type: "join",
            roomId: roomId,
            name: myName
        }));

        resolve();
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);

        showToast("Gagal terhubung ke server");

        reject(error);
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected");
    };

    socket.onmessage = async (event) => {

        try {
            const data = JSON.parse(event.data);

            await handleSignal(data);

        } catch (error) {
            console.error("Signal error:", error);
        }
    };
});

}

// ===============================
// WEBRTC
// ===============================

function createPeerConnection() {

if (peerConnection) {
    peerConnection.close();
}

peerConnection = new RTCPeerConnection(rtcConfig);

if (localStream) {

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

peerConnection.ontrack = (event) => {

    if (event.streams && event.streams[0]) {

        remoteVideo.srcObject = event.streams[0];

        waitingScreen.classList.add("hidden");

        callStatus.textContent = "Terhubung";
    }
};

peerConnection.onicecandidate = (event) => {

    if (event.candidate && socket) {

        socket.send(JSON.stringify({
            type: "candidate",
            candidate: event.candidate
        }));
    }
};

peerConnection.onconnectionstatechange = () => {

    console.log(
        "Connection state:",
        peerConnection.connectionState
    );

    if (
        peerConnection.connectionState === "connected"
    ) {
        waitingScreen.classList.add("hidden");

        callStatus.textContent = "Terhubung";
    }

    if (
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "failed"
    ) {
        callStatus.textContent = "Koneksi terputus";
    }
};

return peerConnection;

}

// ===============================
// BUAT OFFER
// ===============================

async function createOffer() {

if (!peerConnection) {
    createPeerConnection();
}

const offer = await peerConnection.createOffer();

await peerConnection.setLocalDescription(offer);

socket.send(JSON.stringify({
    type: "offer",
    offer: offer
}));

}

// ===============================
// TERIMA OFFER
// ===============================

async function receiveOffer(offer) {

if (!peerConnection) {
    createPeerConnection();
}

await peerConnection.setRemoteDescription(
    new RTCSessionDescription(offer)
);

for (const candidate of pendingCandidates) {

    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error(error);
    }
}

pendingCandidates = [];

const answer =
    await peerConnection.createAnswer();

await peerConnection.setLocalDescription(answer);

socket.send(JSON.stringify({
    type: "answer",
    answer: answer
}));

}

// ===============================
// TERIMA ANSWER
// ===============================

async function receiveAnswer(answer) {

if (!peerConnection) {
    return;
}

await peerConnection.setRemoteDescription(
    new RTCSessionDescription(answer)
);

for (const candidate of pendingCandidates) {

    try {
        await peerConnection.addIceCandidate(candidate);
    } catch (error) {
        console.error(error);
    }
}

pendingCandidates = [];

}

// ===============================
// ICE CANDIDATE
// ===============================

async function receiveCandidate(candidate) {

const iceCandidate =
    new RTCIceCandidate(candidate);

if (
    peerConnection &&
    peerConnection.remoteDescription
) {

    try {
        await peerConnection.addIceCandidate(
            iceCandidate
        );
    } catch (error) {
        console.error(error);
    }

} else {

    pendingCandidates.push(iceCandidate);
}

}

// ===============================
// SIGNAL SERVER
// ===============================

async function handleSignal(data) {

console.log("Signal:", data);

switch (data.type) {

    case "joined":

        myRole = data.role;

        if (myRole === "caller") {

            waitingTitle.textContent =
                "Menunggu teman...";

            waitingText.textContent =
                "Bagikan link panggilan kepada teman Anda.";

            updateRoomLink();

            callStatus.textContent =
                "Menunggu teman";
        }

        if (myRole === "callee") {

            callStatus.textContent =
                "Panggilan masuk";
        }

        break;


    case "incoming":

        otherName = data.name || "Teman";

        incomingName.textContent =
            otherName;

        incomingCall.classList.remove("hidden");

        callStatus.textContent =
            "Panggilan masuk";

        break;


    case "ringing":

        otherName = data.name || "Teman";

        peerName.textContent =
            otherName;

        callStatus.textContent =
            "Memanggil...";

        waitingTitle.textContent =
            "Memanggil " + otherName + "...";

        updateRoomLink();

        break;


    case "accepted":

        callAccepted = true;

        otherName = data.name || otherName;

        peerName.textContent =
            otherName;

        callStatus.textContent =
            "Menghubungkan...";

        waitingTitle.textContent =
            "Menghubungkan...";

        createPeerConnection();

        await createOffer();

        break;


    case "rejected":

        callStatus.textContent =
            "Panggilan ditolak";

        showToast(
            "Teman menolak panggilan"
        );

        break;


    case "offer":

        await receiveOffer(data.offer);

        break;


    case "answer":

        await receiveAnswer(data.answer);

        break;


    case "candidate":

        await receiveCandidate(data.candidate);

        break;


    case "chat":

        addMessage(
            data.name || "Teman",
            data.message,
            false
        );

        break;


    case "leave":

        callStatus.textContent =
            "Teman keluar dari panggilan";

        waitingScreen.classList.remove("hidden");

        showToast(
            "Teman telah keluar"
        );

        break;


    case "full":

        alert(
            "Panggilan penuh.\n" +
            "Maksimal 2 orang."
        );

        cleanupCall();

        break;


    case "error":

        showToast(
            data.message || "Terjadi kesalahan"
        );

        break;
}

}

// ===============================
// MULAI PANGGILAN
// ===============================

async function startCall(room) {

if (!checkBrowser()) {
    return;
}

myName =
    nameInput.value.trim();

if (!myName) {

    alert("Masukkan nama Anda terlebih dahulu.");

    nameInput.focus();

    return;
}

roomId = room || randomRoomId();

window.history.replaceState(
    {},
    "",
    "?room=" + encodeURIComponent(roomId)
);

homePage.classList.add("hidden");
callPage.classList.remove("hidden");

waitingScreen.classList.remove("hidden");

peerName.textContent =
    "Menunggu...";

callStatus.textContent =
    "Mengaktifkan kamera...";

const cameraStarted =
    await startCamera();

if (!cameraStarted) {

    cleanupCall();

    return;
}

callStatus.textContent =
    "Menghubungkan ke server...";

try {

    await connectSocket();

} catch (error) {

    alert(
        "Tidak dapat terhubung ke server."
    );

    cleanupCall();
}

}

// ===============================
// BUAT PANGGILAN
// ===============================

createBtn.addEventListener(
"click",
async () => {

    await startCall();
}

);

// ===============================
// GABUNG PANGGILAN
// ===============================

joinBtn.addEventListener(
"click",
async () => {

    const value =
        roomInput.value.trim();

    if (!value) {

        alert(
            "Masukkan kode atau link panggilan."
        );

        roomInput.focus();

        return;
    }

    let room = value;

    try {

        if (value.includes("http")) {

            const url =
                new URL(value);

            room =
                url.searchParams.get("room");
        }

    } catch (error) {

        console.log(
            "Input bukan URL:",
            error
        );
    }

    if (!room) {

        alert(
            "Kode panggilan tidak valid."
        );

        return;
    }

    await startCall(room);
}

);

// ===============================
// COPY LINK
// ===============================

copyLinkBtn.addEventListener(
"click",
copyRoomLink
);

// ===============================
// INCOMING CALL
// ===============================

acceptBtn.addEventListener(
"click",
async () => {

    incomingCall.classList.add("hidden");

    callAccepted = true;

    callStatus.textContent =
        "Mengaktifkan kamera...";

    const cameraStarted =
        await startCamera();

    if (!cameraStarted) {
        return;
    }

    peerName.textContent =
        otherName;

    callStatus.textContent =
        "Menghubungkan...";

    createPeerConnection();

    socket.send(JSON.stringify({
        type: "accept"
    }));
}

);

rejectBtn.addEventListener(
"click",
() => {

    incomingCall.classList.add("hidden");

    if (socket) {

        socket.send(JSON.stringify({
            type: "reject"
        }));
    }

    callStatus.textContent =
        "Panggilan ditolak";

    showToast(
        "Panggilan ditolak"
    );
}

);

// ===============================
// CHAT
// ===============================

function addMessage(name, text, mine) {

const message =
    document.createElement("div");

message.className =
    mine
        ? "message mine"
        : "message";

message.innerHTML =
    "<strong>" +
    escapeHtml(name) +
    "</strong><br>" +
    escapeHtml(text);

messages.appendChild(message);

messages.scrollTop =
    messages.scrollHeight;

}

function escapeHtml(text) {

const div =
    document.createElement("div");

div.textContent =
    text;

return div.innerHTML;

}

function sendMessage() {

const text =
    messageInput.value.trim();

if (!text || !socket) {
    return;
}

socket.send(JSON.stringify({
    type: "chat",
    message: text,
    name: myName
}));

addMessage(
    myName,
    text,
    true
);

messageInput.value = "";

messageInput.focus();

}

sendBtn.addEventListener(
"click",
sendMessage
);

messageInput.addEventListener(
"keydown",
event => {

    if (event.key === "Enter") {
        sendMessage();
    }
}

);

// ===============================
// CHAT PANEL
// ===============================

chatBtn.addEventListener(
"click",
() => {

    chatPanel.classList.toggle("open");
}

);

closeChatBtn.addEventListener(
"click",
() => {

    chatPanel.classList.remove("open");
}

);

// ===============================
// MUTE
// ===============================

muteBtn.addEventListener(
"click",
() => {

    if (!localStream) {
        return;
    }

    const audioTracks =
        localStream.getAudioTracks();

    if (!audioTracks.length) {
        return;
    }

    audioTracks[0].enabled =
        !audioTracks[0].enabled;

    muteBtn.textContent =
        audioTracks[0].enabled
            ? "🎤"
            : "🔇";

    showToast(
        audioTracks[0].enabled
            ? "Mikrofon aktif"
            : "Mikrofon dimatikan"
    );
}

);

// ===============================
// CAMERA
// ===============================

cameraBtn.addEventListener(
"click",
() => {

    if (!localStream) {
        return;
    }

    const videoTracks =
        localStream.getVideoTracks();

    if (!videoTracks.length) {
        return;
    }

    videoTracks[0].enabled =
        !videoTracks[0].enabled;

    cameraBtn.textContent =
        videoTracks[0].enabled
            ? "📹"
            : "🚫";

    showToast(
        videoTracks[0].enabled
            ? "Kamera aktif"
            : "Kamera dimatikan"
    );
}

);

// ===============================
// HANG UP
// ===============================

hangupBtn.addEventListener(
"click",
() => {

    if (socket) {

        try {

            socket.send(JSON.stringify({
                type: "leave"
            }));

        } catch (error) {

            console.error(error);
        }
    }

    cleanupCall();
}

);

// ===============================
// BERSIHKAN PANGGILAN
// ===============================

function cleanupCall() {

if (peerConnection) {

    peerConnection.close();

    peerConnection = null;
}

if (localStream) {

    localStream.getTracks()
        .forEach(track => track.stop());

    localStream = null;
}

if (socket) {

    try {
        socket.close();
    } catch (error) {
        console.error(error);
    }

    socket = null;
}

remoteVideo.srcObject = null;
localVideo.srcObject = null;

pendingCandidates = [];

callAccepted = false;

incomingCall.classList.add("hidden");

chatPanel.classList.remove("open");

messages.innerHTML = "";

window.history.replaceState(
    {},
    "",
    window.location.pathname
);

callPage.classList.add("hidden");
homePage.classList.remove("hidden");

showHomeStatus("");

callStatus.textContent =
    "Menghubungkan...";

peerName.textContent =
    "Menunggu...";

}

// ===============================
// LINK ROOM OTOMATIS
// ===============================

window.addEventListener(
"load",
() => {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const room =
        params.get("room");

    if (room) {

        roomInput.value =
            room;

        showHomeStatus(
            "Link panggilan ditemukan. Masukkan nama lalu tekan Gabung Panggilan."
        );
    }
}

);
