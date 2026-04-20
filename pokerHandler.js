const pokerRooms = {};

function initPokerHandlers(io, socket) {
    // 扑克房间创建
    socket.on('pokerCreateRoom', (playerName) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        pokerRooms[roomId] = {
            id: roomId,
            players: [socket.id],
            playerNames: { [socket.id]: playerName || '玩家1' },
            state: 'waiting', // waiting, calling, playing, over
            cards: {},
            hiddenCards: [],
            landlord: null,
            turnIndex: 0,
            currentPlay: null, // { cards: [], player: socket.id }
            passCount: 0,
            callScores: {},
            currentCaller: 0,
            baseScore: 0
        };
        socket.join('poker_' + roomId);
        socket.emit('pokerRoomCreated', roomId);
        emitRoomUpdate(io, roomId);
        console.log(`玩家 ${socket.id} 创建了扑克房间 ${roomId}`);
    });

    // 加入房间
    socket.on('pokerJoinRoom', ({ roomId, playerName }) => {
        const room = pokerRooms[roomId];
        if (room) {
            if (room.players.length < 3 && room.state === 'waiting') {
                room.players.push(socket.id);
                room.playerNames[socket.id] = playerName || `玩家${room.players.length}`;
                socket.join('poker_' + roomId);
                socket.emit('pokerRoomJoined', { roomId });
                emitRoomUpdate(io, roomId);
                console.log(`玩家 ${socket.id} 加入了扑克房间 ${roomId}`);

                if (room.players.length === 3) {
                    startGame(io, room);
                }
            } else {
                socket.emit('errorMsg', '房间已满或游戏已开始');
            }
        } else {
            socket.emit('errorMsg', '房间不存在');
        }
    });

    // 叫地主
    socket.on('pokerCall', ({ roomId, score }) => {
        const room = pokerRooms[roomId];
        if (!room || room.state !== 'calling') return;
        
        const currentPlayerId = room.players[room.currentCaller];
        if (socket.id !== currentPlayerId) return; // Not their turn

        room.callScores[socket.id] = score;
        io.to('poker_' + roomId).emit('pokerCallMessage', { player: socket.id, score });

        if (score === 3) {
            // 直接成为地主
            setLandlord(io, room, socket.id, 3);
        } else {
            if (score > room.baseScore) {
                room.baseScore = score;
            }
            
            room.currentCaller++;
            if (room.currentCaller >= 3) {
                // 叫分结束，找出最高分
                let maxScore = -1;
                let landlordId = null;
                for (const pid of room.players) {
                    if (room.callScores[pid] > maxScore) {
                        maxScore = room.callScores[pid];
                        landlordId = pid;
                    }
                }
                if (maxScore > 0) {
                    setLandlord(io, room, landlordId, maxScore);
                } else {
                    // 都不要，重新发牌
                    io.to('poker_' + roomId).emit('pokerMessage', '都不叫，重新发牌');
                    startGame(io, room);
                }
            } else {
                // 下一个人叫
                emitRoomUpdate(io, roomId);
            }
        }
    });

    // 出牌
    socket.on('pokerPlay', ({ roomId, cards }) => {
        const room = pokerRooms[roomId];
        if (!room || room.state !== 'playing') return;
        
        const currentPlayerId = room.players[room.turnIndex];
        if (socket.id !== currentPlayerId) return;

        // 这里应该加入牌型验证逻辑。为了简化，我们假设前端已经验证过牌型合法性，以及是否大过上家
        // 后端直接接受出牌
        
        // 从玩家手中移除牌
        room.cards[socket.id] = room.cards[socket.id].filter(c => !cards.includes(c));
        
        room.currentPlay = { cards, player: socket.id };
        room.passCount = 0; // 重置跳过次数
        
        io.to('poker_' + roomId).emit('pokerPlayMessage', { player: socket.id, cards });
        
        // 检查是否游戏结束
        if (room.cards[socket.id].length === 0) {
            room.state = 'over';
            const isLandlord = socket.id === room.landlord;
            io.to('poker_' + roomId).emit('pokerGameOver', { 
                winner: isLandlord ? 'landlord' : 'peasant',
                landlord: room.landlord
            });
            return;
        }

        // 轮到下一个人
        room.turnIndex = (room.turnIndex + 1) % 3;
        emitRoomUpdate(io, roomId);
    });

    // 不出 (Pass)
    socket.on('pokerPass', ({ roomId }) => {
        const room = pokerRooms[roomId];
        if (!room || room.state !== 'playing') return;
        
        const currentPlayerId = room.players[room.turnIndex];
        if (socket.id !== currentPlayerId) return;

        room.passCount++;
        io.to('poker_' + roomId).emit('pokerPlayMessage', { player: socket.id, cards: [] }); // 空数组表示不出

        if (room.passCount >= 2) {
            // 两个人都不要，下一个人可以随便出
            room.currentPlay = null;
            room.passCount = 0;
        }

        room.turnIndex = (room.turnIndex + 1) % 3;
        emitRoomUpdate(io, roomId);
    });

    socket.on('disconnect', () => {
        for (const roomId in pokerRooms) {
            const room = pokerRooms[roomId];
            const idx = room.players.indexOf(socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                io.to('poker_' + roomId).emit('pokerPlayerLeft', socket.id);
                if (room.players.length === 0) {
                    delete pokerRooms[roomId];
                } else if (room.state !== 'over') {
                    room.state = 'over';
                    io.to('poker_' + roomId).emit('pokerMessage', '有玩家掉线，游戏结束');
                }
                break;
            }
        }
    });
}

function emitRoomUpdate(io, roomId) {
    const room = pokerRooms[roomId];
    if (!room) return;
    
    // 我们不应该把所有人的牌都广播给所有人，每个人只能看到自己的牌和别人的牌数
    room.players.forEach(pid => {
        const playerState = {
            roomId: room.id,
            state: room.state,
            players: room.players.map(id => ({
                id,
                name: room.playerNames[id],
                cardCount: room.cards[id] ? room.cards[id].length : 0,
                isLandlord: id === room.landlord
            })),
            myCards: room.cards[pid] || [],
            hiddenCards: room.state === 'playing' || room.state === 'over' ? room.hiddenCards : [null, null, null],
            turnIndex: room.turnIndex,
            currentTurnPlayer: room.players[room.state === 'calling' ? room.currentCaller : room.turnIndex],
            currentPlay: room.currentPlay,
            baseScore: room.baseScore
        };
        io.to(pid).emit('pokerRoomUpdate', playerState);
    });
}

function startGame(io, room) {
    room.state = 'calling';
    room.cards = {};
    room.callScores = {};
    room.currentCaller = Math.floor(Math.random() * 3); // 随机一个人开始叫地主
    room.baseScore = 0;
    room.landlord = null;
    room.currentPlay = null;
    room.passCount = 0;

    // 生成并洗牌
    const deck = generateDeck();
    shuffle(deck);

    // 发牌
    room.players.forEach((pid, index) => {
        room.cards[pid] = deck.slice(index * 17, (index + 1) * 17);
        // 排序，为了方便前端显示，也可以前端排，后端排更好
        room.cards[pid].sort((a, b) => getCardValue(b) - getCardValue(a));
    });
    room.hiddenCards = deck.slice(51, 54);

    emitRoomUpdate(io, room.id);
}

function setLandlord(io, room, landlordId, score) {
    room.landlord = landlordId;
    room.baseScore = score;
    room.state = 'playing';
    
    // 把底牌给地主
    room.cards[landlordId] = room.cards[landlordId].concat(room.hiddenCards);
    room.cards[landlordId].sort((a, b) => getCardValue(b) - getCardValue(a));
    
    // 地主先出牌
    room.turnIndex = room.players.indexOf(landlordId);
    
    emitRoomUpdate(io, room.id);
}

// 扑克牌生成：花色 S, H, C, D，点数 3-10, J, Q, K, A, 2, W1(小王), W2(大王)
function generateDeck() {
    const suits = ['S', 'H', 'C', 'D'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '2'];
    const deck = [];
    for (const s of suits) {
        for (const r of ranks) {
            deck.push(s + r);
        }
    }
    deck.push('W1'); // 小王
    deck.push('W2'); // 大王
    return deck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getCardValue(card) {
    if (card === 'W2') return 17;
    if (card === 'W1') return 16;
    const rank = card.charAt(1);
    const order = ['3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '2'];
    return order.indexOf(rank) + 3;
}

module.exports = { initPokerHandlers };
