const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const { v4: uuidV4 } = require('uuid')
const { ExpressPeerServer } = require('peer')

const peerServer = ExpressPeerServer(server, {
    debug: true
})

app.use('/peerjs', peerServer)
app.set('view engine', 'ejs')
app.use(express.static('public'))

app.get('/', (req, res) => {
    res.redirect(`/${uuidV4()}`)
})

app.get('/:room', (req, res) => {
    res.render('room', { roomId: req.params.room })
})

io.on('connection', socket => {
    console.log('✅ Socket connected:', socket.id)
    
    socket.on('join-room', (roomId, userId) => {
        console.log(`👤 User ${userId} joining room ${roomId}`)
        socket.join(roomId)
        socket.to(roomId).emit('user-connected', userId)

        socket.on('disconnect', () => {
            console.log(`❌ User ${userId} disconnected`)
            socket.to(roomId).emit('user-disconnected', userId)
        })
    })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
})