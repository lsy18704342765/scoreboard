/**
 * 云函数统一调用层 - 替换 request.js 中的所有后端 API 调用
 * 所有接口统一走 wx.cloud.callFunction
 */

/**
 * 确保云开发已初始化
 * 依赖 app.js 的 waitCloudReady()，不再重复调用 wx.cloud.init
 */
function ensureCloud() {
  if (!wx.cloud) {
    return Promise.reject(new Error('当前版本不支持云开发，请升级微信'));
  }
  var app = getApp();
  if (app && app.globalData && app.globalData.cloudInited) {
    return Promise.resolve();
  }
  // 云还没就绪，等 app.js 初始化完成
  if (app && app.waitCloudReady) {
    return app.waitCloudReady();
  }
  return Promise.resolve();
}

/**
 * 调用云函数的统一封装
 * @param {string} name 云函数名
 * @param {object} data 参数
 * @returns {Promise<any>} 云函数返回的 data 字段
 */
function call(name, data) {
  return ensureCloud().then(function() {
    return wx.cloud.callFunction({ name: name, data: data });
  }).then(res => {
    if (res.errMsg && res.errMsg.indexOf('ok') === -1) {
      return Promise.reject(new Error(res.errMsg));
    }
    const result = res.result || {};
    if (!result.success) {
      return Promise.reject(new Error(result.message || '请求失败'));
    }
    return result.data;
  }).catch(err => {
    console.error(`[cloud-api] ${name} error:`, err);
    return Promise.reject(err);
  });
}

// ========== 用户相关 ==========

/**
 * 微信登录
 * @param {string} code wx.login() 返回的 code（云函数通过 getWXContext 获取 openId，此 code 仅做备用标识）
 * @param {string} nickname 昵称
 * @param {string} avatarUrl 头像URL
 */
function wechatLogin(code, nickname, avatarUrl) {
  return call('user-login', { type: 'wechat', code: code, nickname: nickname, avatarUrl: avatarUrl });
}

/**
 * 自定义昵称登录
 * @param {string} nickname 昵称
 * @param {string} avatarUrl 头像URL
 */
function customLogin(nickname, avatarUrl) {
  return call('user-login', { type: 'custom', nickname, avatarUrl });
}

/**
 * 更新用户资料
 * @param {string} userId 用户ID
 * @param {string} nickname 昵称
 * @param {string} avatarUrl 头像URL
 */
function updateProfile(userId, nickname, avatarUrl) {
  return call('user-login', { type: 'update', userId: userId, nickname: nickname, avatarUrl: avatarUrl });
}

// ========== 房间相关 ==========

/**
 * 创建房间
 * @param {number} ownerUserId 房主用户ID
 * @param {string} gameType 游戏类型 MAHJONG / BILLIARDS
 * @param {number} maxPlayers 最大人数
 * @param {string} roomMode 房间模式 MAHJONG / BILLIARDS8 / BILLIARDS9
 */
function createRoom(ownerUserId, gameType, maxPlayers, roomMode) {
  return call('room-crud', { action: 'create', ownerUserId, gameType, maxPlayers, roomMode });
}

/**
 * 加入房间
 * @param {string} roomCode 房间号
 * @param {number} userId 用户ID
 * @param {string} displayName 房间内显示名
 */
function joinRoom(roomCode, userId, displayName) {
  return call('room-crud', { action: 'join', roomCode, userId, displayName });
}

/**
 * 获取房间详情
 * @param {string} roomCode 房间号
 */
function getRoomDetail(roomCode) {
  return call('room-crud', { action: 'detail', roomCode });
}

/**
 * 计分操作（支持单个给分或批量原子给分）
 * @param {string} roomCode 房间号
 * @param {number|object[]} operatorUserId 给分人ID（若为数组，则代表批量 operations: [{operatorUserId, targetUserId, scoreDelta}]）
 * @param {number} [targetUserId] 得分人ID（若为批量，则此项传入 remark）
 * @param {number} [scoreDelta] 分值
 * @param {string} [remark] 备注（如九球动作）
 */
function operateScore(roomCode, operatorUserId, targetUserId, scoreDelta, remark) {
  if (Array.isArray(operatorUserId)) {
    return call('room-score', { roomCode, operations: operatorUserId, remark: targetUserId });
  }
  return call('room-score', { roomCode, operatorUserId, targetUserId, scoreDelta, remark });
}

/**
 * 查询计分记录
 * @param {string} roomCode 房间号
 */
function getScoreRecords(roomCode) {
  return call('room-crud', { action: 'records', roomCode });
}

/**
 * 结算房间
 * @param {string} roomCode 房间号
 * @param {number} settleUserId 结算人ID（房主）
 */
function settleRoom(roomCode, settleUserId) {
  return call('room-crud', { action: 'settle', roomCode, settleUserId });
}

// ========== 统计相关 ==========

/**
 * 排行榜
 * @param {number} limit 前N名
 */
function getLeaderboard(limit) {
  return call('stats-query', { action: 'leaderboard', limit });
}

/**
 * 用户战绩
 * @param {number} userId 用户ID
 */
function getUserStats(userId) {
  return call('stats-query', { action: 'userStats', userId });
}

// ========== 兼容旧 request.js 的别名 ==========
// 为保证其他模块无缝迁移，保持原有方法签名
const records = getScoreRecords; // alias
const leaderboard = getLeaderboard; // alias

module.exports = {
  ensureCloud,
  wechatLogin,
  customLogin,
  updateProfile,
  createRoom,
  joinRoom,
  getRoomDetail,
  operateScore,
  getScoreRecords,
  settleRoom,
  getLeaderboard,
  getUserStats,
  // 兼容别名
  records,
  leaderboard
};
