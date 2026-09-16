// ================================
// VIDEOCHAT - APP.JS
// ================================

const homePage = document.getElementById("homePage");
const callPage = document.getElementById("callPage");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const homeStatus = document.getElementById("homeStatus");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const waitingScreen = document.getElementById("waitingScreen");
const waitingTitle = document.getElementById("waitingTitle");
const waitingText = document.getElementById("waitingText");

const copyLinkBtn = document.getElementById("copyLinkBtn");

const peerName = document.getElementById("peerName");
const callStatus = document.getElementById("callStatus");

const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const hangupBtn = document.getElementById("hangupBtn");

const chatBtn = document.getElementById("chatBtn");
const chatPanel = document.getElementById("chatPanel");
const closeChatBtn = document.getElementById("closeChatBtn");

const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const incomingCall = document.getElementById("incomingCall");
const incomingName = document.getElementById("incomingName");
const acceptBtn = document.getElementById("acceptBtn");
const rejectBtn = document.getElementById("rejectBtn");

const toast = document.getElementById("toast");


// ================================
// DATA
// ================================

let socket = null;
let peerConnection = null;

let localStream = null;

let roomId = null;
let myName = "";
let peerUserName = "";

let isCaller = false;
let callAccepted = false;

let microphoneEnabled = true;
let cameraEnabled = true;

let pendingCandidates = [];


// ================================
// WEBRTC
// ================================

let rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};


// Ambil konfigurasi TURN jika tersedia
async function loadRtcConfig() {

    try {

        const response = await fetch("/config");

        if (!response.ok) {
            return;
        }

        const config = await response.json();

        if (
            config &&
            Array.isArray(config.iceServers) &&
            config.iceServers.length > 0
        ) {
            rtcConfig = {
                iceServers: config.iceServers
            };
        }

    } catch (error) {

        console.log("TURN config tidak tersedia.");

    }
}


// ================================
// UTILITAS
// ================================

function showToast(text) {

    toast.textContent = text;
    toast.classList.remove("hidden");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.add("hidden");
    }, 2500);
}


function setHomeStatus(text) {
    homeStatus.textContent = text;
}


function showHome() {

    homePage.classList.remove("hidden");
    callPage.classList.add("hidden");

}


function showCallPage() {

    homePage.classList.add("hidden");
    callPage.classList.remove("hidden");

}


function createRoomId() {

    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {

        return window.crypto
            .randomUUID()
            .replace(/-/g, "")
            .substring(0, 12);

    }

    return Math.random()
        .toString(36)
        .substring(2, 14);

}


function getRoomFromUrl() {

    const params = new URLSearchParams(window.location.search);

    return params.get("room") || "";

}


function updateUrl() {

    const url =
        window.location.origin +
        window.location.pathname +
        "?room=" +
        encodeURIComponent(roomId);

    window.history.replaceState({}, "", url);

}


function clearCallUrl() {

    window.history.replaceState(
        {},
        "",
        window.location.pathname
    );

}


// ================================
// NAMA
// ================================

function getName() {

    const name = nameInput.value.trim();

    if (!name) {

        setHomeStatus("Silakan masukkan nama Anda.");

        nameInput.focus();

        return null;
    }

    myName = name.substring(0, 30);

    return myName;
}


// ================================
// BUAT PANGGILAN
// ================================

createBtn.addEventListener("click", async () => {

    const name = getName();

    if (!name) {
        return;
    }

    roomId = createRoomId();

    isCaller = true;
    callAccepted = false;

    roomInput.value = roomId;

    updateUrl();

    await startCallPage();

    waitingTitle.textContent = "Menunggu teman...";
    waitingText.textContent =
        "Bagikan link panggilan kepada teman Anda.";

    copyLinkBtn.classList.remove("hidden");

    peerName.textContent = "Menunggu teman...";
    callStatus.textContent = "Menunggu panggilan masuk...";

    connectSocket();

});


// ================================
// GABUNG PANGGILAN
// ================================

joinBtn.addEventListener("click", async () => {

    const name = getName();

    if (!name) {
        return;
    }

    const enteredRoom = roomInput.value.trim();

    if (!enteredRoom) {

        setHomeStatus(
            "Masukkan kode atau link panggilan."
        );

        roomInput.focus();

        return;
    }

    roomId = extractRoomId(enteredRoom);

    if (!roomId) {

        setHomeStatus(
            "Kode panggilan tidak valid."
        );

        return;
    }

    isCaller = false;
    callAccepted = false;

    updateUrl();

    await startCallPage();

    connectSocket();

});


// ================================
// EKSTRAK ROOM DARI LINK
// ================================

function extractRoomId(value) {

    try {

        if (
            value.startsWith("http://") ||
            value.startsWith("https://")
        ) {

            const url = new URL(value);

            return url.searchParams.get("room") || "";

        }

    } catch (error) {

        return "";

    }

    return value
        .replace(/\s/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .substring(0, 50);

}


// ================================
// MULAI HALAMAN CALL
// ================================

async function startCallPage() {

    showCallPage();

    try {

        await startLocalCamera();

    } catch (error) {

        console.error(error);

        showToast(
            "Kamera/mikrofon tidak dapat digunakan."
        );

        callStatus.textContent =
            "Kamera/mikrofon belum diizinkan.";
    }

}


// ================================
// KAMERA + MIKROFON
// ================================

async function startLocalCamera() {

    if (localStream) {
        return;
    }

    localStream =
        await navigator.mediaDevices.getUserMedia({
            video: {
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                },
                facingMode: "user"
            },
            audio: true
        });

    localVideo.srcObject = localStream;

}


// ================================
// WEBSOCKET
// ================================

function connectSocket() {

    if (socket) {

        try {
            socket.close();
        } catch (error) {}

    }

    const protocol =
        window.location.protocol === "https:"
            ? "wss:"
            : "ws:";

    socket = new WebSocket(
        protocol +
        "//" +
        window.location.host
    );


    socket.addEventListener("open", () => {

        console.log("WebSocket terhubung.");

        sendSignal({
            type: "join",
            room: roomId,
            name: myName
        });

    });


    socket.addEventListener("message", async event => {

        try {

            const message =
                JSON.parse(event.data);

            await handleSignal(message);

        } catch (error) {

            console.error(
                "Pesan signaling error:",
                error
            );

        }

    });


    socket.addEventListener("close", () => {

        console.log(
            "WebSocket terputus."
        );

    });


    socket.addEventListener("error", error => {

        console.error(
            "WebSocket error:",
            error
        );

        showToast(
            "Koneksi server bermasalah."
        );

    });

}


// ================================
// KIRIM SIGNAL
// ================================

function sendSignal(data) {

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


// ================================
// TERIMA SIGNAL
// ================================

async function handleSignal(message) {

    switch (message.type) {


        // ----------------------------
        // BERHASIL MASUK ROOM
        // ----------------------------

        case "joined":

            if (message.role === "caller") {

                isCaller = true;

                waitingTitle.textContent =
                    "Menunggu teman...";

                waitingText.textContent =
                    "Bagikan link panggilan kepada teman Anda.";

                callStatus.textContent =
                    "Menunggu teman...";

            } else {

                isCaller = false;

                waitingTitle.textContent =
                    "Panggilan masuk";

                waitingText.textContent =
                    "Menunggu Anda menerima panggilan.";

            }

            break;


        // ----------------------------
        // PANGGILAN MASUK
        // ----------------------------

        case "incoming":

            peerUserName =
                message.name || "Teman";

            incomingName.textContent =
                peerUserName;

            peerName.textContent =
                peerUserName;

            callStatus.textContent =
                "Panggilan masuk...";

            incomingCall.classList.remove(
                "hidden"
            );

            break;


        // ----------------------------
        // TEMAN SEDANG MENELEPON
        // ----------------------------

        case "ringing":

            peerUserName =
                message.name || "Teman";

            peerName.textContent =
                peerUserName;

            callStatus.textContent =
                "Memanggil...";

            waitingTitle.textContent =
                "Memanggil teman...";

            waitingText.textContent =
                "Menunggu teman menerima panggilan.";

            break;


        // ----------------------------
        // PANGGILAN DITERIMA
        // ----------------------------

        case "accepted":

            callAccepted = true;

            peerUserName =
                message.name || peerUserName || "Teman";

            peerName.textContent =
                peerUserName;

            callStatus.textContent =
                "Menghubungkan...";

            waitingScreen.classList.add(
                "hidden"
            );

            await createPeerConnection();

            await createOffer();

            break;


        // ----------------------------
        // PANGGILAN DITOLAK
        // ----------------------------

        case "rejected":

            callStatus.textContent =
                "Panggilan ditolak.";

            waitingTitle.textContent =
                "Panggilan ditolak";

            waitingText.textContent =
                "Teman menolak panggilan.";

            showToast(
                "Panggilan ditolak."
            );

            break;


        // ----------------------------
        // OFFER
        // ----------------------------

        case "offer":

            waitingScreen.classList.add(
                "hidden"
            );

            await createPeerConnection();

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    message.offer
                )
            );

            await flushPendingCandidates();

            const answer =
                await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(
                answer
            );

            sendSignal({
                type: "answer",
                room: roomId,
                answer: answer
            });

            callStatus.textContent =
                "Menghubungkan video...";

            break;


        // ----------------------------
        // ANSWER
        // ----------------------------

        case "answer":

            if (!peerConnection) {
                return;
            }

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    message.answer
                )
            );

            await flushPendingCandidates();

            callStatus.textContent =
                "Video call terhubung.";

            break;


        // ----------------------------
        // ICE CANDIDATE
        // ----------------------------

        case "candidate":

            if (!message.candidate) {
                return;
            }

            if (
                peerConnection &&
                peerConnection.remoteDescription
            ) {

                try {

                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(
                            message.candidate
                        )
                    );

                } catch (error) {

                    console.error(
                        "ICE candidate error:",
                        error
                    );

                }

            } else {

                pendingCandidates.push(
                    message.candidate
                );

            }

            break;


        // ----------------------------
        // CHAT
        // ----------------------------

        case "chat":

            addMessage(
                message.name || "Teman",
                message.text || "",
                false
            );

            break;


        // ----------------------------
        // TEMAN KELUAR
        // ----------------------------

        case "leave":

            handlePeerLeft();

            break;


        // ----------------------------
        // ROOM PENUH
        // ----------------------------

        case "full":

            showToast(
                "Panggilan ini sudah penuh."
            );

            callStatus.textContent =
                "Room sudah digunakan 2 orang.";

            setTimeout(() => {
                hangUp(false);
            }, 1500);

            break;


        // ----------------------------
        // ERROR
        // ----------------------------

        case "error":

            showToast(
                message.message ||
                "Terjadi kesalahan."
            );

            break;

    }

}


// ================================
// PEER CONNECTION
// ================================

async function createPeerConnection() {

    if (peerConnection) {
        return;
    }

    peerConnection =
        new RTCPeerConnection(
            rtcConfig
        );


    // Tambahkan kamera + mikrofon
    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                peerConnection.addTrack(
                    track,
                    localStream
                );

            });

    }


    // Video teman
    peerConnection.addEventListener(
        "track",
        event => {

            if (
                event.streams &&
                event.streams[0]
            ) {

                remoteVideo.srcObject =
                    event.streams[0];

                waitingScreen.classList.add(
                    "hidden"
                );

                callStatus.textContent =
                    "Terhubung";

            }

        }
    );


    // ICE
    peerConnection.addEventListener(
        "icecandidate",
        event => {

            if (event.candidate) {

                sendSignal({
                    type: "candidate",
                    room: roomId,
                    candidate: event.candidate
                });

            }

        }
    );


    // Status koneksi
    peerConnection.addEventListener(
        "connectionstatechange",
        () => {

            const state =
                peerConnection.connectionState;

            console.log(
                "WebRTC:",
                state
            );

            if (state === "connected") {

                waitingScreen.classList.add(
                    "hidden"
                );

                callStatus.textContent =
                    "Terhubung";

            }

            if (
                state === "disconnected" ||
                state === "failed"
            ) {

                callStatus.textContent =
                    "Koneksi terputus.";

            }

        }
    );

}


// ================================
// BUAT OFFER
// ================================

async function createOffer() {

    if (!peerConnection) {
        return;
    }

    const offer =
        await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
        offer
    );

    sendSignal({
        type: "offer",
        room: roomId,
        offer: offer
    });

}


// ================================
// ICE QUEUE
// ================================

async function flushPendingCandidates() {

    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    for (
        const candidate
        of pendingCandidates
    ) {

        try {

            await peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );

        } catch (error) {

            console.error(
                "Queued ICE error:",
                error
            );

        }

    }

    pendingCandidates = [];

}


// ================================
// TERIMA PANGGILAN
// ================================

acceptBtn.addEventListener(
    "click",
    async () => {

        incomingCall.classList.add(
            "hidden"
        );

        callAccepted = true;

        waitingScreen.classList.add(
            "hidden"
        );

        callStatus.textContent =
            "Menerima panggilan...";

        sendSignal({
            type: "accept",
            room: roomId,
            name: myName
        });

    }
);


// ================================
// TOLAK PANGGILAN
// ================================

rejectBtn.addEventListener(
    "click",
    () => {

        incomingCall.classList.add(
            "hidden"
        );

        sendSignal({
            type: "reject",
            room: roomId
        });

        callStatus.textContent =
            "Panggilan ditolak.";

        waitingTitle.textContent =
            "Panggilan ditolak";

        waitingText.textContent =
            "Anda menolak panggilan.";

    }
);


// ================================
// MIKROFON
// ================================

muteBtn.addEventListener(
    "click",
    () => {

        if (!localStream) {
            return;
        }

        const tracks =
            localStream.getAudioTracks();

        if (tracks.length === 0) {
            return;
        }

        microphoneEnabled =
            !microphoneEnabled;

        tracks.forEach(track => {

            track.enabled =
                microphoneEnabled;

        });

        muteBtn.textContent =
            microphoneEnabled
                ? "🎤"
                : "🔇";

        muteBtn.classList.toggle(
            "active",
            !microphoneEnabled
        );

    }
);


// ================================
// KAMERA
// ================================

cameraBtn.addEventListener(
    "click",
    () => {

        if (!localStream) {
            return;
        }

        const tracks =
            localStream.getVideoTracks();

        if (tracks.length === 0) {
            return;
        }

        cameraEnabled =
            !cameraEnabled;

        tracks.forEach(track => {

            track.enabled =
                cameraEnabled;

        });

        cameraBtn.textContent =
            cameraEnabled
                ? "📹"
                : "🚫";

        cameraBtn.classList.toggle(
            "active",
            !cameraEnabled
        );

    }
);


// ================================
// CHAT BUKA/TUTUP
// ================================

chatBtn.addEventListener(
    "click",
    () => {

        chatPanel.classList.toggle(
            "hidden"
        );

        if (
            !chatPanel.classList.contains(
                "hidden"
            )
        ) {

            messageInput.focus();

        }

    }
);


closeChatBtn.addEventListener(
    "click",
    () => {

        chatPanel.classList.add(
            "hidden"
        );

    }
);


// ================================
// KIRIM CHAT
// ================================

function sendChat() {

    const text =
        messageInput.value.trim();

    if (!text) {
        return;
    }

    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {

        showToast(
            "Belum terhubung."
        );

        return;
    }

    sendSignal({
        type: "chat",
        room: roomId,
        name: myName,
        text: text.substring(0, 500)
    });

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
    sendChat
);


messageInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            event.preventDefault();

            sendChat();

        }

    }
);


// ================================
// TAMPILKAN CHAT
// ================================

function addMessage(
    name,
    text,
    mine
) {

    if (!text) {
        return;
    }

    const message =
        document.createElement("div");

    message.className =
        "message " +
        (mine ? "me" : "other");


    const nameElement =
        document.createElement("span");

    nameElement.className =
        "message-name";

    nameElement.textContent =
        mine ? "Anda" : name;


    const textElement =
        document.createElement("div");

    textElement.textContent =
        text;


    message.appendChild(
        nameElement
    );

    message.appendChild(
        textElement
    );

    messages.appendChild(
        message
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ================================
// SALIN LINK
// ================================

copyLinkBtn.addEventListener(
    "click",
    async () => {

        const link =
            window.location.origin +
            window.location.pathname +
            "?room=" +
            encodeURIComponent(roomId);

        try {

            await navigator.clipboard.writeText(
                link
            );

            showToast(
                "Link panggilan disalin."
            );

        } catch (error) {

            // Cadangan untuk browser lama
            const textarea =
                document.createElement("textarea");

            textarea.value = link;

            document.body.appendChild(
                textarea
            );

            textarea.select();

            document.execCommand(
                "copy"
            );

            textarea.remove();

            showToast(
                "Link panggilan disalin."
            );

        }

    }
);


// ================================
// TEMAN KELUAR
// ================================

function handlePeerLeft() {

    peerName.textContent =
        "Teman keluar";

    callStatus.textContent =
        "Teman telah meninggalkan panggilan.";

    waitingScreen.classList.remove(
        "hidden"
    );

    waitingTitle.textContent =
        "Teman keluar";

    waitingText.textContent =
        "Anda dapat membagikan link lagi.";

    remoteVideo.srcObject = null;

    if (peerConnection) {

        try {
            peerConnection.close();
        } catch (error) {}

        peerConnection = null;

    }

    callAccepted = false;

}


// ================================
// HANG UP
// ================================

hangupBtn.addEventListener(
    "click",
    () => {
        hangUp(true);
    }
);


function hangUp(sendLeave = true) {

    if (sendLeave) {

        sendSignal({
            type: "leave",
            room: roomId
        });

    }


    if (peerConnection) {

        try {
            peerConnection.close();
        } catch (error) {}

        peerConnection = null;

    }


    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });

        localStream = null;

    }


    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    if (localVideo) {
        localVideo.srcObject = null;
    }


    if (socket) {

        try {
            socket.close();
        } catch (error) {}

        socket = null;

    }


    incomingCall.classList.add(
        "hidden"
    );

    chatPanel.classList.add(
        "hidden"
    );

    waitingScreen.classList.remove(
        "hidden"
    );

    pendingCandidates = [];

    callAccepted = false;

    microphoneEnabled = true;
    cameraEnabled = true;

    muteBtn.textContent = "🎤";
    cameraBtn.textContent = "📹";

    clearCallUrl();

    showHome();

}


// ================================
// LINK ROOM SAAT HALAMAN DIBUKA
// ================================

const roomFromUrl =
    getRoomFromUrl();

if (roomFromUrl) {

    roomInput.value =
        roomFromUrl;

}


// ================================
// LOAD CONFIG
// ================================

loadRtcConfig();


// ================================
// CEK BROWSER
// ================================

if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
) {

    setHomeStatus(
        "Browser ini tidak mendukung video call."
    );

}
