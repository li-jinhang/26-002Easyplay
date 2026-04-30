const RoomManager = require('./RoomManager');
const XiangqiRules = require('../shared/xiangqiRules');

// 象棋房间管理器实例（不使用前缀，以保持与原有逻辑兼容）
const xiangqiRooms = new RoomManager();
const ROOM_TERMINATE_DELAY_MS = 2 * 60 * 1000;
const ROOM_TERMINATE_DELAY_SECONDS = ROOM_TERMINATE_DELAY_MS / 1000;
const MAX_SPECTATORS = 5;

function getPlayerToken(socket) {
    const token = socket?.handshake?.auth?.playerToken;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function getPlayerColorBySocketId(room, socketId) {
    if (room.players.red === socketId) return 'red';
    if (room.players.black === socketId) return 'black';
    return null;
}

function ensureSpectatorState(room) {
    if (!Array.isArray(room.spectators)) {
        room.spectators = [];
    }
}

function emitSpectatorCount(io, roomId) {
    const room = xiangqiRooms.getRoom(roomId);
    if (!room) return;
    ensureSpectatorState(room);
    io.to(xiangqiRooms.getSocketRoomName(roomId)).emit('spectatorCountUpdate', {
        spectatorCount: room.spectators.length,
        maxSpectators: MAX_SPECTATORS
    });
}

function ensureDisconnectState(room) {
    if (!room.disconnectTimers) {
        room.disconnectTimers = { red: null, black: null };
    }
    if (!room.disconnectedPlayers) {
        room.disconnectedPlayers = { red: null, black: null };
    }
}

function clearDisconnectTimer(room, color) {
    ensureDisconnectState(room);
    if (room.disconnectTimers[color]) {
        clearTimeout(room.disconnectTimers[color]);
        room.disconnectTimers[color] = null;
    }
}

function destroyRoomSafely(roomId) {
    const room = xiangqiRooms.getRoom(roomId);
    if (room) {
        ensureDisconnectState(room);
        clearDisconnectTimer(room, 'red');
        clearDisconnectTimer(room, 'black');
    }
    xiangqiRooms.destroyRoom(roomId);
}

function scheduleRoomTermination(io, roomId, color, disconnectedSocketId) {
    const room = xiangqiRooms.getRoom(roomId);
    if (!room) return;

    ensureDisconnectState(room);
    clearDisconnectTimer(room, color);

    room.disconnectTimers[color] = setTimeout(() => {
        const latestRoom = xiangqiRooms.getRoom(roomId);
        if (!latestRoom) return;
        ensureDisconnectState(latestRoom);

        const disconnectedInfo = latestRoom.disconnectedPlayers[color];
        const stillDisconnected = disconnectedInfo && disconnectedInfo.socketId === disconnectedSocketId;
        if (!stillDisconnected) return;

        io.to(xiangqiRooms.getSocketRoomName(roomId)).emit('roomTerminated', {
            reason: 'disconnectTimeout',
            disconnectedColor: color
        });

        destroyRoomSafely(roomId);
        console.log(`象棋房间 ${roomId} 因玩家 ${disconnectedSocketId} 离线超时（2分钟）被终止`);
    }, ROOM_TERMINATE_DELAY_MS);
}

function tryRecoverRoom(io, socket) {
    const playerToken = getPlayerToken(socket);
    if (!playerToken) return;

    const room = xiangqiRooms.findRoomByPlayer(playerToken, (r, token) => {
        return r.playerTokens && (r.playerTokens.red === token || r.playerTokens.black === token);
    });

    if (!room) return;

    const color = room.playerTokens.red === playerToken ? 'red' : 'black';
    room.players[color] = socket.id;
    xiangqiRooms.joinRoom(socket, room.id);

    ensureDisconnectState(room);
    room.disconnectedPlayers[color] = null;
    clearDisconnectTimer(room, color);

    socket.emit('roomRecovered', {
        roomId: room.id,
        color,
        boardState: room.boardState,
        currentTurn: room.currentTurn,
        status: room.status
    });

    xiangqiRooms.broadcastToOthers(socket, room.id, 'opponentReconnected', { color });
    console.log(`玩家 ${socket.id} 通过令牌恢复到象棋房间 ${room.id}（${color}方）`);
}

function initXiangqiHandlers(io, socket) {
    tryRecoverRoom(io, socket);

    // 创建房间
    socket.on('createRoom', () => {
        const playerToken = getPlayerToken(socket);
        const room = xiangqiRooms.createRoom(socket, {
            players: { red: socket.id, black: null },
            playerTokens: { red: playerToken, black: null },
            boardState: XiangqiRules.getBoardCopy(),
            currentTurn: 'red',
            status: 'waiting', // waiting, playing, finished
            spectators: [],
            disconnectTimers: { red: null, black: null },
            disconnectedPlayers: { red: null, black: null }
        });
        const roomId = room.id;
        
        socket.emit('roomCreated', roomId);
        console.log(`玩家 ${socket.id} 创建了象棋房间 ${roomId}`);
    });

    // 加入房间
    socket.on('joinRoom', (roomId) => {
        const room = xiangqiRooms.getRoom(roomId);
        if (room) {
            ensureSpectatorState(room);
            if (room.players.red === socket.id || room.players.black === socket.id) {
                socket.emit('errorMsg', '你已在该房间中');
                return;
            }
            if (!room.players.black) {
                const playerToken = getPlayerToken(socket);
                room.players.black = socket.id;
                room.playerTokens.black = playerToken;
                room.status = 'playing';
                ensureDisconnectState(room);
                room.disconnectedPlayers.black = null;
                clearDisconnectTimer(room, 'black');
                xiangqiRooms.joinRoom(socket, roomId);
                
                socket.emit('roomJoined', {
                    roomId,
                    color: 'black',
                    spectatorCount: room.spectators.length,
                    maxSpectators: MAX_SPECTATORS
                });
                // 通知红方（房主）游戏开始
                io.to(room.players.red).emit('gameStart', { color: 'red', opponent: socket.id });
                // 通知黑方（加入者）游戏开始
                io.to(socket.id).emit('gameStart', { color: 'black', opponent: room.players.red });
                // 通知观众游戏开始
                io.to(xiangqiRooms.getSocketRoomName(roomId)).emit('spectatorGameStart', {
                    boardState: room.boardState,
                    currentTurn: room.currentTurn,
                    status: room.status
                });
                emitSpectatorCount(io, roomId);
                console.log(`玩家 ${socket.id} 加入了象棋房间 ${roomId}`);
            } else {
                socket.emit('errorMsg', '房间已满');
            }
        } else {
            socket.emit('errorMsg', '房间不存在');
        }
    });

    // 观战房间
    socket.on('watchRoom', (roomId) => {
        const room = xiangqiRooms.getRoom(roomId);
        if (!room) {
            socket.emit('errorMsg', '房间不存在');
            return;
        }

        ensureSpectatorState(room);

        if (room.players.red === socket.id || room.players.black === socket.id) {
            socket.emit('errorMsg', '你已是该房间玩家');
            return;
        }

        if (room.spectators.includes(socket.id)) {
            socket.emit('watchJoined', {
                roomId,
                boardState: room.boardState,
                currentTurn: room.currentTurn,
                status: room.status,
                spectatorCount: room.spectators.length,
                maxSpectators: MAX_SPECTATORS
            });
            return;
        }

        if (room.spectators.length >= MAX_SPECTATORS) {
            socket.emit('errorMsg', '观众席已满');
            return;
        }

        room.spectators.push(socket.id);
        xiangqiRooms.joinRoom(socket, roomId);

        socket.emit('watchJoined', {
            roomId,
            boardState: room.boardState,
            currentTurn: room.currentTurn,
            status: room.status,
            spectatorCount: room.spectators.length,
            maxSpectators: MAX_SPECTATORS
        });
        emitSpectatorCount(io, roomId);
        console.log(`观众 ${socket.id} 加入了象棋房间 ${roomId}`);
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
            const color = getPlayerColorBySocketId(room, socket.id);
            if (!color) return;

            ensureDisconnectState(room);
            room.disconnectedPlayers[color] = { socketId: socket.id, at: Date.now() };

            // 通知对手进入离线宽限期，不立即结束对局
            xiangqiRooms.broadcastToOthers(socket, roomId, 'opponentTemporaryDisconnected', {
                timeoutSeconds: ROOM_TERMINATE_DELAY_SECONDS
            });
            scheduleRoomTermination(io, roomId, color, socket.id);

            console.log(`玩家 ${socket.id} 断开连接，象棋房间 ${roomId} 进入 2 分钟离线宽限期`);
        }

        const spectatorRoom = xiangqiRooms.findRoomByPlayer(socket.id, (r, playerId) => {
            ensureSpectatorState(r);
            return r.spectators.includes(playerId);
        });

        if (spectatorRoom) {
            ensureSpectatorState(spectatorRoom);
            spectatorRoom.spectators = spectatorRoom.spectators.filter((id) => id !== socket.id);
            emitSpectatorCount(io, spectatorRoom.id);
            console.log(`观众 ${socket.id} 离开了象棋房间 ${spectatorRoom.id}`);
        }
    });
}

module.exports = { initXiangqiHandlers };
