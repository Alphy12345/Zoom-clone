// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidV4 } = require('uuid');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// PeerServer mounted at /peerjs
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

// Socket.io with CORS (tighten origin in prod)
const io = new Server(server, {
  cors: {
    origin: ["*"], // change to your frontend URL in production e.g. "https://your-site.vercel.app"
    methods: ["GET", "POST"]
  }
});

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

// route that renders room and injects SIGNALING_SERVER if set
app.get('/:room', (req, res) => {
  // if you deploy frontend separately, set FRONTEND_URL env on server or Vercel env on frontend
  const SIGNALING_SERVER = process.env.SIGNALING_SERVER || `${req.protocol}://${req.get('host')}`;
  res.render('room', { roomId: req.params.room, SIGNALING_SERVER });
});

io.on('connection', socket => {
  console.log('✅ Socket connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    console.log(`👤 User ${userId} joining room ${roomId}`);
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    socket.on('signal', data => {
      // generic relay if your client uses custom signalling
      if (data.to) io.to(data.to).emit('signal', data);
    });

    socket.on('disconnect', () => {
      console.log(`❌ User ${userId} disconnected`);
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
