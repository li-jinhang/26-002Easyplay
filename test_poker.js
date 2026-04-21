const io = require("socket.io-client");

const socket1 = io("http://localhost:26002");
const socket2 = io("http://localhost:26002");
const socket3 = io("http://localhost:26002");

socket1.on('connect', () => {
    console.log('socket1 connected');
    socket1.emit('pokerCreateRoom', 'Player1');
});

socket1.on('pokerRoomCreated', (roomId) => {
    console.log('Room created:', roomId);
    socket2.emit('pokerJoinRoom', { roomId, playerName: 'Player2' });
    
    setTimeout(() => {
        socket3.emit('pokerJoinRoom', { roomId, playerName: 'Player3' });
    }, 500);
});

socket1.on('pokerRoomUpdate', (state) => console.log('S1 Update:', state.state));
socket1.on('errorMsg', (msg) => console.log('S1 Error:', msg));

socket2.on('pokerRoomJoined', (data) => console.log('S2 joined:', data.roomId));
socket2.on('errorMsg', (msg) => console.log('S2 Error:', msg));

socket3.on('pokerRoomJoined', (data) => console.log('S3 joined:', data.roomId));
socket3.on('errorMsg', (msg) => console.log('S3 Error:', msg));

setTimeout(() => {
    process.exit(0);
}, 3000);
