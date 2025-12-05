// script.js
// Expects ROOM_ID and SIGNALING_SERVER to be set in the page (room.ejs)
const videoGrid = document.getElementById('video-grid');
const startRecBtn = document.getElementById('start-record');
const stopRecBtn = document.getElementById('stop-record');
const downloadLink = document.getElementById('download-link');
const recordIndicator = document.getElementById('record-indicator');
const recordCanvas = document.getElementById('record-canvas');

if (!ROOM_ID) {
  alert('No ROOM_ID set!');
}

console.log('🌐 SIGNALING_SERVER:', SIGNALING_SERVER);

// connect socket to SIGNALING_SERVER
const socket = io(SIGNALING_SERVER, { transports: ['websocket', 'polling'] });

// PeerJS connected to SIGNALING_SERVER's /peerjs
const peerOptions = {
  path: '/peerjs',
  host: new URL(SIGNALING_SERVER).hostname,
  port: (new URL(SIGNALING_SERVER).protocol === 'https:' ? (new URL(SIGNALING_SERVER).port || 443) : (new URL(SIGNALING_SERVER).port || 80)),
  secure: new URL(SIGNALING_SERVER).protocol === 'https:'
};
// NOTE: Peer constructor needs host without protocol in browser usage; using Peer(undefined, {host, path, port, secure})
const myPeer = new Peer(undefined, {
  path: '/peerjs',
  host: new URL(SIGNALING_SERVER).hostname,
  port: (new URL(SIGNALING_SERVER).protocol === 'https:' ? (new URL(SIGNALING_SERVER).port || 443) : (new URL(SIGNALING_SERVER).port || 80)),
  secure: new URL(SIGNALING_SERVER).protocol === 'https:'
});

const myVideo = document.createElement('video');
myVideo.muted = true;
const peers = {}; // peerId => call

console.log('Connecting to Peer server with options:', peerOptions);

myPeer.on('open', id => {
  console.log('🆔 My peer ID:', id);
  socket.emit('join-room', ROOM_ID, id);
});

socket.on('connect', () => {
  console.log('✅ Socket connected to signalling server');
});

socket.on('user-connected', userId => {
  console.log('👥 User connected:', userId);
  // wait for a bit then call
  setTimeout(() => {
    if (localStream) connectToNewUser(userId, localStream);
  }, 500);
});

socket.on('user-disconnected', userId => {
  console.log('👋 User disconnected:', userId);
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }
});

let localStream = null;
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    console.log('📹 Got local stream');
    localStream = stream;
    addVideoStream(myVideo, stream, true);

    myPeer.on('call', call => {
      console.log('📞 Incoming call from', call.peer);
      call.answer(stream);
      const video = document.createElement('video');
      call.on('stream', userVideoStream => {
        addVideoStream(video, userVideoStream);
      });
      call.on('close', () => {
        video.remove();
      });
      peers[call.peer] = call;
    });
  }).catch(err => {
    console.error('❌ Error getting media:', err);
    alert('Please allow camera and microphone access!');
  });

function connectToNewUser(userId, stream) {
  console.log('📲 Calling new user:', userId);
  try {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
    call.on('close', () => {
      video.remove();
    });
    call.on('error', err => {
      console.error('❌ Call error with', userId, err);
    });
    peers[userId] = call;
  } catch (e) {
    console.error('Call failed', e);
  }
}

function addVideoStream(videoEl, stream, muted = false) {
  videoEl.srcObject = stream;
  videoEl.muted = muted;
  videoEl.addEventListener('loadedmetadata', () => videoEl.play().catch(()=>{}));
  videoGrid.appendChild(videoEl);
  console.log('📊 Video added. Count:', videoGrid.children.length);
  updateCanvasSize();
}

/* ---------- Recording: composite all videos into a canvas and record ---------- */

let recorder = null;
let recordedChunks = [];
let canvasCtx = null;
let rafId = null;

function updateCanvasSize() {
  // set canvas size to match the grid width/height
  const width = Math.max(document.documentElement.clientWidth, 800);
  const height = Math.max(600, window.innerHeight - 100);
  recordCanvas.width = width;
  recordCanvas.height = height;
  if (!canvasCtx) canvasCtx = recordCanvas.getContext('2d');
}

function drawAllVideosToCanvas() {
  const videos = Array.from(videoGrid.querySelectorAll('video'));
  const cols = Math.ceil(Math.sqrt(Math.max(1, videos.length)));
  const rows = Math.ceil(videos.length / cols);
  const w = Math.floor(recordCanvas.width / cols);
  const h = Math.floor(recordCanvas.height / rows);

  // black background
  canvasCtx.fillStyle = '#000';
  canvasCtx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);

  videos.forEach((v, idx) => {
    if (v.readyState < 2) return; // not ready
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const dx = col * w;
    const dy = row * h;
    // draw centered and preserve aspect by cropping letterbox
    const ar = v.videoWidth / v.videoHeight || 1;
    const canvasAr = w / h;
    let sw = v.videoWidth, sh = v.videoHeight, sx = 0, sy = 0;
    if (ar > canvasAr) {
      // video wider than canvas cell — crop sides
      sw = v.videoHeight * canvasAr;
      sx = (v.videoWidth - sw) / 2;
    } else {
      // video taller — crop top/bottom
      sh = v.videoWidth / canvasAr;
      sy = (v.videoHeight - sh) / 2;
    }
    try {
      canvasCtx.drawImage(v, sx, sy, sw, sh, dx, dy, w, h);
    } catch (e) {
      // sometimes drawImage fails if video not ready
    }
  });

  rafId = requestAnimationFrame(drawAllVideosToCanvas);
}

startRecBtn.addEventListener('click', () => {
  if (!recordCanvas || !canvasCtx) updateCanvasSize();
  drawAllVideosToCanvas();
  const canvasStream = recordCanvas.captureStream(25); // 25 fps
  // combine canvas stream with local audio track (so recorder also has audio)
  const audioTracks = [];
  if (localStream) {
    localStream.getAudioTracks().forEach(t => audioTracks.push(t));
  }
  const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

  recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
  recordedChunks = [];
  recorder.ondataavailable = e => {
    if (e.data && e.data.size) recordedChunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.style.display = 'inline';
    downloadLink.download = `recording-${ROOM_ID}-${Date.now()}.webm`;
    stopRecBtn.disabled = true;
    startRecBtn.disabled = false;
    recordIndicator.style.background = 'transparent';
    cancelAnimationFrame(rafId);
    rafId = null;
  };

  recorder.start(1000); // emit data every 1s
  startRecBtn.disabled = true;
  stopRecBtn.disabled = false;
  downloadLink.style.display = 'none';
  recordIndicator.style.background = 'red';
  console.log('🔴 Recording started');
});

stopRecBtn.addEventListener('click', () => {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  console.log('⏹ Recording stopped');
});

/* Make sure canvas updates on resize */
window.addEventListener('resize', updateCanvasSize);
updateCanvasSize();
