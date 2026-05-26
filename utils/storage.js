/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 本地缓存工具，集中管理用户、房间、开关状态、九球配置。
 */
const KEY_USER = 'scoreboard_user';
const KEY_RECENT_ROOM = 'scoreboard_recent_room';
const KEY_VOICE = 'scoreboard_voice_switch';
const KEY_RECENT_MAHJONG = 'scoreboard_recent_mahjong_room';
const KEY_RECENT_BILLIARDS8 = 'scoreboard_recent_billiards8_room';
const KEY_RECENT_BILLIARDS9 = 'scoreboard_recent_billiards9_room';
const KEY_NINE_BALL_RULE = 'scoreboard_nine_ball_rule';
const KEY_WECHAT_OPEN_ID = 'scoreboard_wechat_openid';
const KEY_VOICE_DIALECT = 'scoreboard_voice_dialect';
const KEY_PENDING_JOIN = 'scoreboard_pending_join';
const DEFAULT_VOICE_DIALECT = 'mandarin';
const VOICE_DIALECT_KEYS = [DEFAULT_VOICE_DIALECT];

function getUser() {
  return wx.getStorageSync(KEY_USER) || null;
}

function setUser(user) {
  wx.setStorageSync(KEY_USER, user || null);
}

function clearUser() {
  wx.removeStorageSync(KEY_USER);
}

function getRoomCodes(userId) {
  if (!userId) {
    return [];
  }
  const key = 'scoreboard_room_codes_' + userId;
  return wx.getStorageSync(key) || [];
}

function addRoomCode(userId, roomCode) {
  if (!userId || !roomCode) {
    return;
  }
  const key = 'scoreboard_room_codes_' + userId;
  const list = wx.getStorageSync(key) || [];
  if (list.indexOf(roomCode) === -1) {
    list.unshift(roomCode);
    wx.setStorageSync(key, list.slice(0, 30));
  }
}

function getRecentRoom() {
  return wx.getStorageSync(KEY_RECENT_ROOM) || null;
}

function setRecentRoom(room) {
  wx.setStorageSync(KEY_RECENT_ROOM, room || null);
}

function getRecentMahjongRoom() {
  return wx.getStorageSync(KEY_RECENT_MAHJONG) || null;
}

function setRecentMahjongRoom(room) {
  wx.setStorageSync(KEY_RECENT_MAHJONG, room || null);
}

function getRecentBilliards8Room() {
  return wx.getStorageSync(KEY_RECENT_BILLIARDS8) || null;
}

function setRecentBilliards8Room(room) {
  wx.setStorageSync(KEY_RECENT_BILLIARDS8, room || null);
}

function getRecentBilliards9Room() {
  return wx.getStorageSync(KEY_RECENT_BILLIARDS9) || null;
}

function setRecentBilliards9Room(room) {
  wx.setStorageSync(KEY_RECENT_BILLIARDS9, room || null);
}

function getVoiceSwitch() {
  const value = wx.getStorageSync(KEY_VOICE);
  if (value === '' || value === undefined || value === null) {
    return true;
  }
  return !!value;
}

function setVoiceSwitch(enabled) {
  wx.setStorageSync(KEY_VOICE, !!enabled);
}

/**
 * 判断方言配置是否合法。
 *
 * @param {string} dialect 方言编码
 * @returns {boolean} 是否合法
 */
function isValidVoiceDialect(dialect) {
  return VOICE_DIALECT_KEYS.indexOf(String(dialect || '').trim()) >= 0;
}

/**
 * 获取当前语音方言配置。
 *
 * @returns {string} 方言编码
 */
function getVoiceDialect() {
  const dialect = wx.getStorageSync(KEY_VOICE_DIALECT);
  if (isValidVoiceDialect(dialect)) {
    return dialect;
  }
  wx.setStorageSync(KEY_VOICE_DIALECT, DEFAULT_VOICE_DIALECT);
  return DEFAULT_VOICE_DIALECT;
}

/**
 * 保存语音方言配置。
 *
 * @param {string} dialect 方言编码
 */
function setVoiceDialect(dialect) {
  const safeDialect = isValidVoiceDialect(dialect) ? String(dialect) : DEFAULT_VOICE_DIALECT;
  wx.setStorageSync(KEY_VOICE_DIALECT, safeDialect);
}

function setRoomMode(roomCode, mode) {
  if (!roomCode || !mode) {
    return;
  }
  wx.setStorageSync('scoreboard_room_mode_' + roomCode, mode);
}

function getRoomMode(roomCode) {
  if (!roomCode) {
    return '';
  }
  return wx.getStorageSync('scoreboard_room_mode_' + roomCode) || '';
}

/**
 * 缓存待加入房间信息。
 * 说明: 扫码/邀请进入但用户未登录时先保存，登录后自动进入房间。
 *
 * @param {object} info 待加入信息
 */
function setPendingJoinInfo(info) {
  if (!info || !info.roomCode) {
    wx.removeStorageSync(KEY_PENDING_JOIN);
    return;
  }
  const payload = {
    roomCode: String(info.roomCode || '').trim(),
    roomMode: String(info.roomMode || '').trim()
  };
  if (!payload.roomCode) {
    wx.removeStorageSync(KEY_PENDING_JOIN);
    return;
  }
  wx.setStorageSync(KEY_PENDING_JOIN, payload);
}

/**
 * 获取待加入房间信息。
 *
 * @returns {object|null} 待加入信息
 */
function getPendingJoinInfo() {
  const info = wx.getStorageSync(KEY_PENDING_JOIN);
  if (!info || !info.roomCode) {
    return null;
  }
  return info;
}

/**
 * 清除待加入房间信息。
 */
function clearPendingJoinInfo() {
  wx.removeStorageSync(KEY_PENDING_JOIN);
}

function getNineBallRule() {
  return wx.getStorageSync(KEY_NINE_BALL_RULE) || {
    foul: 1,
    normal: 4,
    smallGold: 7,
    bigGold: 10
  };
}

function setNineBallRule(rule) {
  if (!rule) {
    return;
  }
  const safe = {
    foul: Number(rule.foul) || 1,
    normal: Number(rule.normal) || 4,
    smallGold: Number(rule.smallGold) || 7,
    bigGold: Number(rule.bigGold) || 10
  };
  wx.setStorageSync(KEY_NINE_BALL_RULE, safe);
}

/**
 * 获取或创建本地微信标识。
 * 说明: 该标识用于和后端绑定同一微信用户。注销后会清除，重新登录将生成新ID。
 */
function getOrCreateWechatOpenId() {
  let openId = wx.getStorageSync(KEY_WECHAT_OPEN_ID);
  if (openId) {
    return openId;
  }
  const random = Math.random().toString(36).slice(2, 10);
  openId = 'wx_openid_local_' + Date.now() + '_' + random;
  wx.setStorageSync(KEY_WECHAT_OPEN_ID, openId);
  return openId;
}

/**
 * 清除本地微信标识。
 */
function clearWechatOpenId() {
  wx.removeStorageSync(KEY_WECHAT_OPEN_ID);
}

/**
 * 清理用户相关缓存。
 * 说明: 注销后用户本地历史记录入口全部移除，但不会影响其他用户的数据。
 *
 * @param {number} userId 用户ID
 */
function clearUserRelatedData(userId) {
  if (userId) {
    wx.removeStorageSync('scoreboard_room_codes_' + userId);
  }
  wx.removeStorageSync(KEY_RECENT_ROOM);
  wx.removeStorageSync(KEY_RECENT_MAHJONG);
  wx.removeStorageSync(KEY_RECENT_BILLIARDS8);
  wx.removeStorageSync(KEY_RECENT_BILLIARDS9);
  wx.removeStorageSync(KEY_PENDING_JOIN);
  const info = wx.getStorageInfoSync();
  const keys = info && info.keys ? info.keys : [];
  keys.forEach(function(key) {
    if (String(key).indexOf('scoreboard_room_mode_') === 0) {
      wx.removeStorageSync(key);
    }
  });
}

module.exports = {
  getUser: getUser,
  setUser: setUser,
  clearUser: clearUser,
  getRoomCodes: getRoomCodes,
  addRoomCode: addRoomCode,
  getRecentRoom: getRecentRoom,
  setRecentRoom: setRecentRoom,
  getRecentMahjongRoom: getRecentMahjongRoom,
  setRecentMahjongRoom: setRecentMahjongRoom,
  getRecentBilliards8Room: getRecentBilliards8Room,
  setRecentBilliards8Room: setRecentBilliards8Room,
  getRecentBilliards9Room: getRecentBilliards9Room,
  setRecentBilliards9Room: setRecentBilliards9Room,
  getVoiceSwitch: getVoiceSwitch,
  setVoiceSwitch: setVoiceSwitch,
  getVoiceDialect: getVoiceDialect,
  setVoiceDialect: setVoiceDialect,
  setRoomMode: setRoomMode,
  getRoomMode: getRoomMode,
  setPendingJoinInfo: setPendingJoinInfo,
  getPendingJoinInfo: getPendingJoinInfo,
  clearPendingJoinInfo: clearPendingJoinInfo,
  getNineBallRule: getNineBallRule,
  setNineBallRule: setNineBallRule,
  getOrCreateWechatOpenId: getOrCreateWechatOpenId,
  clearWechatOpenId: clearWechatOpenId,
  clearUserRelatedData: clearUserRelatedData
};
