(function (root) {
    const SUITS = ['♠', '♥', '♣', '♦'];
    const SUIT_NAMES = { '♠': 'spade', '♥': 'heart', '♣': 'club', '♦': 'diamond' };
    const CARD_TYPES = {
        BASIC: 'basic',
        TRICK: 'trick'
    };
    const BASIC = {
        SHA: 'sha',
        SHAN: 'shan',
        TAO: 'tao',
        JIU: 'jiu'
    };
    const TRICK = {
        WUZHONG: 'wuzhong',
        GUOHE: 'guohe',
        SHUNSHOU: 'shunshou',
        JUEDOU: 'juedou',
        NANMAN: 'nanman',
        WANJIAN: 'wanjian'
    };
    const CARD_META = {
        [BASIC.SHA]: { name: '杀', type: CARD_TYPES.BASIC, needTarget: true, multiTarget: false },
        [BASIC.SHAN]: { name: '闪', type: CARD_TYPES.BASIC, needTarget: false, multiTarget: false },
        [BASIC.TAO]: { name: '桃', type: CARD_TYPES.BASIC, needTarget: false, multiTarget: false },
        [BASIC.JIU]: { name: '酒', type: CARD_TYPES.BASIC, needTarget: false, multiTarget: false },
        [TRICK.WUZHONG]: { name: '无中生有', type: CARD_TYPES.TRICK, needTarget: false, multiTarget: false },
        [TRICK.GUOHE]: { name: '过河拆桥', type: CARD_TYPES.TRICK, needTarget: true, multiTarget: false },
        [TRICK.SHUNSHOU]: { name: '顺手牵羊', type: CARD_TYPES.TRICK, needTarget: true, multiTarget: false },
        [TRICK.JUEDOU]: { name: '决斗', type: CARD_TYPES.TRICK, needTarget: true, multiTarget: false },
        [TRICK.NANMAN]: { name: '南蛮入侵', type: CARD_TYPES.TRICK, needTarget: false, multiTarget: true },
        [TRICK.WANJIAN]: { name: '万箭齐发', type: CARD_TYPES.TRICK, needTarget: false, multiTarget: true }
    };
    const STANDARD_HEROES = [
        { id: 'caocao', name: '曹操', kingdom: '魏', maxHp: 4, skills: ['奸雄'] },
        { id: 'simayi', name: '司马懿', kingdom: '魏', maxHp: 3, skills: ['反馈', '鬼才'] },
        { id: 'xiahoudun', name: '夏侯惇', kingdom: '魏', maxHp: 4, skills: ['刚烈'] },
        { id: 'zhangliao', name: '张辽', kingdom: '魏', maxHp: 4, skills: ['突袭'] },
        { id: 'xuchu', name: '许褚', kingdom: '魏', maxHp: 4, skills: ['裸衣'] },
        { id: 'guojia', name: '郭嘉', kingdom: '魏', maxHp: 3, skills: ['天妒', '遗计'] },
        { id: 'zhenji', name: '甄姬', kingdom: '魏', maxHp: 3, skills: ['洛神', '倾国'] },
        { id: 'liubei', name: '刘备', kingdom: '蜀', maxHp: 4, skills: ['仁德', '激将'] },
        { id: 'guanyu', name: '关羽', kingdom: '蜀', maxHp: 4, skills: ['武圣'] },
        { id: 'zhangfei', name: '张飞', kingdom: '蜀', maxHp: 4, skills: ['咆哮'] },
        { id: 'zhugeliang', name: '诸葛亮', kingdom: '蜀', maxHp: 3, skills: ['观星', '空城'] },
        { id: 'zhaoyun', name: '赵云', kingdom: '蜀', maxHp: 4, skills: ['龙胆'] },
        { id: 'machao', name: '马超', kingdom: '蜀', maxHp: 4, skills: ['马术', '铁骑'] },
        { id: 'huangyueying', name: '黄月英', kingdom: '蜀', maxHp: 3, skills: ['集智', '奇才'] },
        { id: 'sunquan', name: '孙权', kingdom: '吴', maxHp: 4, skills: ['制衡', '救援'] },
        { id: 'ganning', name: '甘宁', kingdom: '吴', maxHp: 4, skills: ['奇袭'] },
        { id: 'lvmeng', name: '吕蒙', kingdom: '吴', maxHp: 4, skills: ['克己'] },
        { id: 'huanggai', name: '黄盖', kingdom: '吴', maxHp: 4, skills: ['苦肉'] },
        { id: 'zhouyu', name: '周瑜', kingdom: '吴', maxHp: 3, skills: ['英姿', '反间'] },
        { id: 'daqiao', name: '大乔', kingdom: '吴', maxHp: 3, skills: ['国色', '流离'] },
        { id: 'luxun', name: '陆逊', kingdom: '吴', maxHp: 3, skills: ['谦逊', '连营'] },
        { id: 'sunshangxiang', name: '孙尚香', kingdom: '吴', maxHp: 3, skills: ['结姻', '枭姬'] },
        { id: 'huatuo', name: '华佗', kingdom: '群', maxHp: 3, skills: ['青囊', '急救'] },
        { id: 'lvbu', name: '吕布', kingdom: '群', maxHp: 5, skills: ['无双'] },
        { id: 'diaochan', name: '貂蝉', kingdom: '群', maxHp: 3, skills: ['离间', '闭月'] }
    ];
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    function createCard(id, code, suit, rank) {
        const meta = CARD_META[code];
        return {
            id,
            code,
            name: meta.name,
            type: meta.type,
            suit,
            suitName: SUIT_NAMES[suit],
            rank
        };
    }
    function createStandardDeck() {
        const list = [];
        let idx = 1;
        const pushMany = (code, count) => {
            for (let i = 0; i < count; i++) {
                const suit = SUITS[(idx - 1) % SUITS.length];
                const rank = ((idx - 1) % 13) + 1;
                list.push(createCard(`c${idx}`, code, suit, rank));
                idx++;
            }
        };
        pushMany(BASIC.SHA, 30);
        pushMany(BASIC.SHAN, 15);
        pushMany(BASIC.TAO, 8);
        pushMany(BASIC.JIU, 5);
        pushMany(TRICK.WUZHONG, 4);
        pushMany(TRICK.GUOHE, 4);
        pushMany(TRICK.SHUNSHOU, 4);
        pushMany(TRICK.JUEDOU, 3);
        pushMany(TRICK.NANMAN, 2);
        pushMany(TRICK.WANJIAN, 2);
        return list;
    }
    function getCardMeta(code) {
        return CARD_META[code] || null;
    }
    function formatCard(card) {
        if (!card) return '';
        return `${card.name}${card.suit}${card.rank}`;
    }
    function findHero(heroId) {
        return STANDARD_HEROES.find(h => h.id === heroId) || null;
    }
    function isCardCode(card, code) {
        return !!card && card.code === code;
    }
    const SgsRules = {
        SUITS,
        CARD_TYPES,
        BASIC,
        TRICK,
        CARD_META,
        STANDARD_HEROES,
        shuffle,
        createStandardDeck,
        getCardMeta,
        formatCard,
        findHero,
        isCardCode
    };
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = SgsRules;
    }
    if (typeof window !== 'undefined') {
        window.SgsRules = SgsRules;
    } else if (typeof global !== 'undefined') {
        global.SgsRules = SgsRules;
    }
})(typeof window !== 'undefined' ? window : global);
