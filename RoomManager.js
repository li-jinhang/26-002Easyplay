class RoomManager {
    constructor(prefix = '') {
        this.rooms = new Map();
        this.prefix = prefix;
    }

    // 生成不重复的 4 位房间号
    generateRoomId() {
        let roomId;
        do {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
        } while (this.rooms.has(roomId));
        return roomId;
    }

    // 获取 Socket.io 中的真实房间名称
    getSocketRoomName(roomId) {
        return this.prefix ? `${this.prefix}_${roomId}` : roomId;
    }

    // 创建房间
    createRoom(socket, initialData = {}) {
        const roomId = this.generateRoomId();
        const room = { id: roomId, ...initialData };
        this.rooms.set(roomId, room);
        
        if (socket) {
            socket.join(this.getSocketRoomName(roomId));
        }
        return room;
    }

    // 加入房间
    joinRoom(socket, roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            if (socket) {
                socket.join(this.getSocketRoomName(roomId));
            }
            return room;
        }
        return null;
    }

    // 离开房间
    leaveRoom(socket, roomId) {
        if (socket) {
            socket.leave(this.getSocketRoomName(roomId));
        }
    }

    // 销毁房间
    destroyRoom(roomId) {
        return this.rooms.delete(roomId);
    }

    // 获取房间信息
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    // 获取所有房间
    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    // 在房间内广播事件（给所有人）
    broadcast(io, roomId, event, data) {
        io.to(this.getSocketRoomName(roomId)).emit(event, data);
    }

    // 在房间内广播事件（不包括发送者自身）
    broadcastToOthers(socket, roomId, event, data) {
        socket.to(this.getSocketRoomName(roomId)).emit(event, data);
    }

    // 根据玩家查找其所在的房间
    findRoomByPlayer(playerId, matchFunc) {
        for (const room of this.rooms.values()) {
            if (matchFunc(room, playerId)) {
                return room;
            }
        }
        return null;
    }
}

module.exports = RoomManager;
