const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');
const voice = require('../../utils/voice');
const DEFAULT_VOICE_DIALECT = 'mandarin';
const DEFAULT_VOICE_LABEL = '普通话';

/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 安全 decode，避免异常打断扫码结果解析。
 *
 * @param {string} value 编码字符串
 * @returns {string} 解析后的字符串
 */
function safeDecode(value) {
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

Page({
  data: {
    user: null,
    roomCodeInput: '',
    inviteRoomMode: '',
    voiceEnabled: true,
    voiceDialect: 'mandarin',
    voiceDialectLabel: '普通话',
    recentMahjong: null,
    recentBilliards8: null,
    recentBilliards9: null,
    expandedRecentMode: '',
    cards: [
      { key: 'MAHJONG', title: '麻将计分桌', desc: '进入后可开启新对局或续上局', icon: '🀄' },
      { key: 'BILLIARDS', title: '台球计分桌', desc: '可选中式八球 / 中式九球', icon: '🎱' }
    ]
  },

  onLoad: function(options) {
    if (options && options.inviteRoomCode) {
      const inviteInfo = {
        roomCode: this.normalizeRoomCode(options.inviteRoomCode),
        roomMode: this.normalizeRoomMode(options.roomMode)
      };
      this.setData({
        roomCodeInput: inviteInfo.roomCode,
        inviteRoomMode: inviteInfo.roomMode
      });
      this.setPendingJoinInfo(inviteInfo);
    }

    if (options && options.scene) {
      const sceneInfo = this.parseScanResult(options.scene);
      if (sceneInfo && sceneInfo.roomCode) {
        this.setData({
          roomCodeInput: sceneInfo.roomCode,
          inviteRoomMode: sceneInfo.roomMode || ''
        });
        this.setPendingJoinInfo(sceneInfo);
      }
    }
  },

  onShow: function() {
    const user = storage.getUser();
    const voiceDialect = storage.getVoiceDialect();
    this.setData({
      user: user,
      voiceEnabled: storage.getVoiceSwitch(),
      voiceDialect: voiceDialect || DEFAULT_VOICE_DIALECT,
      voiceDialectLabel: DEFAULT_VOICE_LABEL,
      recentMahjong: storage.getRecentMahjongRoom(),
      recentBilliards8: storage.getRecentBilliards8Room(),
      recentBilliards9: storage.getRecentBilliards9Room()
    });
    this.tryAutoJoinPending();
  },

  onPullDownRefresh: function() {
    this.refreshRecentRooms();
  },

  refreshRecentRooms: function() {
    const tasks = [];
    const recentList = [
      { key: 'mahjong', room: storage.getRecentMahjongRoom() },
      { key: 'b8', room: storage.getRecentBilliards8Room() },
      { key: 'b9', room: storage.getRecentBilliards9Room() }
    ];
    recentList.forEach((item) => {
      if (item.room && item.room.roomCode) {
        tasks.push(api.getRoomDetail(item.room.roomCode).then((detail) => {
          if (item.key === 'mahjong') {
            storage.setRecentMahjongRoom(detail);
          } else if (item.key === 'b8') {
            storage.setRecentBilliards8Room(detail);
          } else {
            storage.setRecentBilliards9Room(detail);
          }
        }).catch(() => {}));
      }
    });
    Promise.all(tasks).finally(() => {
      this.setData({
        recentMahjong: storage.getRecentMahjongRoom(),
        recentBilliards8: storage.getRecentBilliards8Room(),
        recentBilliards9: storage.getRecentBilliards9Room()
      });
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 缓存待加入房间信息。
   *
   * @param {object} info 待加入信息
   */
  setPendingJoinInfo: function(info) {
    const roomCode = this.normalizeRoomCode(info && info.roomCode);
    const roomMode = this.normalizeRoomMode(info && info.roomMode);
    if (!roomCode) {
      return;
    }
    storage.setPendingJoinInfo({
      roomCode: roomCode,
      roomMode: roomMode
    });
    this.pendingJoinPrompted = false;
  },

  /**
   * 自动处理待加入房间。
   * 未登录时提示去登录，登录后自动进入房间。
   */
  tryAutoJoinPending: function() {
    const pendingInfo = storage.getPendingJoinInfo();
    if (!pendingInfo || !pendingInfo.roomCode) {
      this.pendingJoinPrompted = false;
      return;
    }
    this.setData({
      roomCodeInput: pendingInfo.roomCode,
      inviteRoomMode: this.normalizeRoomMode(pendingInfo.roomMode)
    });

    if (this.autoJoinProcessing) {
      return;
    }
    if (this.data.user) {
      this.autoJoinProcessing = true;
      storage.clearPendingJoinInfo();
      this.joinByRoomCode(pendingInfo.roomCode, pendingInfo.roomMode, true)
        .catch(() => {})
        .finally(() => {
          this.autoJoinProcessing = false;
        });
      return;
    }

    if (this.pendingJoinPrompted) {
      return;
    }
    this.pendingJoinPrompted = true;
    wx.showModal({
      title: '请先登录',
      content: '检测到房间邀请，登录后将自动进入该房间。',
      confirmText: '去登录',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/mine/mine' });
        }
      }
    });
  },

  onCardTap: function(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (key === 'MAHJONG') {
      this.enterMahjong();
    } else {
      this.enterBilliards();
    }
  },

  enterMahjong: function() {
    wx.showModal({
      title: '麻将计分桌',
      content: '是否开启新对局？',
      success: (res) => {
        if (res.confirm) {
          this.createAndGo('MAHJONG', 'MAHJONG');
        } else {
          const recent = storage.getRecentMahjongRoom();
          if (recent && recent.roomCode) {
            wx.navigateTo({ url: '/pages/room/room?roomCode=' + recent.roomCode + '&roomMode=MAHJONG' });
          } else {
            wx.showToast({ title: '暂无最近麻将对局', icon: 'none' });
          }
        }
      }
    });
  },

  enterBilliards: function() {
    wx.showActionSheet({
      itemList: ['中式八球', '中式九球'],
      success: (sheet) => {
        const mode = sheet.tapIndex === 0 ? 'BILLIARDS8' : 'BILLIARDS9';
        wx.showModal({
          title: mode === 'BILLIARDS8' ? '中式八球' : '中式九球',
          content: '是否开启新对局？',
          success: (res) => {
            if (res.confirm) {
              this.createAndGo('BILLIARDS', mode);
            } else {
              const recent = mode === 'BILLIARDS8' ? storage.getRecentBilliards8Room() : storage.getRecentBilliards9Room();
              if (recent && recent.roomCode) {
                wx.navigateTo({ url: '/pages/room/room?roomCode=' + recent.roomCode + '&roomMode=' + mode });
              } else {
                wx.showToast({ title: '暂无最近对局', icon: 'none' });
              }
            }
          }
        });
      }
    });
  },

  createAndGo: function(gameType, roomMode) {
    api.createRoom(this.data.user.id, gameType, 99, roomMode).then((room) => {
      storage.addRoomCode(this.data.user.id, room.roomCode);
      storage.setRoomMode(room.roomCode, roomMode);
      this.saveRecentByMode(roomMode, room);
      wx.navigateTo({
        url: '/pages/room/room?roomCode=' + room.roomCode + '&roomMode=' + roomMode
      });
    }).catch(() => {});
  },

  saveRecentByMode: function(roomMode, room) {
    storage.setRecentRoom(room);
    if (roomMode === 'MAHJONG') {
      storage.setRecentMahjongRoom(room);
    } else if (roomMode === 'BILLIARDS8') {
      storage.setRecentBilliards8Room(room);
    } else if (roomMode === 'BILLIARDS9') {
      storage.setRecentBilliards9Room(room);
    }
  },

  onVoiceToggle: function() {
    const nextEnabled = !this.data.voiceEnabled;
    storage.setVoiceSwitch(nextEnabled);
    if (nextEnabled) {
      storage.setVoiceDialect(DEFAULT_VOICE_DIALECT);
    }
    this.setData({
      voiceEnabled: nextEnabled,
      voiceDialect: DEFAULT_VOICE_DIALECT,
      voiceDialectLabel: DEFAULT_VOICE_LABEL
    });
    wx.showToast({
      title: nextEnabled ? '已开启语音播报' : '已关闭语音播报',
      icon: 'none'
    });
    if (nextEnabled) {
      voice.speak('已开启语音播报', DEFAULT_VOICE_DIALECT, {
        priority: 'high',
        interrupt: true
      });
    }
  },

  onRoomInput: function(e) {
    this.setData({ roomCodeInput: e.detail.value || '' });
  },

  /**
   * 统一执行加入房间，供“输入加入”和“扫码加入”复用。
   *
   * @param {string} roomCode  房间号
   * @param {string} modeHint  预期房间模式
   * @param {boolean} autoJoin 是否自动加入流程
   */
  joinByRoomCode: function(roomCode, modeHint, autoJoin) {
    const normalizedCode = this.normalizeRoomCode(roomCode);
    if (!normalizedCode) {
      if (!autoJoin) {
        wx.showToast({ title: '请输入房间号', icon: 'none' });
      }
      return Promise.resolve();
    }

    const normalizedMode = this.normalizeRoomMode(modeHint)
      || this.normalizeRoomMode(this.data.inviteRoomMode)
      || storage.getRoomMode(normalizedCode)
      || 'MAHJONG';

    if (!this.data.user) {
      this.setPendingJoinInfo({
        roomCode: normalizedCode,
        roomMode: normalizedMode
      });
      if (!autoJoin) {
        wx.showModal({
          title: '请先登录',
          content: '登录后将自动进入该房间。',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/mine/mine' });
            }
          }
        });
      }
      return Promise.resolve();
    }

    let roomMode = normalizedMode;

    return api.joinRoom(normalizedCode, this.data.user.id, this.data.user.nickname).then((room) => {
      if (room.gameType === 'MAHJONG') {
        roomMode = 'MAHJONG';
      } else if (room.gameType === 'BILLIARDS' && roomMode === 'MAHJONG') {
        roomMode = storage.getRoomMode(room.roomCode) || 'BILLIARDS8';
      }
      storage.addRoomCode(this.data.user.id, room.roomCode);
      storage.setRoomMode(room.roomCode, roomMode);
      this.saveRecentByMode(roomMode, room);
      storage.clearPendingJoinInfo();
      this.pendingJoinPrompted = false;
      wx.navigateTo({ url: '/pages/room/room?roomCode=' + room.roomCode + '&roomMode=' + roomMode });
      return room;
    }).catch((err) => {
      if (autoJoin) {
        wx.showToast({ title: '自动进入房间失败', icon: 'none' });
      }
      throw err;
    });
  },

  joinRoom: function() {
    this.joinByRoomCode(this.data.roomCodeInput, this.data.inviteRoomMode).catch(() => {});
  },

  /**
   * 扫描二维码加入房间，支持纯房间号和带参数链接两种格式。
   */
  scanJoinRoom: function() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const parsed = this.parseScanResult(res.result || '');
        if (!parsed || !parsed.roomCode) {
          wx.showToast({ title: '未识别到房间号', icon: 'none' });
          return;
        }
        this.setData({
          roomCodeInput: parsed.roomCode,
          inviteRoomMode: parsed.roomMode || ''
        });
        this.joinByRoomCode(parsed.roomCode, parsed.roomMode).catch(() => {});
      },
      fail: (err) => {
        const msg = err && err.errMsg ? err.errMsg : '';
        if (msg.indexOf('cancel') >= 0) {
          return;
        }
        wx.showToast({ title: '扫码失败', icon: 'none' });
      }
    });
  },

  /**
   * 从扫码结果中提取房间信息。
   *
   * @param {string} raw 扫码结果原文
   * @returns {object|null} 解析后的 {roomCode, roomMode}
   */
  parseScanResult: function(raw) {
    const original = (raw || '').trim();
    if (!original) {
      return null;
    }

    const candidates = [original];
    let current = original;
    for (let i = 0; i < 3; i += 1) {
      const decoded = safeDecode(current);
      if (!decoded || decoded === current) {
        break;
      }
      if (candidates.indexOf(decoded) < 0) {
        candidates.push(decoded);
      }
      current = decoded;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const info = this.parseRoomInfoText(candidates[i]);
      if (info && info.roomCode) {
        return info;
      }
      const scene = this.extractValue(candidates[i], 'scene');
      if (scene) {
        const sceneInfo = this.parseRoomInfoText(scene);
        if (sceneInfo && sceneInfo.roomCode) {
          return sceneInfo;
        }
      }
    }

    const directCode = this.normalizeRoomCode(original);
    if (directCode && /^[A-Za-z0-9_-]{4,32}$/.test(directCode)) {
      return { roomCode: directCode, roomMode: '' };
    }
    return null;
  },

  /**
   * 解析文本中的 roomCode / roomMode 参数。
   *
   * @param {string} text 待解析文本
   * @returns {object} 解析结果
   */
  parseRoomInfoText: function(text) {
    const roomCode = this.normalizeRoomCode(
      this.extractValue(text, 'inviteRoomCode')
      || this.extractValue(text, 'roomCode')
      || this.extractValue(text, 'code')
    );
    const roomMode = this.normalizeRoomMode(
      this.extractValue(text, 'roomMode')
      || this.extractValue(text, 'mode')
    );
    return {
      roomCode: roomCode,
      roomMode: roomMode
    };
  },

  /**
   * 从字符串中抽取参数值，支持 ?a=1&b=2 和 a=1&b=2 两类文本。
   *
   * @param {string} text 文本
   * @param {string} key 参数名
   * @returns {string} 参数值
   */
  extractValue: function(text, key) {
    if (!text || !key) {
      return '';
    }
    const patternList = [
      new RegExp('[?&]' + key + '=([^&#]+)', 'i'),
      new RegExp('^' + key + '=([^&#]+)', 'i'),
      new RegExp(key + '=([^&#]+)', 'i')
    ];
    for (let i = 0; i < patternList.length; i += 1) {
      const matched = text.match(patternList[i]);
      if (matched && matched[1]) {
        return safeDecode(matched[1]);
      }
    }
    return '';
  },

  /**
   * 规范化房间模式。
   *
   * @param {string} mode 原始模式
   * @returns {string} 合法模式或空串
   */
  normalizeRoomMode: function(mode) {
    const upper = String(mode || '').trim().toUpperCase();
    if (upper === 'MAHJONG' || upper === 'BILLIARDS8' || upper === 'BILLIARDS9') {
      return upper;
    }
    return '';
  },

  /**
   * 规范化房间号，仅保留字母、数字、下划线和中划线。
   *
   * @param {string} roomCode 原始房间号
   * @returns {string} 规范化结果
   */
  normalizeRoomCode: function(roomCode) {
    return String(roomCode || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
  },

  openRecent: function(e) {
    const mode = e.currentTarget.dataset.mode;
    let recent = null;
    if (mode === 'MAHJONG') {
      recent = this.data.recentMahjong;
    } else if (mode === 'BILLIARDS8') {
      recent = this.data.recentBilliards8;
    } else {
      recent = this.data.recentBilliards9;
    }
    if (!recent || !recent.roomCode) {
      wx.showToast({ title: '暂无最近对局', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/room/room?roomCode=' + recent.roomCode + '&roomMode=' + mode });
  },

  /**
   * 展开/收起最近对局详情（玩家与分数）。
   */
  toggleRecentDetail: function(e) {
    const mode = e.currentTarget.dataset.mode;
    const expanded = this.data.expandedRecentMode === mode ? '' : mode;
    this.setData({ expandedRecentMode: expanded });
  },

  toRecords: function() {
    wx.switchTab({ url: '/pages/records/records' });
  }
});