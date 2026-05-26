/**
 * 房间CRUD云函数 - 替换后端 /api/rooms/*
 * 包含: 创建房间、加入房间、房间详情、结算
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function genRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase() + Date.now().toString().slice(-4);
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

async function getUserMap(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const res = await db.collection('app_users').where({
    _id: _.in(userIds)
  }).get();
  const map = {};
  (res.data || []).forEach(u => { map[u._id] = u; });
  return map;
}

async function getRoomDetail(roomCode) {
  const roomRes = await db.collection('game_rooms').where({ roomCode }).limit(1).get();
  if (!roomRes.data || roomRes.data.length === 0) throw new Error('房间不存在');
  const room = roomRes.data[0];
  const playersRes = await db.collection('room_players').where({ roomId: room._id }).get();
  const players = playersRes.data || [];
  const userMap = await getUserMap(players.map(p => p.userId));
  return {
    roomCode: room.roomCode,
    gameType: room.gameType,
    roomMode: room.roomMode || (room.gameType === 'MAHJONG' ? 'MAHJONG' : 'BILLIARDS8'),
    status: room.status,
    maxPlayers: room.maxPlayers,
    ownerUserId: room.ownerUserId,
    createdAt: room.createdAt,
    settledAt: room.settledAt,
    players: players.map(p => buildPlayerView(p, userMap))
  };
}

// ========== 创建房间 ==========
async function handleCreateRoom(ownerUserId, gameType, maxPlayers, roomMode) {
  let roomCode = genRoomCode();
  let attempts = 0;
  while (attempts < 10) {
    const exist = await db.collection('game_rooms').where({ roomCode }).count();
    if (exist.total === 0) break;
    roomCode = genRoomCode();
    attempts++;
  }
  if (attempts >= 10) throw new Error('房间号生成失败，请重试');

  const now = new Date();
  const ownerUser = (await db.collection('app_users').doc(ownerUserId).get()).data;
  if (!ownerUser) throw new Error('用户不存在');

  const roomAdd = await db.collection('game_rooms').add({
    data: {
      roomCode,
      gameType: gameType || 'MAHJONG',
      roomMode: roomMode || (gameType === 'MAHJONG' ? 'MAHJONG' : 'BILLIARDS8'),
      maxPlayers: maxPlayers || 4,
      ownerUserId,
      status: 'WAITING',
      createdAt: now,
      updatedAt: now,
      settledAt: null
    }
  });

  await db.collection('room_players').add({
    data: {
      roomId: roomAdd._id,
      userId: ownerUserId,
      displayName: ownerUser.nickname || '房主',
      seatNo: 1,
      currentScore: 0,
      isOwner: true,
      joinedAt: now
    }
  });

  return getRoomDetail(roomCode);
}

// ========== 加入房间 ==========
async function handleJoinRoom(roomCode, userId, displayName) {
  const roomRes = await db.collection('game_rooms').where({ roomCode }).limit(1).get();
  if (!roomRes.data || roomRes.data.length === 0) throw new Error('房间不存在');
  const room = roomRes.data[0];
  if (room.status === 'SETTLED') throw new Error('房间已结算，无法加入');

  const userRes = await db.collection('app_users').doc(userId).get();
  const user = userRes.data;
  if (!user) throw new Error('用户不存在');

  const existPlayer = await db.collection('room_players').where({
    roomId: room._id,
    userId
  }).count();
  if (existPlayer.total > 0) return getRoomDetail(roomCode);

  const memberCount = (await db.collection('room_players').where({ roomId: room._id }).count()).total;
  if (memberCount >= room.maxPlayers) throw new Error('房间已满');

  await db.collection('room_players').add({
    data: {
      roomId: room._id,
      userId,
      displayName: displayName || user.nickname || '玩家',
      seatNo: memberCount + 1,
      currentScore: 0,
      isOwner: false,
      joinedAt: new Date()
    }
  });

  // 第2人进入则开始游戏
  if (memberCount + 1 >= 2 && room.status === 'WAITING') {
    await db.collection('game_rooms').doc(room._id).update({
      data: { status: 'PLAYING', updatedAt: new Date() }
    });
  }

  return getRoomDetail(roomCode);
}

// ========== 结算房间 ==========
async function handleSettleRoom(roomCode, settleUserId) {
  const roomRes = await db.collection('game_rooms').where({ roomCode }).limit(1).get();
  if (!roomRes.data || roomRes.data.length === 0) throw new Error('房间不存在');
  const room = roomRes.data[0];
  if (room.status === 'SETTLED') throw new Error('房间已结算过');
  if (room.ownerUserId !== settleUserId) throw new Error('只有房主可以结算');

  const playersRes = await db.collection('room_players').where({ roomId: room._id }).get();
  const players = playersRes.data || [];
  if (players.length === 0) throw new Error('房间没有玩家');

  const now = new Date();
  // 按分数降序排序
  const sorted = [...players].sort((a, b) => b.currentScore - a.currentScore || a.seatNo - b.seatNo);

  // 更新房间状态
  await db.collection('game_rooms').doc(room._id).update({
    data: { status: 'SETTLED', settledAt: now, updatedAt: now }
  });

  const userMap = await getUserMap(players.map(p => p.userId));

  // 保存结算快照
  await db.collection('settlements').add({
    data: {
      roomId: room._id,
      settledByUserId: settleUserId,
      snapshotPlayers: sorted.map((p, i) => {
        const u = userMap[p.userId] || {};
        return {
          userId: p.userId,
          displayName: u.nickname || p.displayName || ('用户' + p.userId),
          finalScore: p.currentScore,
          rankNo: i + 1
        };
      }),
      createdAt: now
    }
  });

  // 保存战绩
  for (let i = 0; i < sorted.length; i++) {
    await db.collection('player_results').add({
      data: {
        roomId: room._id,
        userId: sorted[i].userId,
        gameType: room.gameType,
        finalScore: sorted[i].currentScore,
        rankNo: i + 1,
        createdAt: now
      }
    });
  }

  return {
    roomCode,
    gameType: room.gameType,
    settledAt: now,
    players: sorted.map((p, i) => ({
      userId: p.userId,
      displayName: p.displayName,
      currentScore: p.currentScore,
      rankNo: i + 1
    }))
  };
}

// ========== 查分 ==========
async function handleGetRecords(roomCode) {
  const roomRes = await db.collection('game_rooms').where({ roomCode }).limit(1).get();
  if (!roomRes.data || roomRes.data.length === 0) throw new Error('房间不存在');
  const room = roomRes.data[0];

  const recordsRes = await db.collection('score_records')
    .where({ roomId: room._id })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const allUserIds = [];
  (recordsRes.data || []).forEach(r => {
    if (r.operatorUserId) allUserIds.push(r.operatorUserId);
    if (r.targetUserId) allUserIds.push(r.targetUserId);
  });
  const userMap = await getUserMap([...new Set(allUserIds)]);

  return (recordsRes.data || []).map(r => {
    const op = userMap[r.operatorUserId] || {};
    const tg = userMap[r.targetUserId] || {};
    return {
      id: r._id,
      roomId: r.roomId,
      operatorUserId: r.operatorUserId,
      targetUserId: r.targetUserId,
      scoreDelta: r.scoreDelta,
      operatorAfterScore: r.operatorAfterScore,
      targetAfterScore: r.targetAfterScore,
      remark: r.remark,
      createdAt: r.createdAt,
      operatorName: op.nickname || String(r.operatorUserId),
      targetName: tg.nickname || String(r.targetUserId),
      operatorAvatarUrl: op.avatarUrl || '',
      targetAvatarUrl: tg.avatarUrl || ''
    };
  });
}

// ========== 小程序码 ==========
async function handleQrcode(roomCode, roomMode) {
  // 生成小程序码，扫码后打开首页并自动加入房间
  const path = 'pages/index/index?inviteRoomCode=' + roomCode + '&roomMode=' + (roomMode || 'MAHJONG');
  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: roomCode,
      page: 'pages/index/index',
      width: 430,
      isHyaline: false
    });
    // result.buffer 是图片 Buffer，上传到云存储获取 fileID
    const uploadRes = await cloud.uploadFile({
      cloudPath: 'qrcodes/' + roomCode + '_' + Date.now() + '.png',
      fileContent: result.buffer
    });
    return { fileID: uploadRes.fileID };
  } catch (err) {
    throw new Error('生成小程序码失败: ' + (err.message || ''));
  }
}

exports.main = async (event, context) => {
  const { action, roomCode, ownerUserId, userId, gameType, maxPlayers, displayName, settleUserId, roomMode } = event;
  try {
    if (action === 'create') return { success: true, data: await handleCreateRoom(ownerUserId, gameType, maxPlayers, roomMode) };
    if (action === 'join') return { success: true, data: await handleJoinRoom(roomCode, userId, displayName) };
    if (action === 'detail') return { success: true, data: await getRoomDetail(roomCode) };
    if (action === 'settle') return { success: true, data: await handleSettleRoom(roomCode, settleUserId) };
    if (action === 'records') return { success: true, data: await handleGetRecords(roomCode) };
    if (action === 'qrcode') return { success: true, data: await handleQrcode(roomCode, roomMode) };
    return { success: false, message: '未知操作' };
  } catch (err) {
    return { success: false, message: err.message || '服务器错误' };
  }
};
