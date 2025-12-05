const socket = io('/')
const videoGrid = document.getElementById('video-grid')

// Auto-detect if we're on localhost or production
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const myPeer = new Peer(undefined, {
    path: '/peerjs',
    host: isLocalhost ? 'localhost' : window.location.hostname,
    port: isLocalhost ? 3000 : 443,
    secure: !isLocalhost
})

const myVideo = document.createElement('video')
myVideo.muted = true
const peers = {}

console.log('🎬 Script loaded')

myPeer.on('open', id => {
    console.log('🆔 My peer ID:', id)
    socket.emit('join-room', ROOM_ID, id)
})

myPeer.on('error', err => {
    console.error('❌ PeerJS error:', err)
})

socket.on('connect', () => {
    console.log('✅ Socket connected')
})

navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
}).then(stream => {
    console.log('📹 Got local stream')
    addVideoStream(myVideo, stream)
    
    myPeer.on('call', call => {
        console.log('📞 Receiving call from:', call.peer)
        call.answer(stream)
        const video = document.createElement('video')
        call.on('stream', userVideoStream => {
            console.log('📺 Receiving stream from:', call.peer)
            addVideoStream(video, userVideoStream)
        })
    })

    socket.on('user-connected', userId => {
        console.log('👥 User connected:', userId)
        setTimeout(() => {
            connectToNewUser(userId, stream)
        }, 1000)
    })
}).catch(err => {
    console.error('❌ Error getting media:', err)
    alert('Please allow camera and microphone access!')
})

socket.on('user-disconnected', userId => {
    console.log('👋 User disconnected:', userId)
    if (peers[userId]) {
        peers[userId].close()
    }
})

function connectToNewUser(userId, stream) {
    console.log('📲 Calling new user:', userId)
    const call = myPeer.call(userId, stream)
    const video = document.createElement('video')
    
    call.on('stream', userVideoStream => {
        console.log('✅ Got stream from user:', userId)
        addVideoStream(video, userVideoStream)
    })
    
    call.on('close', () => {
        console.log('🔌 Call closed with:', userId)
        video.remove()
    })
    
    call.on('error', err => {
        console.error('❌ Call error with', userId, ':', err)
    })

    peers[userId] = call 
}

function addVideoStream(video, stream) {
    video.srcObject = stream
    video.addEventListener('loadedmetadata', () => {
        video.play()
    })
    videoGrid.append(video)
    console.log('📊 Video added! Total videos:', videoGrid.children.length)
}