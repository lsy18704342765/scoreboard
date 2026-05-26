/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 微信小程序请求封装。统一处理业务码和错误提示。
 */
const CONFIG = require('./config');

function request(options) {
  return new Promise(function(resolve, reject) {
    wx.request({
      url: CONFIG.BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: 15000,
      header: {
        'content-type': 'application/json'
      },
      success: function(res) {
        const body = res.data || {};
        if (body.code === 0) {
          resolve(body.data);
        } else {
          wx.showToast({
            title: body.message || '请求失败',
            icon: 'none'
          });
          reject(new Error(body.message || '请求失败'));
        }
      },
      fail: function(err) {
        wx.showToast({
          title: '网络异常',
          icon: 'none'
        });
        reject(err);
      }
    });
  });
}

const api = {
  wechatLogin: function(data) {
    return request({ url: '/api/users/wechat-login', method: 'POST', data: data });
  },
  customLogin: function(data) {
    return request({ url: '/api/users/custom', method: 'POST', data: data });
  },
  updateProfile: function(data) {
    return request({ url: '/api/users/update-profile', method: 'POST', data: data });
  },
  createRoom: function(data) {
    return request({ url: '/api/rooms/create', method: 'POST', data: data });
  },
  joinRoom: function(roomCode, data) {
    return request({ url: '/api/rooms/' + roomCode + '/join', method: 'POST', data: data });
  },
  getRoomDetail: function(roomCode) {
    return request({ url: '/api/rooms/' + roomCode, method: 'GET' });
  },
  score: function(roomCode, data) {
    return request({ url: '/api/rooms/' + roomCode + '/score', method: 'POST', data: data });
  },
  records: function(roomCode) {
    return request({ url: '/api/rooms/' + roomCode + '/records', method: 'GET' });
  },
  settle: function(roomCode, data) {
    return request({ url: '/api/rooms/' + roomCode + '/settle', method: 'POST', data: data });
  },
  leaderboard: function() {
    return request({ url: '/api/stats/leaderboard', method: 'GET' });
  },
  userStats: function(userId) {
    return request({ url: '/api/stats/users/' + userId, method: 'GET' });
  },
  roomQrcodeUrl: function(roomCode, roomMode) {
    const safeRoomCode = encodeURIComponent(roomCode || '');
    const safeRoomMode = encodeURIComponent(roomMode || '');
    return CONFIG.BASE_URL + '/api/rooms/' + safeRoomCode + '/qrcode?roomMode=' + safeRoomMode + '&_t=' + Date.now();
  }
};

module.exports = api;
