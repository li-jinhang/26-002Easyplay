const CARD_VALUES = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    'W1': 16, 'W2': 17
};

// 获取牌的数值
function getCardValue(card) {
    if (card === 'W1' || card === 'W2') return CARD_VALUES[card];
    return CARD_VALUES[card.charAt(1)];
}

// 分析手牌，统计各个数值出现的次数
function analyzeCards(cards) {
    const counts = {};
    cards.forEach(card => {
        const val = getCardValue(card);
        counts[val] = (counts[val] || 0) + 1;
    });

    const groups = { 4: [], 3: [], 2: [], 1: [] };
    for (const [valStr, count] of Object.entries(counts)) {
        const val = parseInt(valStr);
        groups[count].push(val);
    }
    
    // 降序排列
    for (let count in groups) {
        groups[count].sort((a, b) => b - a);
    }

    return { counts, groups, length: cards.length };
}

// 检查是否为连续数值（用于顺子、连对、飞机）
// 注意：顺子等不能包含2和大小王
function isConsecutive(values) {
    if (values.length < 2) return false;
    for (let i = 0; i < values.length - 1; i++) {
        if (values[i] - values[i+1] !== 1) return false;
        if (values[i] >= 15) return false; // 2(15), W1(16), W2(17) 不能出现在连续序列中
    }
    if (values[values.length - 1] >= 15) return false;
    return true;
}

const TYPES = {
    ERROR: 0,
    SINGLE: 1,
    PAIR: 2,
    TRIPLE: 3,
    TRIPLE_ONE: 4,
    TRIPLE_TWO: 5,
    STRAIGHT: 6,
    STRAIGHT_PAIR: 7,
    AIRPLANE: 8,
    AIRPLANE_WINGS: 9,
    FOUR_TWO: 10,
    BOMB: 11,
    ROCKET: 12
};

// 获取牌型和该牌型的关键值
function getCardType(cards) {
    if (!cards || cards.length === 0) return { type: TYPES.ERROR, value: 0 };
    
    const { groups, length } = analyzeCards(cards);
    
    // 王炸 (火箭)
    if (length === 2 && groups[1].includes(16) && groups[1].includes(17)) {
        return { type: TYPES.ROCKET, value: 100 };
    }
    
    // 炸弹
    if (length === 4 && groups[4].length === 1) {
        return { type: TYPES.BOMB, value: groups[4][0] };
    }

    // 单牌
    if (length === 1) return { type: TYPES.SINGLE, value: groups[1][0] };
    
    // 对子
    if (length === 2 && groups[2].length === 1) return { type: TYPES.PAIR, value: groups[2][0] };
    
    // 三张
    if (length === 3 && groups[3].length === 1) return { type: TYPES.TRIPLE, value: groups[3][0] };
    
    // 三带一
    if (length === 4 && groups[3].length === 1) return { type: TYPES.TRIPLE_ONE, value: groups[3][0] };
    
    // 三带二 (一对)
    if (length === 5 && groups[3].length === 1 && groups[2].length === 1) {
        return { type: TYPES.TRIPLE_TWO, value: groups[3][0] };
    }
    
    // 单顺 (顺子)
    if (length >= 5 && groups[1].length === length && isConsecutive(groups[1])) {
        return { type: TYPES.STRAIGHT, value: groups[1][0], length };
    }
    
    // 双顺 (连对)
    if (length >= 6 && length % 2 === 0 && groups[2].length === length / 2 && isConsecutive(groups[2])) {
        return { type: TYPES.STRAIGHT_PAIR, value: groups[2][0], length };
    }
    
    // 三顺 (飞机不带翅膀)
    if (length >= 6 && length % 3 === 0 && groups[3].length === length / 3 && isConsecutive(groups[3])) {
        return { type: TYPES.AIRPLANE, value: groups[3][0], length };
    }
    
    // 飞机带翅膀 (带单牌)
    // 比如 333444带56
    // 注意：有时候飞机带的单牌可能是同一个数，比如 333444 带 55，这时候55会被分到 groups[2]
    // 所以寻找连续的三张更为可靠
    const possibleAirplanes = getPossibleAirplanes(groups);
    for (const plane of possibleAirplanes) {
        const planeLen = plane.length;
        if (length === planeLen * 4) {
            // 带单牌 (数量=planeLen)
            return { type: TYPES.AIRPLANE_WINGS, value: plane[0], length };
        }
        if (length === planeLen * 5) {
            // 带对子 (要求剩下的全是完整的对子，不能是单牌拼的)
            const remainingCount = getRemainingPairCount(groups, plane);
            if (remainingCount === planeLen) {
                return { type: TYPES.AIRPLANE_WINGS, value: plane[0], length };
            }
        }
    }

    // 四带二
    if (groups[4].length >= 1) {
        // 如果有多个炸弹，选最大的当四带二的主体
        for (const v of groups[4]) {
            if (length === 6) return { type: TYPES.FOUR_TWO, value: v }; // 带两单
            // 带两对: 剩下的必须能组成两对
            if (length === 8) {
                let pairCount = 0;
                for (const v2 of groups[4]) {
                    if (v2 !== v) pairCount += 2;
                }
                pairCount += groups[2].length;
                for (const v3 of groups[3]) pairCount += 1;
                if (groups[1].length === 0 && pairCount >= 2) {
                    return { type: TYPES.FOUR_TWO, value: v };
                }
            }
        }
    }

    return { type: TYPES.ERROR, value: 0 };
}

function getPossibleAirplanes(groups) {
    const planes = [];
    const triples = [...groups[3], ...groups[4]].sort((a,b) => b - a); // 炸弹也能拆成三张当飞机
    if (triples.length < 2) return planes;

    // 寻找最长的连续三张
    for (let i = 0; i < triples.length; i++) {
        let seq = [triples[i]];
        for (let j = i + 1; j < triples.length; j++) {
            if (seq[seq.length-1] - triples[j] === 1 && triples[j] < 15) {
                seq.push(triples[j]);
                if (seq.length >= 2) {
                    planes.push([...seq]);
                }
            } else {
                break;
            }
        }
    }
    return planes;
}

function getRemainingPairCount(groups, plane) {
    let pairCount = 0;
    const usedTriples = new Set(plane);
    // groups[4]
    for (const v of groups[4]) {
        if (usedTriples.has(v)) pairCount += 0; // 4个用掉3个，剩下1个单
        else pairCount += 2;
    }
    // groups[3]
    for (const v of groups[3]) {
        if (!usedTriples.has(v)) pairCount += 1; // 有多余的三张不能算作完整的对子，不过可以算作1对+1单
    }
    // groups[2]
    for (const v of groups[2]) {
        pairCount += 1;
    }
    let singles = groups[1].length;
    for (const v of groups[4]) {
        if (usedTriples.has(v)) singles += 1;
    }
    for (const v of groups[3]) {
        if (!usedTriples.has(v)) singles += 1;
    }
    if (singles > 0) return -1;
    
    return pairCount;
}

// 检查 newCards 是否能大过 currentCards
function canBeat(currentCards, newCards) {
    const currentType = getCardType(currentCards);
    const newType = getCardType(newCards);
    
    if (newType.type === TYPES.ERROR) return false;
    
    // 如果我出王炸
    if (newType.type === TYPES.ROCKET) return true;
    // 如果对面是王炸
    if (currentType.type === TYPES.ROCKET) return false;
    
    // 炸弹逻辑
    if (newType.type === TYPES.BOMB) {
        if (currentType.type === TYPES.BOMB) {
            return newType.value > currentType.value;
        }
        return true; // 炸弹大过非炸弹
    }
    if (currentType.type === TYPES.BOMB) {
        return false; // 非炸弹打不过炸弹
    }
    
    // 特殊处理：如果上家出飞机带单牌，我用纯飞机（比如 666555444333）去管，
    // 我的牌可能会被 getCardType 识别为 AIRPLANE，但它其实也可以当 AIRPLANE_WINGS 用。
    if (currentType.type === TYPES.AIRPLANE_WINGS && newCards.length === currentCards.length) {
        const { groups } = analyzeCards(newCards);
        const possibleAirplanes = getPossibleAirplanes(groups);
        for (const plane of possibleAirplanes) {
            const planeLen = plane.length;
            if (currentCards.length === planeLen * 4 || currentCards.length === planeLen * 5) {
                // 判断带对子是否合法
                if (currentCards.length === planeLen * 5) {
                    if (getRemainingPairCount(groups, plane) !== planeLen) continue;
                }
                // 找到合法的飞机带翅膀，看值是否更大
                if (plane[0] > currentType.value) {
                    return true;
                }
            }
        }
    }

    // 特殊处理：四带二 (比如 55554444 可以当 5555 带两对 44 44)
    if (currentType.type === TYPES.FOUR_TWO && newCards.length === currentCards.length) {
        const { groups } = analyzeCards(newCards);
        if (groups[4].length >= 1) {
            // 对于所有的炸弹，都可以当四带二的主体
            for (const v of groups[4]) {
                if (v > currentType.value) return true;
            }
        }
    }

    // 类型和张数必须相同
    if (currentType.type !== newType.type) return false;
    if (currentType.length && currentType.length !== newType.length) return false; // 顺子长度要一样
    if (currentCards.length !== newCards.length) return false; // 比如三带一和三带二长度不同
    
    return newType.value > currentType.value;
}

module.exports = {
    TYPES,
    getCardValue,
    getCardType,
    canBeat
};
