const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { initPokerHandlers } = require('./pokerHandler');
const { initXiangqiHandlers } = require('./xiangqiHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 容器内部服务监听端口：26902
const PORT = process.env.PORT || 26902;

// 托管 public 目录下的静态前端文件
app.use(express.static(path.join(__dirname, '../../public')));

// 托管 shared 目录下的静态前端文件
app.use('/shared', express.static(path.join(__dirname, '../shared')));

io.on('connection', (socket) => {
    console.log('新玩家连接:', socket.id);

    // 初始化各个游戏处理器
    initXiangqiHandlers(io, socket);
    initPokerHandlers(io, socket);

    // 断开连接日志（具体的清理逻辑在各自的 Handler 中）
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`游戏服务器已启动，正在监听内部端口 ${PORT}`);
    console.log(`外部请访问 http://localhost:26002 (如果通过 docker-compose 映射)`);
});
