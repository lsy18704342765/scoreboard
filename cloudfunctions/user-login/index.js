/**
 * 用户登录云函数 - 替换后端 /api/users/*
 * 支持微信授权登录和自定义昵称登录
 *
 * 微信登录流程：
 * 1. 前端调 wx.getUserProfile 获取昵称/头像
 * 2. 调此云函数，通过 cloud.getWXContext() 自动获取调用者 openId
 * 3. 不需要前端传 wx.login 的 code
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function buildUserProfile(rec) {
  return {
    id: rec._id || rec.id,
    nickname: rec.nickname,
    avatarUrl: rec.avatarUrl || '',
    sourceType: rec.sourceType || 'CUSTOM',
    createdAt: rec.createdAt
  };
}

async function handleWechatLogin(openId, nickname, avatarUrl) {
  const now = new Date();
  let userRecord = null;

  // 通过 openId 查找已有用户
  try {
    const res = await db.collection('app_users').where({ wechatOpenId: openId }).limit(1).get();
    if (res.data && res.data.length > 0) userRecord = res.data[0];
  } catch (e) {
    console.error('[user-login] query wechatOpenId failed:', e);
  }

  if (userRecord) {
    // 已有用户，更新昵称/头像
    const ud = {};
    if (nickname) ud.nickname = nickname;
    if (avatarUrl) ud.avatarUrl = avatarUrl;
    ud.updatedAt = now;
    if (Object.keys(ud).length > 0) {
      await db.collection('app_users').doc(userRecord._id).update({ data: ud });
      Object.assign(userRecord, ud);
    }
  } else {
    // 新用户，创建记录
    const newUser = {
      wechatOpenId: openId,
      nickname: nickname || '微信用户',
      avatarUrl: avatarUrl || '',
      sourceType: 'WECHAT',
      createdAt: now,
      updatedAt: now
    };
    const addRes = await db.collection('app_users').add({ data: newUser });
    userRecord = { _id: addRes._id, ...newUser };
  }
  return buildUserProfile(userRecord);
}

async function handleCustomLogin(nickname, avatarUrl) {
  const now = new Date();
  const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  const newUser = {
    wechatOpenId: guestId,
    nickname: nickname || ('游客' + Math.floor(Math.random() * 9999)),
    avatarUrl: avatarUrl || '',
    sourceType: 'CUSTOM',
    createdAt: now,
    updatedAt: now
  };
  const addRes = await db.collection('app_users').add({ data: newUser });
  return buildUserProfile({ _id: addRes._id, ...newUser });
}

async function handleUpdateProfile(userId, nickname, avatarUrl) {
  const ud = {};
  if (nickname !== undefined) ud.nickname = nickname;
  if (avatarUrl !== undefined) ud.avatarUrl = avatarUrl;
  ud.updatedAt = new Date();
  await db.collection('app_users').doc(userId).update({ data: ud });

  const targetUid = String(userId);

  // 1. 同步更新进行中对局的实时快照表（scoreboard_room_sync），保持同房间对手屏幕 50ms 内秒级刷新
  try {
    const syncRooms = await db.collection('scoreboard_room_sync').where({
      'players.userId': targetUid
    }).get();
    
    if (syncRooms.data && syncRooms.data.length > 0) {
      for (const roomDoc of syncRooms.data) {
        let modified = false;
        const updatedPlayers = roomDoc.players.map(p => {
          if (String(p.userId) === targetUid) {
            const pCopy = Object.assign({}, p);
            if (nickname !== undefined) {
              pCopy.displayName = nickname;
              modified = true;
            }
            if (avatarUrl !== undefined) {
              pCopy.avatarUrl = avatarUrl;
              modified = true;
            }
            return pCopy;
          }
          return p;
        });
        
        if (modified) {
          await db.collection('scoreboard_room_sync').doc(roomDoc._id).update({
            data: {
              players: updatedPlayers,
              updatedAt: Date.now()
            }
          });
        }
      }
    }
  } catch (e) {
    console.error('Failed to sync profile to scoreboard_room_sync:', e);
  }

  const rec = (await db.collection('app_users').doc(userId).get()).data;
  return buildUserProfile(rec);
}

exports.main = async (event, context) => {
  const { type, nickname, avatarUrl, userId } = event;
  try {
    if (type === 'wechat') {
      // 通过 cloud.getWXContext() 获取调用者真实 openId，不依赖前端传 code
      const wxContext = cloud.getWXContext();
      const openId = wxContext.OPENID;
      return { success: true, data: await handleWechatLogin(openId, nickname, avatarUrl) };
    }
    if (type === 'custom') return { success: true, data: await handleCustomLogin(nickname, avatarUrl) };
    if (type === 'update') return { success: true, data: await handleUpdateProfile(userId, nickname, avatarUrl) };
    return { success: false, message: '未知登录类型' };
  } catch (err) {
    return { success: false, message: err.message || '服务器错误' };
  }
};
