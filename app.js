const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 容器内部服务监听端口：26902
const PORT = process.env.PORT || 26902;

// 托管 public 目录下的静态前端文件
app.use(express.static(path.join(__dirname, 'public')));

// 象棋房间数据
const xiangqiRooms = {};

io.on('connection', (socket) => {
    console.log('新玩家连接:', socket.id);

    // 创建房间
    socket.on('createRoom', () => {
        // 生成 4 位随机房间号
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        xiangqiRooms[roomId] = {
            players: { red: socket.id, black: null },
            boardState: null // 可以用来保存棋盘状态，防刷新（可选）
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`玩家 ${socket.id} 创建了房间 ${roomId}`);
    });

    // 加入房间
    socket.on('joinRoom', (roomId) => {
        const room = xiangqiRooms[roomId];
        if (room) {
            if (!room.players.black) {
                room.players.black = socket.id;
                socket.join(roomId);
                socket.emit('roomJoined', { roomId, color: 'black' });
                // 通知红方（房主）游戏开始
                io.to(room.players.red).emit('gameStart', { color: 'red', opponent: socket.id });
                // 通知黑方（加入者）游戏开始
                io.to(socket.id).emit('gameStart', { color: 'black', opponent: room.players.red });
                console.log(`玩家 ${socket.id} 加入了房间 ${roomId}`);
            } else {
                socket.emit('errorMsg', '房间已满');
            }
        } else {
            socket.emit('errorMsg', '房间不存在');
        }
    });

    // 走棋事件
    socket.on('move', (data) => {
        // data 包含 roomId, from (x,y), to (x,y)
        socket.to(data.roomId).emit('opponentMove', data);
    });

    // 认输/重新开始
    socket.on('gameOver', (data) => {
        socket.to(data.roomId).emit('gameOver', data);
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);
        // 简单处理：如果玩家在房间中，通知对手
        for (const roomId in xiangqiRooms) {
            const room = xiangqiRooms[roomId];
            if (room.players.red === socket.id || room.players.black === socket.id) {
                socket.to(roomId).emit('opponentDisconnected');
                delete xiangqiRooms[roomId];
                break;
            }
        }
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`游戏服务器已启动，正在监听内部端口 ${PORT}`);
    console.log(`外部请访问 http://localhost:26002 (如果通过 docker-compose 映射)`);
});
