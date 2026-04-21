(function(global) {
    const XiangqiRules = {
        initialBoard: [
            ['车','马','象','士','将','士','象','马','车'], // y=0 (黑方)
            [null,null,null,null,null,null,null,null,null], // y=1
            [null,'炮',null,null,null,null,null,'炮',null], // y=2
            ['卒',null,'卒',null,'卒',null,'卒',null,'卒'], // y=3
            [null,null,null,null,null,null,null,null,null], // y=4
            [null,null,null,null,null,null,null,null,null], // y=5
            ['兵',null,'兵',null,'兵',null,'兵',null,'兵'], // y=6 (红方)
            [null,'砲',null,null,null,null,null,'砲',null], // y=7
            [null,null,null,null,null,null,null,null,null], // y=8
            ['俥','傌','相','仕','帅','仕','相','傌','俥']  // y=9
        ],

        pieceColor: {
            '车':'black', '马':'black', '象':'black', '士':'black', '将':'black', '炮':'black', '卒':'black',
            '俥':'red', '傌':'red', '相':'red', '仕':'red', '帅':'red', '砲':'red', '兵':'red'
        },

        getBoardCopy: function() {
            return JSON.parse(JSON.stringify(this.initialBoard));
        },

        countPiecesBetween: function(board, x1, y1, x2, y2) {
            let count = 0;
            if (x1 === x2) {
                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);
                for (let y = minY + 1; y < maxY; y++) {
                    if (board[y][x1]) count++;
                }
            } else if (y1 === y2) {
                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);
                for (let x = minX + 1; x < maxX; x++) {
                    if (board[y1][x]) count++;
                }
            }
            return count;
        },

        // 仅检查走棋的基本规则（不考虑是否送将）
        isBasicValidMove: function(board, fx, fy, tx, ty, currentColor) {
            const piece = board[fy][fx];
            const target = board[ty][tx];

            if (!piece) return false;
            if (this.pieceColor[piece] !== currentColor) return false;
            if (target && this.pieceColor[target] === currentColor) return false;

            const dx = tx - fx;
            const dy = ty - fy;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            switch (piece) {
                case '将': case '帅':
                    // 飞将规则 (目标是对方将帅，且在同一列，中间无子)
                    if (target && (target === '将' || target === '帅') && fx === tx) {
                        if (this.countPiecesBetween(board, fx, fy, tx, ty) === 0) return true;
                    }
                    // 九宫格内，每次1步
                    if (tx < 3 || tx > 5) return false;
                    if (piece === '帅' && ty < 7) return false;
                    if (piece === '将' && ty > 2) return false;
                    return (absDx + absDy === 1);

                case '士': case '仕':
                    // 九宫格内，斜走1步
                    if (tx < 3 || tx > 5) return false;
                    if (piece === '仕' && ty < 7) return false;
                    if (piece === '士' && ty > 2) return false;
                    return (absDx === 1 && absDy === 1);

                case '象': case '相':
                    // 走田字，不能过河，不能塞象眼
                    if (absDx !== 2 || absDy !== 2) return false;
                    if (piece === '相' && ty < 5) return false;
                    if (piece === '象' && ty > 4) return false;
                    if (board[fy + dy / 2][fx + dx / 2]) return false; // 塞象眼
                    return true;

                case '马': case '傌':
                    // 走日字，不能撇马腿
                    if (absDx === 1 && absDy === 2) {
                        if (board[fy + dy / 2][fx]) return false; // 垂直马腿
                        return true;
                    }
                    if (absDx === 2 && absDy === 1) {
                        if (board[fy][fx + dx / 2]) return false; // 水平马腿
                        return true;
                    }
                    return false;

                case '车': case '俥':
                    // 直线移动，中间不能有子
                    if (fx !== tx && fy !== ty) return false;
                    return this.countPiecesBetween(board, fx, fy, tx, ty) === 0;

                case '炮': case '砲':
                    if (fx !== tx && fy !== ty) return false;
                    const count = this.countPiecesBetween(board, fx, fy, tx, ty);
                    if (target) {
                        // 吃子必须隔一个
                        return count === 1;
                    } else {
                        // 移动中间不能有子
                        return count === 0;
                    }

                case '兵': case '卒':
                    // 兵卒规则
                    if (piece === '兵') {
                        if (dy > 0) return false; // 不能后退
                        if (fy > 4) { // 没过河
                            return dy === -1 && dx === 0;
                        } else { // 已过河
                            return (dy === -1 && dx === 0) || (dy === 0 && absDx === 1);
                        }
                    } else { // 卒
                        if (dy < 0) return false;
                        if (fy < 5) { // 没过河
                            return dy === 1 && dx === 0;
                        } else { // 已过河
                            return (dy === 1 && dx === 0) || (dy === 0 && absDx === 1);
                        }
                    }
            }
            return false;
        },

        // 检查两个将帅是否碰面（中间无子）
        isGeneralsFacing: function(board) {
            let redGeneral = null;
            let blackGeneral = null;
            for (let y = 0; y < 10; y++) {
                for (let x = 3; x <= 5; x++) {
                    if (board[y][x] === '帅') redGeneral = {x, y};
                    if (board[y][x] === '将') blackGeneral = {x, y};
                }
            }
            if (redGeneral && blackGeneral && redGeneral.x === blackGeneral.x) {
                if (this.countPiecesBetween(board, redGeneral.x, redGeneral.y, blackGeneral.x, blackGeneral.y) === 0) {
                    return true;
                }
            }
            return false;
        },

        // 判断某一方是否被将军
        isCheck: function(board, color) {
            // 找到己方将/帅的位置
            let generalX = -1, generalY = -1;
            const generalPiece = color === 'red' ? '帅' : '将';
            for (let y = 0; y < 10; y++) {
                for (let x = 3; x <= 5; x++) {
                    if (board[y][x] === generalPiece) {
                        generalX = x;
                        generalY = y;
                        break;
                    }
                }
                if (generalX !== -1) break;
            }
            if (generalX === -1) return false; // 找不到将帅

            // 遍历对方所有棋子，看是否能攻击到将帅
            const opponentColor = color === 'red' ? 'black' : 'red';
            for (let y = 0; y < 10; y++) {
                for (let x = 0; x < 9; x++) {
                    const piece = board[y][x];
                    if (piece && this.pieceColor[piece] === opponentColor) {
                        if (this.isBasicValidMove(board, x, y, generalX, generalY, opponentColor)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },

        // 综合判断移动是否合法：基本合法 + 移动后不能被将军 + 移动后不能造成将帅碰面
        isValidMove: function(board, fx, fy, tx, ty, currentColor) {
            if (!this.isBasicValidMove(board, fx, fy, tx, ty, currentColor)) {
                return false;
            }
            
            // 模拟移动（原地修改并恢复，提高性能）
            const originalTarget = board[ty][tx];
            board[ty][tx] = board[fy][fx];
            board[fy][fx] = null;

            // 移动后不能被将军
            const isCheck = this.isCheck(board, currentColor);

            // 移动后不能造成将帅碰面（飞将规则）
            const isFacing = this.isGeneralsFacing(board);

            // 恢复棋盘
            board[fy][fx] = board[ty][tx];
            board[ty][tx] = originalTarget;

            if (isCheck || isFacing) {
                return false;
            }

            return true;
        },

        // 检查某一方是否无棋可走（绝杀或困毙）
        isCheckmateOrStalemate: function(board, color) {
            for (let fy = 0; fy < 10; fy++) {
                for (let fx = 0; fx < 9; fx++) {
                    const piece = board[fy][fx];
                    if (piece && this.pieceColor[piece] === color) {
                        // 尝试所有可能的目标位置
                        for (let ty = 0; ty < 10; ty++) {
                            for (let tx = 0; tx < 9; tx++) {
                                if (this.isValidMove(board, fx, fy, tx, ty, color)) {
                                    return false; // 只要有一步合法，就没有绝杀/困毙
                                }
                            }
                        }
                    }
                }
            }
            return true; // 没有任何合法步，绝杀或困毙
        }
    };

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = XiangqiRules;
    }
    if (typeof window !== 'undefined') {
        window.XiangqiRules = XiangqiRules;
    } else if (typeof global !== 'undefined') {
        global.XiangqiRules = XiangqiRules;
    }
})(typeof window !== 'undefined' ? window : global);
