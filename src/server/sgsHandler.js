const RoomManager = require('./RoomManager');
const SgsRules = require('../shared/sgsRules');

const sgsRooms = new RoomManager('sgs');

function initSgsHandlers(io, socket) {
    socket.on('sgsCreateRoom', (playerName) => {
        const room = sgsRooms.createRoom(socket, {
            owner: socket.id,
            players: [socket.id],
            playerNames: { [socket.id]: playerName || '玩家1' },
            heroes: {},
            readyPlayers: new Set(),
            state: 'waiting',
            phase: 'waiting',
            turnIndex: 0,
            game: null,
            pending: null,
            pendingStack: []
        });

        socket.emit('sgsRoomCreated', room.id);
        emitRoomUpdate(io, room.id);
    });

    socket.on('sgsJoinRoom', ({ roomId, playerName }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room) {
            socket.emit('errorMsg', '房间不存在');
            return;
        }
        if (room.state !== 'waiting') {
            socket.emit('errorMsg', '游戏已开始');
            return;
        }
        if (room.players.length >= 8) {
            socket.emit('errorMsg', '房间已满');
            return;
        }

        room.players.push(socket.id);
        room.playerNames[socket.id] = playerName || `玩家${room.players.length}`;
        sgsRooms.joinRoom(socket, roomId);
        socket.emit('sgsRoomJoined', { roomId });
        emitRoomUpdate(io, roomId);
    });

    socket.on('sgsChooseHero', ({ roomId, heroId }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'waiting') return;
        if (!room.players.includes(socket.id)) return;
        const hero = SgsRules.findHero(heroId);
        if (!hero) {
            socket.emit('errorMsg', '武将不存在');
            return;
        }
        room.heroes[socket.id] = heroId;
        room.readyPlayers.delete(socket.id);
        emitRoomUpdate(io, roomId);
    });

    socket.on('sgsToggleReady', ({ roomId }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'waiting') return;
        if (!room.players.includes(socket.id)) return;
        if (!room.heroes[socket.id]) {
            socket.emit('errorMsg', '请先选择武将');
            return;
        }
        if (room.readyPlayers.has(socket.id)) {
            room.readyPlayers.delete(socket.id);
        } else {
            room.readyPlayers.add(socket.id);
        }
        emitRoomUpdate(io, roomId);
        tryStartGame(io, room);
    });

    socket.on('sgsPlayCard', ({ roomId, cardId, targets }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'playing') return;
        if (!room.players.includes(socket.id)) return;

        if (room.pending) {
            socket.emit('errorMsg', '当前需要先处理响应/弃牌');
            return;
        }
        const currentPid = getCurrentTurnPid(room);
        if (socket.id !== currentPid) return;
        if (room.phase !== 'play') return;

        const card = getCardFromHand(room, socket.id, cardId);
        if (!card) {
            socket.emit('errorMsg', '你没有这张牌');
            return;
        }
        const meta = SgsRules.getCardMeta(card.code);
        if (!meta) return;

        const targetList = Array.isArray(targets) ? targets : [];
        if (meta.needTarget) {
            if (targetList.length !== 1) {
                socket.emit('errorMsg', '请选择1名目标');
                return;
            }
            if (targetList[0] === socket.id) {
                socket.emit('errorMsg', '不能选择自己');
                return;
            }
            if (!isAlive(room, targetList[0])) {
                socket.emit('errorMsg', '目标已阵亡');
                return;
            }
        }

        if (card.code === SgsRules.BASIC.SHA) {
            if (room.game.usedSha[socket.id]) {
                socket.emit('errorMsg', '本回合已使用过杀');
                return;
            }
            room.game.usedSha[socket.id] = true;
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            const toPid = targetList[0];
            const dmg = room.game.drunk[socket.id] ? 2 : 1;
            room.game.drunk[socket.id] = false;
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}`
            });
            setPending(room, {
                kind: 'respond',
                need: 'shan',
                fromPid: socket.id,
                toPid,
                reason: 'sha',
                damage: dmg,
                resumePhase: 'play'
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.BASIC.TAO) {
            if (room.game.hp[socket.id] >= room.game.maxHp[socket.id]) {
                socket.emit('errorMsg', '体力已满');
                return;
            }
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            heal(room, socket.id, 1);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 使用了 ${SgsRules.formatCard(card)}，回复1点体力`
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.BASIC.JIU) {
            if (room.game.usedJiu[socket.id]) {
                socket.emit('errorMsg', '本回合已使用过酒');
                return;
            }
            room.game.usedJiu[socket.id] = true;
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            if (room.game.hp[socket.id] < room.game.maxHp[socket.id]) {
                heal(room, socket.id, 1);
                sgsRooms.broadcast(io, roomId, 'sgsLog', {
                    text: `${room.playerNames[socket.id]} 使用了 ${SgsRules.formatCard(card)}，回复1点体力`
                });
            } else {
                room.game.drunk[socket.id] = true;
                sgsRooms.broadcast(io, roomId, 'sgsLog', {
                    text: `${room.playerNames[socket.id]} 使用了 ${SgsRules.formatCard(card)}，本回合下一张杀伤害+1`
                });
            }
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.TRICK.WUZHONG) {
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            drawCards(room, socket.id, 2);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 使用了 ${SgsRules.formatCard(card)}，摸2张牌`
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.TRICK.GUOHE) {
            const toPid = targetList[0];
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            const lost = discardRandomFromHand(room, toPid);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: lost
                    ? `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}，弃置了其1张手牌`
                    : `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}，但对方没有手牌`
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.TRICK.SHUNSHOU) {
            const toPid = targetList[0];
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            const gained = stealRandomFromHand(room, socket.id, toPid);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: gained
                    ? `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}，获得其1张手牌`
                    : `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}，但对方没有手牌`
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.TRICK.JUEDOU) {
            const toPid = targetList[0];
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 对 ${room.playerNames[toPid]} 使用了 ${SgsRules.formatCard(card)}`
            });
            setPending(room, {
                kind: 'duel',
                attackerPid: socket.id,
                defenderPid: toPid,
                askingPid: toPid,
                resumePhase: 'play'
            });
            emitRoomUpdate(io, roomId);
            return;
        }

        if (card.code === SgsRules.TRICK.NANMAN || card.code === SgsRules.TRICK.WANJIAN) {
            const need = card.code === SgsRules.TRICK.NANMAN ? 'sha' : 'shan';
            const dmgType = card.code === SgsRules.TRICK.NANMAN ? 'nanman' : 'wanjian';
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            sgsRooms.broadcast(io, roomId, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 使用了 ${SgsRules.formatCard(card)}`
            });
            const targetsQueue = room.players.filter(pid => pid !== socket.id && isAlive(room, pid));
            if (targetsQueue.length === 0) {
                emitRoomUpdate(io, roomId);
                return;
            }
            setPending(room, {
                kind: 'mass',
                fromPid: socket.id,
                cardCode: card.code,
                need,
                damage: 1,
                damageType: dmgType,
                queue: targetsQueue,
                idx: 0,
                resumePhase: 'play'
            });
            emitRoomUpdate(io, roomId);
            return;
        }
    });

    socket.on('sgsRespond', ({ roomId, cardId, pass }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'playing') return;
        if (!room.pending) return;

        const pending = room.pending;

        if (pending.kind === 'respond') {
            if (socket.id !== pending.toPid) return;
            if (pass) {
                resolveRespondNoCard(io, room, pending);
                return;
            }
            const card = getCardFromHand(room, socket.id, cardId);
            if (!card) {
                socket.emit('errorMsg', '你没有这张牌');
                return;
            }
            if (pending.need === 'shan' && card.code !== SgsRules.BASIC.SHAN) {
                socket.emit('errorMsg', '需要打出闪');
                return;
            }
            if (pending.need === 'sha' && card.code !== SgsRules.BASIC.SHA) {
                socket.emit('errorMsg', '需要打出杀');
                return;
            }
            if (pending.need === 'tao' && card.code !== SgsRules.BASIC.TAO) {
                socket.emit('errorMsg', '需要打出桃');
                return;
            }

            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            sgsRooms.broadcast(io, room.id, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 打出了 ${SgsRules.formatCard(card)}`
            });
            resolveRespondWithCard(io, room, pending);
            return;
        }

        if (pending.kind === 'duel') {
            if (socket.id !== pending.askingPid) return;
            if (pass) {
                const loser = pending.askingPid;
                const winner = loser === pending.attackerPid ? pending.defenderPid : pending.attackerPid;
                clearPending(room);
                applyDamage(io, room, winner, loser, 1, 'juedou');
                emitRoomUpdate(io, room.id);
                return;
            }
            const card = getCardFromHand(room, socket.id, cardId);
            if (!card) {
                socket.emit('errorMsg', '你没有这张牌');
                return;
            }
            if (card.code !== SgsRules.BASIC.SHA) {
                socket.emit('errorMsg', '决斗需要打出杀');
                return;
            }
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            sgsRooms.broadcast(io, room.id, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 在决斗中打出了 ${SgsRules.formatCard(card)}`
            });
            pending.askingPid = pending.askingPid === pending.attackerPid ? pending.defenderPid : pending.attackerPid;
            emitRoomUpdate(io, room.id);
            return;
        }

        if (pending.kind === 'mass') {
            const currentTarget = pending.queue[pending.idx];
            if (socket.id !== currentTarget) return;
            if (!isAlive(room, currentTarget)) {
                normalizeOrFinishMass(room, pending);
                emitRoomUpdate(io, room.id);
                return;
            }
            if (pass) {
                const finished = advanceMassIndex(room, pending);
                applyDamage(io, room, pending.fromPid, currentTarget, pending.damage, pending.damageType);
                if (room.pending === pending) {
                    if (finished) {
                        clearPending(room);
                        room.phase = pending.resumePhase || 'play';
                    }
                }
                emitRoomUpdate(io, room.id);
                return;
            }
            const card = getCardFromHand(room, socket.id, cardId);
            if (!card) {
                socket.emit('errorMsg', '你没有这张牌');
                return;
            }
            if (pending.need === 'sha' && card.code !== SgsRules.BASIC.SHA) {
                socket.emit('errorMsg', '需要打出杀');
                return;
            }
            if (pending.need === 'shan' && card.code !== SgsRules.BASIC.SHAN) {
                socket.emit('errorMsg', '需要打出闪');
                return;
            }
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            sgsRooms.broadcast(io, room.id, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 打出了 ${SgsRules.formatCard(card)}`
            });
            finishOrAdvanceMass(room, pending);
            emitRoomUpdate(io, room.id);
            return;
        }

        if (pending.kind === 'save') {
            const currentHelper = pending.order[pending.idx];
            if (socket.id !== currentHelper) return;
            if (pass) {
                pending.idx++;
                while (pending.idx < pending.order.length && !isAlive(room, pending.order[pending.idx])) {
                    pending.idx++;
                }
                if (pending.idx >= pending.order.length) {
                    const dyingPid = pending.dyingPid;
                    room.game.dead[dyingPid] = true;
                    sgsRooms.broadcast(io, room.id, 'sgsLog', {
                        text: `${room.playerNames[dyingPid]} 阵亡`
                    });
                    clearPending(room);
                    if (!room.pending && room.state === 'playing' && getCurrentTurnPid(room) === dyingPid) {
                        nextTurn(io, room);
                    }
                    emitRoomUpdate(io, room.id);
                    return;
                }
                emitRoomUpdate(io, room.id);
                return;
            }

            const card = getCardFromHand(room, socket.id, cardId);
            if (!card) {
                socket.emit('errorMsg', '你没有这张牌');
                return;
            }
            if (card.code !== SgsRules.BASIC.TAO) {
                socket.emit('errorMsg', '濒死需要打出桃');
                return;
            }
            removeCardFromHand(room, socket.id, cardId);
            room.game.discard.push(card);
            heal(room, pending.dyingPid, 1);
            sgsRooms.broadcast(io, room.id, 'sgsLog', {
                text: `${room.playerNames[socket.id]} 对 ${room.playerNames[pending.dyingPid]} 使用了 ${SgsRules.formatCard(card)}`
            });
            if (room.game.hp[pending.dyingPid] > 0) {
                clearPending(room);
                if (room.pending && room.pending.kind === 'mass') normalizeOrFinishMass(room, room.pending);
                emitRoomUpdate(io, room.id);
                return;
            }
            emitRoomUpdate(io, room.id);
            return;
        }

        if (pending.kind === 'discard') {
            if (socket.id !== pending.pid) return;
            if (!Array.isArray(pending.cardIds)) pending.cardIds = [];
        }
    });

    socket.on('sgsDiscard', ({ roomId, cardIds }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'playing') return;
        if (!room.pending || room.pending.kind !== 'discard') return;
        if (socket.id !== room.pending.pid) return;

        const need = room.pending.count;
        const unique = Array.from(new Set(cardIds || []));
        if (unique.length !== need) {
            socket.emit('errorMsg', `需要弃置${need}张牌`);
            return;
        }
        for (const id of unique) {
            const card = getCardFromHand(room, socket.id, id);
            if (!card) {
                socket.emit('errorMsg', '弃置牌不在手牌中');
                return;
            }
        }
        unique.forEach(id => {
            const card = removeCardFromHand(room, socket.id, id);
            if (card) room.game.discard.push(card);
        });
        sgsRooms.broadcast(io, room.id, 'sgsLog', {
            text: `${room.playerNames[socket.id]} 弃置了 ${need} 张牌`
        });
        clearPending(room);
        nextTurn(io, room);
        emitRoomUpdate(io, room.id);
    });

    socket.on('sgsEndTurn', ({ roomId }) => {
        const room = sgsRooms.getRoom(roomId);
        if (!room || room.state !== 'playing') return;
        if (room.pending) return;
        const currentPid = getCurrentTurnPid(room);
        if (socket.id !== currentPid) return;
        if (room.phase !== 'play') return;

        room.phase = 'discard';
        const needDiscard = Math.max(0, (room.game.hands[socket.id] || []).length - room.game.hp[socket.id]);
        if (needDiscard === 0) {
            nextTurn(io, room);
            emitRoomUpdate(io, room.id);
            return;
        }
        setPending(room, { kind: 'discard', pid: socket.id, count: needDiscard, resumePhase: 'discard' }, true);
        emitRoomUpdate(io, room.id);
    });

    socket.on('disconnect', () => {
        const room = sgsRooms.findRoomByPlayer(socket.id, (r, pid) => r.players.includes(pid));
        if (!room) return;

        const roomId = room.id;
        const idx = room.players.indexOf(socket.id);
        if (idx !== -1) {
            room.players.splice(idx, 1);
            delete room.playerNames[socket.id];
            delete room.heroes[socket.id];
            room.readyPlayers.delete(socket.id);

            if (room.state === 'playing' && room.game) {
                room.game.dead[socket.id] = true;
            }
            sgsRooms.broadcast(io, roomId, 'sgsLog', { text: `玩家 ${socket.id} 掉线离开` });

            if (room.players.length === 0) {
                sgsRooms.destroyRoom(roomId);
                return;
            }
            if (room.owner === socket.id) {
                room.owner = room.players[0];
            }
            if (room.state === 'playing') {
                room.state = 'over';
                room.phase = 'over';
                sgsRooms.broadcast(io, roomId, 'sgsGameOver', { winner: null });
            }
            emitRoomUpdate(io, roomId);
        }
    });
}

function tryStartGame(io, room) {
    if (room.state !== 'waiting') return;
    if (room.players.length < 2) return;
    for (const pid of room.players) {
        if (!room.heroes[pid]) return;
        if (!room.readyPlayers.has(pid)) return;
    }
    startGame(io, room);
}

function startGame(io, room) {
    room.state = 'playing';
    room.phase = 'draw';
    room.pending = null;
    room.pendingStack = [];

    const deck = SgsRules.shuffle(SgsRules.createStandardDeck());
    const game = {
        deck,
        discard: [],
        hands: {},
        hp: {},
        maxHp: {},
        dead: {},
        drunk: {},
        usedSha: {},
        usedJiu: {}
    };

    room.players.forEach(pid => {
        const hero = SgsRules.findHero(room.heroes[pid]);
        game.maxHp[pid] = hero ? hero.maxHp : 4;
        game.hp[pid] = game.maxHp[pid];
        game.hands[pid] = [];
        game.dead[pid] = false;
        game.drunk[pid] = false;
        game.usedSha[pid] = false;
        game.usedJiu[pid] = false;
    });
    room.game = game;
    room.turnIndex = Math.floor(Math.random() * room.players.length);

    room.players.forEach(pid => drawCards(room, pid, 4));
    const firstPid = getCurrentTurnPid(room);
    sgsRooms.broadcast(io, room.id, 'sgsLog', { text: `游戏开始，${room.playerNames[firstPid]} 先手` });
    startTurn(io, room);
}

function startTurn(io, room) {
    const pid = getCurrentTurnPid(room);
    if (!pid) return;
    room.phase = 'draw';
    room.game.usedSha[pid] = false;
    room.game.usedJiu[pid] = false;
    room.game.drunk[pid] = false;
    drawCards(room, pid, 2);
    room.phase = 'play';
    sgsRooms.broadcast(io, room.id, 'sgsLog', { text: `${room.playerNames[pid]} 回合开始，摸2张牌` });
}

function nextTurn(io, room) {
    const alive = room.players.filter(pid => isAlive(room, pid));
    if (alive.length <= 1) {
        room.state = 'over';
        room.phase = 'over';
        const winner = alive[0] || null;
        sgsRooms.broadcast(io, room.id, 'sgsGameOver', { winner });
        if (winner) {
            sgsRooms.broadcast(io, room.id, 'sgsLog', { text: `游戏结束，${room.playerNames[winner]} 获胜` });
        } else {
            sgsRooms.broadcast(io, room.id, 'sgsLog', { text: '游戏结束' });
        }
        return;
    }

    let i = room.turnIndex;
    for (let step = 0; step < room.players.length; step++) {
        i = (i + 1) % room.players.length;
        const pid = room.players[i];
        if (isAlive(room, pid)) {
            room.turnIndex = i;
            startTurn(io, room);
            return;
        }
    }
}

function setPending(room, pending, keepPhase) {
    if (room.pending) {
        room.pendingStack.push({ pending: room.pending, phase: room.phase });
    }
    room.pending = pending;
    if (!keepPhase) {
        room.phase = 'pending';
    }
}

function clearPending(room) {
    room.pending = null;
    if (room.pendingStack.length > 0) {
        const prev = room.pendingStack.pop();
        room.pending = prev.pending;
        room.phase = prev.phase;
        normalizeRestoredPending(room);
        return;
    }
}

function resolveRespondWithCard(io, room, pending) {
    clearPending(room);
    room.phase = pending.resumePhase || 'play';
    emitRoomUpdate(io, room.id);
}

function resolveRespondNoCard(io, room, pending) {
    if (pending.reason === 'sha') {
        clearPending(room);
        applyDamage(io, room, pending.fromPid, pending.toPid, pending.damage, 'sha');
        room.phase = pending.resumePhase || 'play';
        emitRoomUpdate(io, room.id);
        return;
    }
    if (pending.reason === 'save') {
        clearPending(room);
        emitRoomUpdate(io, room.id);
    }
}

function normalizeRestoredPending(room) {
    if (!room.pending) return;
    if (room.pending.kind === 'mass') {
        normalizeMassPending(room, room.pending);
        if (room.pending.finished) {
            const resumePhase = room.pending.resumePhase || 'play';
            room.pending = null;
            room.phase = resumePhase;
        }
    }
}

function normalizeMassPending(room, pending) {
    while (pending.idx < pending.queue.length && !isAlive(room, pending.queue[pending.idx])) {
        pending.idx++;
    }
    if (pending.idx >= pending.queue.length) {
        pending.finished = true;
    } else {
        pending.finished = false;
    }
}

function advanceMassIndex(room, pending) {
    pending.idx++;
    normalizeMassPending(room, pending);
    return pending.finished;
}

function normalizeOrFinishMass(room, pending) {
    normalizeMassPending(room, pending);
    if (pending.finished && room.pending === pending) {
        clearPending(room);
        room.phase = pending.resumePhase || 'play';
    }
}

function finishOrAdvanceMass(room, pending) {
    const finished = advanceMassIndex(room, pending);
    if (finished && room.pending === pending) {
        clearPending(room);
        room.phase = pending.resumePhase || 'play';
    }
}

function applyDamage(io, room, fromPid, toPid, amount, reason) {
    if (!isAlive(room, toPid)) return;
    room.game.hp[toPid] -= amount;
    sgsRooms.broadcast(io, room.id, 'sgsLog', {
        text: `${room.playerNames[toPid]} 受到 ${amount} 点伤害（${reason}）`
    });
    if (room.game.hp[toPid] <= 0) {
        startDying(io, room, toPid, fromPid);
    }
}

function startDying(io, room, dyingPid, sourcePid) {
    if (!isAlive(room, dyingPid)) return;
    const order = [];
    const startIdx = room.players.indexOf(dyingPid);
    for (let step = 0; step < room.players.length; step++) {
        const pid = room.players[(startIdx + step) % room.players.length];
        if (isAlive(room, pid)) order.push(pid);
    }
    sgsRooms.broadcast(io, room.id, 'sgsLog', {
        text: `${room.playerNames[dyingPid]} 濒死，等待桃救援`
    });
    setPending(room, {
        kind: 'save',
        dyingPid,
        sourcePid,
        order,
        idx: 0,
        resumePhase: room.phase
    });
}

function heal(room, pid, amount) {
    room.game.hp[pid] = Math.min(room.game.maxHp[pid], room.game.hp[pid] + amount);
}

function isAlive(room, pid) {
    return room.game && room.game.dead && room.game.dead[pid] === false;
}

function drawCards(room, pid, n) {
    for (let i = 0; i < n; i++) {
        if (room.game.deck.length === 0) {
            if (room.game.discard.length === 0) break;
            room.game.deck = SgsRules.shuffle(room.game.discard.splice(0));
        }
        const card = room.game.deck.shift();
        room.game.hands[pid].push(card);
    }
}

function getCurrentTurnPid(room) {
    if (!room.players.length) return null;
    return room.players[room.turnIndex] || null;
}

function getCardFromHand(room, pid, cardId) {
    const hand = room.game && room.game.hands ? room.game.hands[pid] : null;
    if (!hand) return null;
    return hand.find(c => c.id === cardId) || null;
}

function removeCardFromHand(room, pid, cardId) {
    const hand = room.game && room.game.hands ? room.game.hands[pid] : null;
    if (!hand) return null;
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return null;
    const [card] = hand.splice(idx, 1);
    return card;
}

function discardRandomFromHand(room, pid) {
    const hand = room.game.hands[pid] || [];
    if (hand.length === 0) return null;
    const idx = Math.floor(Math.random() * hand.length);
    const [card] = hand.splice(idx, 1);
    room.game.discard.push(card);
    return card;
}

function stealRandomFromHand(room, fromPid, toPid) {
    const hand = room.game.hands[toPid] || [];
    if (hand.length === 0) return null;
    const idx = Math.floor(Math.random() * hand.length);
    const [card] = hand.splice(idx, 1);
    room.game.hands[fromPid].push(card);
    return card;
}

function emitRoomUpdate(io, roomId) {
    const room = sgsRooms.getRoom(roomId);
    if (!room) return;

    room.players.forEach(pid => {
        const playersView = room.players.map(id => {
            const heroId = room.heroes[id] || null;
            const hero = heroId ? SgsRules.findHero(heroId) : null;
            const handCount = room.game ? (room.game.hands[id] || []).length : 0;
            const hp = room.game ? room.game.hp[id] : null;
            const maxHp = room.game ? room.game.maxHp[id] : null;
            const dead = room.game ? room.game.dead[id] : false;
            return {
                id,
                name: room.playerNames[id],
                heroId,
                heroName: hero ? hero.name : null,
                kingdom: hero ? hero.kingdom : null,
                maxHp,
                hp,
                handCount,
                dead,
                ready: room.readyPlayers.has(id),
                isOwner: id === room.owner
            };
        });

        const currentTurnPid = room.state === 'playing' ? getCurrentTurnPid(room) : null;
        const myHand = room.game ? (room.game.hands[pid] || []) : [];

        const pendingPublic = room.pending ? buildPendingForPlayer(room, pid) : null;

        io.to(pid).emit('sgsRoomUpdate', {
            roomId: room.id,
            state: room.state,
            phase: room.phase,
            players: playersView,
            currentTurnPid,
            myHand,
            myHeroId: room.heroes[pid] || null,
            availableHeroes: room.state === 'waiting' ? SgsRules.STANDARD_HEROES : [],
            pending: pendingPublic
        });
    });
}

function buildPendingForPlayer(room, pid) {
    const p = room.pending;
    if (!p) return null;

    if (p.kind === 'respond') {
        const isMe = pid === p.toPid;
        return {
            kind: p.kind,
            toPid: p.toPid,
            fromPid: p.fromPid,
            need: p.need,
            reason: p.reason,
            isMe
        };
    }
    if (p.kind === 'duel') {
        return {
            kind: p.kind,
            attackerPid: p.attackerPid,
            defenderPid: p.defenderPid,
            askingPid: p.askingPid,
            isMe: pid === p.askingPid
        };
    }
    if (p.kind === 'mass') {
        const currentTarget = p.queue[p.idx];
        return {
            kind: p.kind,
            fromPid: p.fromPid,
            cardCode: p.cardCode,
            need: p.need,
            currentTarget,
            isMe: pid === currentTarget
        };
    }
    if (p.kind === 'discard') {
        return {
            kind: p.kind,
            pid: p.pid,
            count: p.count,
            isMe: pid === p.pid
        };
    }
    if (p.kind === 'save') {
        const currentHelper = p.order[p.idx];
        return {
            kind: p.kind,
            dyingPid: p.dyingPid,
            currentHelper,
            isMe: pid === currentHelper
        };
    }
    return { kind: p.kind };
}

module.exports = { initSgsHandlers };
