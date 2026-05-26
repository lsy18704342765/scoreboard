const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');

/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 记录页。按麻将/台球八球/台球九球分类展示，并分别统计总分和平均分。
 */
Page({
  data: {
    user: null,
    tabList: ['全部', '麻将计分桌', '台球计分桌-中式八球', '台球计分桌-中式九球'],
    tabIndex: 0,
    summary: {
      totalGames: 0,
      settledGames: 0,
      winGames: 0,
      loseGames: 0,
      drawGames: 0,
      totalScore: 0,
      avgScore: 0,
      avgScoreText: '0.00'
    },
    roomList: [],
    filteredRoomList: []
  },

  onShow: function() {
    const user = storage.getUser();
    this.setData({ user: user || null });
    this.loadRooms();
  },

  onPullDownRefresh: function() {
    this.loadRooms().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  switchTab: function(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ tabIndex: index });
    this.applyFilter();
  },

  /**
   * 根据 tab 下标获取模式值。
   *
   * @param {number} index 下标
   * @returns {string} 模式值
   */
  getModeByTabIndex: function(index) {
    const list = ['ALL', 'MAHJONG', 'BILLIARDS8', 'BILLIARDS9'];
    return list[index] || 'ALL';
  },

  /**
   * 判断是否是合法台球模式。
   *
   * @param {string} mode 模式
   * @returns {boolean} 是否合法
   */
  isValidBilliardsMode: function(mode) {
    return mode === 'BILLIARDS8' || mode === 'BILLIARDS9';
  },

  /**
   * 获取房间类型文案。
   *
   * @param {string} mode 房间模式
   * @returns {string} 文案
   */
  getRoomTypeText: function(mode) {
    if (mode === 'MAHJONG') {
      return '麻将计分桌';
    }
    if (mode === 'BILLIARDS9') {
      return '台球计分桌-中式九球';
    }
    return '台球计分桌-中式八球';
  },

  /**
   * 推断房间模式。
   * 优先本地缓存，其次通过记录 remark 判断八球/九球。
   *
   * @param {object} room 房间详情
   * @returns {Promise<string>} 模式
   */
  resolveRoomMode: function(room) {
    if (!room) {
      return Promise.resolve('MAHJONG');
    }
    if (room.roomMode) {
      storage.setRoomMode(room.roomCode, room.roomMode);
      return Promise.resolve(room.roomMode);
    }
    if (room.gameType === 'MAHJONG') {
      storage.setRoomMode(room.roomCode, 'MAHJONG');
      return Promise.resolve('MAHJONG');
    }
    const cached = storage.getRoomMode(room.roomCode);
    if (this.isValidBilliardsMode(cached)) {
      return Promise.resolve(cached);
    }
    return this.inferBilliardsModeByRecords(room.roomCode).then(function(mode) {
      storage.setRoomMode(room.roomCode, mode);
      return mode;
    }).catch(function() {
      storage.setRoomMode(room.roomCode, 'BILLIARDS8');
      return 'BILLIARDS8';
    });
  },

  /**
   * 通过计分记录 remark 推断台球模式。
   *
   * @param {string} roomCode 房间号
   * @returns {Promise<string>} 模式
   */
  inferBilliardsModeByRecords: function(roomCode) {
    return api.records(roomCode).then(function(records) {
      const list = records || [];
      let hasNine = false;
      let hasEight = false;
      list.forEach(function(item) {
        const remark = String((item && item.remark) || '').toUpperCase();
        if (remark.indexOf('BILLIARDS9-') === 0 || remark.indexOf('BILLIARDS9') >= 0) {
          hasNine = true;
        }
        if (remark.indexOf('BILLIARDS8-') === 0 || remark.indexOf('BILLIARDS8') >= 0) {
          hasEight = true;
        }
      });
      if (hasNine) {
        return 'BILLIARDS9';
      }
      if (hasEight) {
        return 'BILLIARDS8';
      }
      return 'BILLIARDS8';
    }).catch(function() {
      return 'BILLIARDS8';
    });
  },

  loadRooms: function() {
    const user = this.data.user;
    if (!user) {
      this.setData({ roomList: [], filteredRoomList: [] });
      this.calculateSummary([]);
      return Promise.resolve();
    }
    const roomCodes = storage.getRoomCodes(user.id);
    if (!roomCodes || roomCodes.length === 0) {
      this.setData({ roomList: [], filteredRoomList: [] });
      this.calculateSummary([]);
      return Promise.resolve();
    }
    const requestList = roomCodes.map(function(roomCode) {
      return api.getRoomDetail(roomCode).then(function(room) {
        return room;
      }).catch(function() {
        return null;
      });
    });
    return Promise.all(requestList).then((rooms) => {
      const validRooms = rooms.filter(function(item) { return !!item; });
      const decorateTasks = validRooms.map((room) => {
        return this.resolveRoomMode(room).then((roomMode) => {
          const players = (room.players || []).map(function(player) {
            const score = Number(player.currentScore || 0);
            return Object.assign({}, player, {
              currentScore: score
            });
          });
          const selfPlayer = players.find((item) => {
            return String(item.userId) === String(user.id);
          });
          const selfScore = selfPlayer ? Number(selfPlayer.currentScore || 0) : 0;
          return Object.assign({}, room, {
            roomMode: roomMode,
            roomTypeText: this.getRoomTypeText(roomMode),
            players: players,
            selfScore: selfScore
          });
        });
      });
      return Promise.all(decorateTasks).then((decorated) => {
        decorated.sort(function(a, b) {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        this.setData({ roomList: decorated });
        this.applyFilter();
      });
    });
  },

  applyFilter: function() {
    const mode = this.getModeByTabIndex(this.data.tabIndex);
    const all = this.data.roomList || [];
    let list = all;
    if (mode !== 'ALL') {
      list = all.filter(function(item) { return item.roomMode === mode; });
    }
    this.setData({ filteredRoomList: list });
    this.calculateSummary(list);
  },

  /**
   * 统计当前筛选结果。
   *
   * @param {Array} roomList 房间列表
   */
  calculateSummary: function(roomList) {
    const list = roomList || [];
    let settledGames = 0;
    let winGames = 0;
    let loseGames = 0;
    let drawGames = 0;
    let totalScore = 0;

    list.forEach(function(room) {
      const score = Number(room.selfScore || 0);
      totalScore += score;
      if (room.status === 'SETTLED') {
        settledGames += 1;
      }
      if (score > 0) {
        winGames += 1;
      } else if (score < 0) {
        loseGames += 1;
      } else {
        drawGames += 1;
      }
    });

    const totalGames = list.length;
    const avgScore = totalGames > 0 ? totalScore / totalGames : 0;
    this.setData({
      summary: {
        totalGames: totalGames,
        settledGames: settledGames,
        winGames: winGames,
        loseGames: loseGames,
        drawGames: drawGames,
        totalScore: totalScore,
        avgScore: avgScore,
        avgScoreText: avgScore.toFixed(2)
      }
    });
  },

  showLeaderboard: function() {
    wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
  },

  openRoom: function(e) {
    const roomCode = e.currentTarget.dataset.code;
    const roomMode = e.currentTarget.dataset.mode || '';
    wx.navigateTo({ url: '/pages/room/room?roomCode=' + roomCode + '&roomMode=' + roomMode });
  },

  copyRoomCode: function(e) {
    const roomCode = e.currentTarget.dataset.code;
    wx.setClipboardData({ data: roomCode });
  }
});
