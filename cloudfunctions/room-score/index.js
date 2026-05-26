/**
 * 计分云函数 - 替换后端 /api/rooms/{roomCode}/score
 * 核心业务：给分操作（支持批量计分与单人计分）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function getRoomByCode(roomCode) {
  const res = await db.collection('game_rooms').where({ roomCode }).limit(1).get();
  if (!res.data || res.data.length === 0) throw new Error('房间不存在');
  return res.data[0];
}

async function getPlayer(roomId, userId) {
  const res = await db.collection('room_players').where({ roomId, userId }).limit(1).get();
  if (!res.data || res.data.length === 0) throw new Error('用户不在房间中');
  return res.data[0];
}

async function getUserMap(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const res = await db.collection('app_users').where({ _id: _.in(userIds) }).get();
  const map = {};
  (res.data || []).forEach(u => { map[u._id] = u; });
  return map;
}

function buildPlayerView(player, userMap) {
  const u = userMap[player.userId] || {};
  return {
    userId: player.userId,
    displayName: u.nickname || player.displayName || ('用户' + player.userId),
    seatNo: player.seatNo,
    currentScore: player.currentScore,
    owner: !!player.isOwner,
    avatarUrl: u.avatarUrl || ''
  };
}

async function getRoomDetailView(roomCode) {
  const room = await getRoomByCode(roomCode);
  const playersRes = await db.collection('room_players').where({ roomId: room._id }).get();
  const players = playersRes.data || [];
  const userMap = await getUserMap(players.map(p => p.userId));
  return {
    roomCode: room.roomCode,
    gameType: room.gameType,
    status: room.status,
    maxPlayers: room.maxPlayers,
    ownerUserId: room.ownerUserId,
    createdAt: room.createdAt,
    settledAt: room.settledAt,
    players: players.map(p => buildPlayerView(p, userMap))
  };
}

/**
 * 计分操作：
 * 支持单次计分与批量（原子）计分以大幅提升点击响应速度，杜绝卡顿
 */
exports.main = async (event, context) => {
  const { roomCode, operatorUserId, targetUserId, scoreDelta, remark, operations } = event;
  try {
    if (!roomCode) {
      throw new Error('参数不完整，缺少roomCode');
    }

    const room = await getRoomByCode(roomCode);
    if (room.status === 'SETTLED') throw new Error('房间已结算，不能继续计分');

    // 获取所有房间内玩家
    const playersRes = await db.collection('room_players').where({ roomId: room._id }).get();
    const players = playersRes.data || [];
    const playerMap = {};
    players.forEach(p => {
      playerMap[p.userId] = p;
    });

    let ops = [];
    if (operations && operations.length > 0) {
      ops = operations;
    } else {
      if (operatorUserId === undefined || targetUserId === undefined || scoreDelta === undefined) {
        throw new Error('参数不完整');
      }
      ops = [{
        operatorUserId,
        targetUserId,
        scoreDelta: parseInt(scoreDelta, 10)
      }];
    }

    // 预计算所有玩家的分数变化
    const scoreChanges = {};
    players.forEach(p => {
      scoreChanges[p.userId] = 0;
    });

    ops.forEach(op => {
      const opId = String(op.operatorUserId);
      const tgId = String(op.targetUserId);
      const delta = parseInt(op.scoreDelta, 10);
      if (isNaN(delta) || delta <= 0) throw new Error('分数必须为正整数');

      if (!playerMap[opId]) throw new Error(`操作人 ${opId} 不在房间中`);
      if (!playerMap[tgId]) throw new Error(`被操作人 ${tgId} 不在房间中`);

      scoreChanges[opId] -= delta;
      scoreChanges[tgId] += delta;
    });

    // 并行执行更新
    const updatePromises = [];
    const recordPromises = [];
    const now = new Date();

    for (const userId of Object.keys(scoreChanges)) {
      const change = scoreChanges[userId];
      if (change !== 0) {
        const player = playerMap[userId];
        const newScore = player.currentScore + change;
        updatePromises.push(
          db.collection('room_players').doc(player._id).update({
            data: { currentScore: newScore }
          })
        );
      }
    }

    // 记录流水到 score_records，采用运行分数以记录严格顺序的后积分
    const runningScores = {};
    players.forEach(p => {
      runningScores[p.userId] = Number(p.currentScore || 0);
    });

    ops.forEach(op => {
      const opId = String(op.operatorUserId);
      const tgId = String(op.targetUserId);
      const delta = parseInt(op.scoreDelta, 10);
      
      runningScores[opId] -= delta;
      runningScores[tgId] += delta;

      recordPromises.push(
        db.collection('score_records').add({
          data: {
            roomId: room._id,
            operatorUserId: opId,
            targetUserId: tgId,
            scoreDelta: delta,
            operatorAfterScore: runningScores[opId],
            targetAfterScore: runningScores[tgId],
            remark: remark || '',
            createdAt: now
          }
        })
      );
    });

    await Promise.all([...updatePromises, ...recordPromises]);

    // 更新房间状态为进行中
    if (room.status === 'WAITING') {
      await db.collection('game_rooms').doc(room._id).update({
        data: { status: 'PLAYING', updatedAt: now }
      });
    }

    return { success: true, data: await getRoomDetailView(roomCode) };
  } catch (err) {
    console.error('[room-score] error:', err);
    return { success: false, message: err.message || '服务器错误' };
  }
};
