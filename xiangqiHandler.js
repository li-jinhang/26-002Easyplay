const RoomManager = require('./RoomManager');
const XiangqiRules = require('./public/xiangqiRules');

// 象棋房间管理器实例（不使用前缀，以保持与原有逻辑兼容）
const xiangqiRooms = new RoomManager();

function initXiangqiHandlers(io, socket) {
    // 创建房间
    socket.on('createRoom', () => {
        const room = xiangqiRooms.createRoom(socket, {
            players: { red: socket.id, black: null },
            boardState: XiangqiRules.getBoardCopy(),
            currentTurn: 'red',
            status: 'waiting' // waiting, playing, finished
        });
        const roomId = room.id;
        
        socket.emit('roomCreated', roomId);
        console.log(`玩家 ${socket.id} 创建了象棋房间 ${roomId}`);
    });

    // 加入房间
    socket.on('joinRoom', (roomId) => {
        const room = xiangqiRooms.getRoom(roomId);
        if (room) {
            if (!room.players.black) {
                room.players.black = socket.id;
                room.status = 'playing';
                xiangqiRooms.joinRoom(socket, roomId);
                
                socket.emit('roomJoined', { roomId, color: 'black' });
                // 通知红方（房主）游戏开始
                io.to(room.players.red).emit('gameStart', { color: 'red', opponent: socket.id });
                // 通知黑方（加入者）游戏开始
                io.to(socket.id).emit('gameStart', { color: 'black', opponent: room.players.red });
                console.log(`玩家 ${socket.id} 加入了象棋房间 ${roomId}`);
            } else {
                socket.emit('errorMsg', '房间已满');
            }
        } else {
            socket.emit('errorMsg', '房间不存在');
        }
    });

    // 走棋事件
    socket.on('move', (data) => {
        const { roomId, from, to } = data;
        const room = xiangqiRooms.getRoom(roomId);
        
        if (!room || room.status !== 'playing') {
            socket.emit('errorMsg', '无效的房间或游戏未在进行中');
            return;
        }

        // 确定当前玩家颜色
        const playerColor = socket.id === room.players.red ? 'red' : (socket.id === room.players.black ? 'black' : null);
        if (!playerColor) {
            socket.emit('errorMsg', '你不在该房间中');
            return;
        }

        if (playerColor !== room.currentTurn) {
            socket.emit('errorMsg', '还没到你的回合');
            return;
        }

        // 校验走棋合法性
        if (XiangqiRules.isValidMove(room.boardState, from.x, from.y, to.x, to.y, playerColor)) {
            // 执行走棋
            room.boardState[to.y][to.x] = room.boardState[from.y][from.x];
            room.boardState[from.y][from.x] = null;
            
            // 切换回合
            room.currentTurn = room.currentTurn === 'red' ? 'black' : 'red';

            // 检查对手是否被绝杀
            const isCheckmate = XiangqiRules.isCheckmateOrStalemate(room.boardState, room.currentTurn);
            const isCheck = XiangqiRules.isCheck(room.boardState, room.currentTurn);

            // 广播走棋和状态给双方
            // 这里我们改用统一广播 moveSuccess 给双方，避免各算各的
            io.to(xiangqiRooms.getSocketRoomName(roomId)).emit('moveSuccess', {
                from,
                to,
                nextTurn: room.currentTurn,
                isCheck,
                isCheckmate
            });

            if (isCheckmate) {
                room.status = 'finished';
                const winner = playerColor === 'red' ? '红方' : '黑方';
                io.to(xiangqiRooms.getSocketRoomName(roomId)).emit('gameOver', { winner, reason: 'checkmate' });
            }
        } else {
            socket.emit('errorMsg', '非法的走棋操作');
            // 可以选择把当前的棋盘状态发回去强制同步
            socket.emit('syncBoard', { boardState: room.boardState, currentTurn: room.currentTurn });
        }
    });

    // 认输/重新开始
    socket.on('gameOver', (data) => {
        xiangqiRooms.broadcastToOthers(socket, data.roomId, 'gameOver', data);
    });

    // 断开连接处理，可以由一个统一的断开连接处理函数调用，或者在这里单独监听
    // 为了防止多个 disconnect 处理器混乱，也可以挂载在这里
    socket.on('disconnect', () => {
        // 查找玩家所在的房间
        const room = xiangqiRooms.findRoomByPlayer(socket.id, (r, playerId) => {
            return r.players.red === playerId || r.players.black === playerId;
        });

        if (room) {
            const roomId = room.id;
            // 通知对手断开连接
            xiangqiRooms.broadcastToOthers(socket, roomId, 'opponentDisconnected');
            // 销毁房间
            xiangqiRooms.destroyRoom(roomId);
            console.log(`玩家 ${socket.id} 断开连接，已清理象棋房间 ${roomId}`);
        }
    });
}

module.exports = { initXiangqiHandlers };
