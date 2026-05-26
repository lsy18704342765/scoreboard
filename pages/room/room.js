const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');
const cloud = require('../../utils/cloud');
const voice = require('../../utils/voice');
const DEFAULT_VOICE_DIALECT = 'mandarin';
const DEFAULT_VOICE_LABEL = '普通话';

function decoratePlayers(players) {
  return (players || []).map(function(item) {
    const score = Number(item.currentScore || 0);
    let resultText = '不赢不输';
    if (score > 0) {
      resultText = '赢: ' + score;
    } else if (score < 0) {
      resultText = '输: ' + Math.abs(score);
    }
    return Object.assign({}, item, {
      displayScore: score,
      resultText: resultText
    });
  });
}

Page({
  data: {
    user: null,
    roomCode: '',
    roomMode: 'MAHJONG',
    room: null,
    records: [],
    voiceEnabled: true,
    voiceDialect: 'mandarin',
    voiceDialectLabel: '普通话',
    qrcodeVisible: false,
    qrcodeTempFilePath: '',
    qrcodeLoading: false,
    nineRule: {
      foul: 1,
      normal: 4,
      smallGold: 7,
      bigGold: 10
    }
  },

  onLoad: function(options) {
    this.latestRecordKey = '';
    this.lastSpokenRecordKey = '';

    const user = storage.getUser();
    const roomCode = options.roomCode || '';
    const roomMode = options.roomMode || storage.getRoomMode(roomCode) || 'MAHJONG';
    const voiceDialect = storage.getVoiceDialect();

    this.setData({
      user: user || null,
      roomCode: roomCode,
      roomMode: roomMode,
      voiceEnabled: storage.getVoiceSwitch(),
      voiceDialect: voiceDialect || DEFAULT_VOICE_DIALECT,
      voiceDialectLabel: DEFAULT_VOICE_LABEL,
      nineRule: storage.getNineBallRule()
    });

    if (!roomCode) {
      wx.showToast({ title: '缺少房间号', icon: 'none' });
      setTimeout(function() { wx.navigateBack(); }, 800);
      return;
    }

    storage.setRoomMode(roomCode, roomMode);
    wx.setNavigationBarTitle({ title: this.getRoomTitle(roomMode) });
    this.loadRoom();
  },

  onUnload: function() {
    cloud.closeRoomWatcher();
  },

  onShareAppMessage: function() {
    return {
      title: '邀请你加入' + this.getRoomTitle(this.data.roomMode),
      path: this.getInvitePath()
    };
  },

  /**
   * 生成邀请路径。
   *
   * @returns {string} 小程序路径
   */
  getInvitePath: function() {
    return '/pages/index/index?inviteRoomCode='
        + encodeURIComponent(this.data.roomCode)
        + '&roomMode='
        + encodeURIComponent(this.data.roomMode);
  },

  getRoomTitle: function(roomMode) {
    if (roomMode === 'BILLIARDS8') {
      return '中式八球计分桌';
    }
    if (roomMode === 'BILLIARDS9') {
      return '中式九球计分桌';
    }
    return '麻将计分桌';
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

  loadRoom: function() {
    const user = this.data.user;
    const roomCode = this.data.roomCode;
    let roomMode = this.data.roomMode;

    api.getRoomDetail(roomCode).then((room) => {
      if (room.gameType === 'MAHJONG') {
        roomMode = 'MAHJONG';
      } else if (room.gameType === 'BILLIARDS' && roomMode !== 'BILLIARDS8' && roomMode !== 'BILLIARDS9') {
        roomMode = storage.getRoomMode(room.roomCode) || 'BILLIARDS8';
      }

      room.players = decoratePlayers(room.players || []);
      room.roomMode = roomMode;
      this.setData({ room: room, roomMode: roomMode });
      wx.setNavigationBarTitle({ title: this.getRoomTitle(roomMode) });

      if (user) {
        storage.addRoomCode(user.id, room.roomCode);
      }
      storage.setRoomMode(room.roomCode, roomMode);
      this.saveRecentByMode(roomMode, room);
      cloud.upsertRoomSnapshot(room);

      this.loadRecords(false);
      this.startWatch();
    }).catch(() => {});
  },

  loadRecords: function(allowBroadcast) {
    api.records(this.data.roomCode).then((records) => {
      const list = records || [];
      const newestKey = list.length > 0 ? this.getRecordKey(list[0]) : '';

      if (allowBroadcast && this.latestRecordKey) {
        const incoming = [];
        for (let i = 0; i < list.length; i += 1) {
          const key = this.getRecordKey(list[i]);
          if (key === this.latestRecordKey) {
            break;
          }
          incoming.push(list[i]);
        }
        incoming.reverse().forEach((item) => {
          this.broadcastRecord(item);
        });
      }

      this.latestRecordKey = newestKey;
      this.setData({ records: list.slice(0, 12) });
    }).catch(() => {});
  },

  /**
   * 生成记录唯一键，用于识别“是否新记录”。
   *
   * @param {object} record 计分记录
   * @returns {string} 唯一键
   */
  getRecordKey: function(record) {
    if (!record) {
      return '';
    }
    if (record.id !== undefined && record.id !== null) {
      return String(record.id);
    }
    return [
      record.createdAt || '',
      record.operatorUserId || '',
      record.targetUserId || '',
      record.scoreDelta || '',
      record.remark || ''
    ].join('|');
  },

  /**
   * 根据业务记录拼装语音内容。
   * 普通给分: “收到X分”
   * 九球动作: “普胜/大金/小金/犯规”
   *
   * @param {object} record 计分记录
   * @returns {string} 可播报文本
   */
  buildBroadcastText: function(record) {
    if (!record) {
      return '';
    }
    const remark = record.remark || '';

    if (remark.indexOf('BILLIARDS9-') === 0) {
      const action = remark.replace('BILLIARDS9-', '').trim();
      if (action) {
        return action;
      }
    }

    const delta = Math.abs(Number(record.scoreDelta || 0));
    if (delta > 0) {
      return '收到' + delta + '分';
    }
    return '';
  },

  /**
   * 触发一条记录的语音播报（去重后）。
   *
   * @param {object} record 计分记录
   */
  broadcastRecord: function(record) {
    if (!this.data.voiceEnabled || !record) {
      return;
    }
    const key = this.getRecordKey(record);
    if (!key || key === this.lastSpokenRecordKey) {
      return;
    }

    const text = this.buildBroadcastText(record);
    if (!text) {
      return;
    }

    // --- 【极速反应去重优化】若 5 秒内本地刚刚播报过相同的词，则跳过云端回传的重复播报 ---
    if (this.lastLocalSpokenText === text && (Date.now() - (this.lastLocalSpokenTime || 0) < 5000)) {
      this.lastSpokenRecordKey = key;
      return;
    }

    this.lastSpokenRecordKey = key;
    voice.speak(text, this.data.voiceDialect);
  },

  startWatch: function() {
    cloud.watchRoom(this.data.roomCode, (doc) => {
      if (!doc) {
        return;
      }
      const room = this.data.room || {};
      room.status = doc.status || room.status;
      room.players = decoratePlayers(doc.players || room.players || []);
      room.settledAt = doc.settledAt || room.settledAt;
      room.roomMode = doc.roomMode || this.data.roomMode;
      
      this.setData({ room: room });
      // 实时同步时更新本地最近缓存
      this.saveRecentByMode(room.roomMode, room);
      this.loadRecords(true);

      if (doc.roomMode && doc.roomMode !== this.data.roomMode) {
        this.setData({ roomMode: doc.roomMode });
        storage.setRoomMode(this.data.roomCode, doc.roomMode);
        wx.setNavigationBarTitle({ title: this.getRoomTitle(doc.roomMode) });
      }

      if (doc.status === 'SETTLED') {
        wx.showModal({
          title: '本局已结算',
          content: '房主已结算，是否查看结果？',
          success: (res) => {
            if (res.confirm) {
              this.toResult(room.players || []);
            }
          }
        });
      }
    });
  },

  toggleVoice: function() {
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

  exitRoom: function() {
    wx.navigateBack();
  },

  /**
   * 生成可扫码入房的小程序分享图。
   * 迁移说明：原后端 qrcode 接口已移除，改用微信小程序码 API
   */
  showJoinQr: function() {
    if (this.data.qrcodeLoading) {
      return;
    }
    this.setData({ qrcodeLoading: true });
    wx.showLoading({ title: '生成中', mask: true });

    // 使用微信云开发生成小程序码
    wx.cloud.callFunction({
      name: 'room-crud',
      data: {
        action: 'qrcode',
        roomCode: this.data.roomCode,
        roomMode: this.data.roomMode
      }
    }).then(res => {
      wx.hideLoading();
      this.setData({ qrcodeLoading: false });
      var result = res.result || {};
      if (!result.success || !result.data || !result.data.fileID) {
        wx.showToast({ title: '生成扫码图失败', icon: 'none' });
        return;
      }
      // 通过 fileID 获取临时链接
      wx.cloud.getTempFileURL({
        fileList: [result.data.fileID],
        success: (urlRes) => {
          if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
            // 下载图片到本地用于预览和保存
            wx.downloadFile({
              url: urlRes.fileList[0].tempFileURL,
              success: (dlRes) => {
                if (dlRes.statusCode === 200 && dlRes.tempFilePath) {
                  this.setData({
                    qrcodeVisible: true,
                    qrcodeTempFilePath: dlRes.tempFilePath
                  });
                } else {
                  wx.showToast({ title: '生成扫码图失败', icon: 'none' });
                }
              },
              fail: () => {
                wx.showToast({ title: '生成扫码图失败', icon: 'none' });
              }
            });
          } else {
            wx.showToast({ title: '生成扫码图失败', icon: 'none' });
          }
        },
        fail: () => {
          wx.showToast({ title: '生成扫码图失败', icon: 'none' });
        }
      });
    }).catch(() => {
      wx.hideLoading();
      this.setData({ qrcodeLoading: false });
      wx.showToast({ title: '生成扫码图失败', icon: 'none' });
    });
  },

  /**
   * 空函数: 用于阻止浮层内容点击冒泡导致误关闭。
   */
  noop: function() {},

  /**
   * 关闭二维码悬浮层。
   */
  closeJoinQr: function() {
    this.setData({ qrcodeVisible: false });
  },

  /**
   * 预览二维码大图。
   */
  previewJoinQr: function() {
    if (!this.data.qrcodeTempFilePath) {
      return;
    }
    wx.previewImage({
      current: this.data.qrcodeTempFilePath,
      urls: [this.data.qrcodeTempFilePath]
    });
  },

  /**
   * 保存二维码到相册。
   */
  saveJoinQrToAlbum: function() {
    const tempFilePath = this.data.qrcodeTempFilePath;
    if (!tempFilePath) {
      wx.showToast({ title: '暂无扫码图', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success: function() {
        wx.showToast({ title: '已保存扫码图', icon: 'success' });
      },
      fail: function(err) {
        const msg = err && err.errMsg ? err.errMsg : '';
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册后重试。',
            success: function(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            }
          });
          return;
        }
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  openDetail: function() {
    const list = this.data.records || [];
    if (list.length === 0) {
      wx.showToast({ title: '暂无记录', icon: 'none' });
      return;
    }
    wx.pageScrollTo({
      selector: '#recordCard',
      duration: 300
    });
  },

  moreAction: function() {
    wx.showActionSheet({
      itemList: ['查看战绩榜', '复制房间号'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
        } else {
          wx.setClipboardData({ data: this.data.roomCode });
        }
      }
    });
  },

  giveScore: function(e) {
    const room = this.data.room;
    if (!room || !room.players || room.players.length === 0) {
      return;
    }

    const rawTargetUserId = e.currentTarget.dataset.uid;
    const targetUserId = String(rawTargetUserId);
    const target = room.players.find(function(p) { return String(p.userId) === String(targetUserId); });
    if (!target) {
      return;
    }

    const givers = room.players;

    wx.showActionSheet({
      itemList: givers.map(function(item) { return item.displayName; }),
      success: (sheet) => {
        const giver = givers[sheet.tapIndex];
        wx.showModal({
          title: '给分给 ' + target.displayName,
          content: '请输入分值',
          editable: true,
          placeholderText: '例如 1 / 2 / 5',
          success: (res) => {
            if (!res.confirm) {
              return;
            }
            const delta = Number((res.content || '').trim());
            if (!delta || delta <= 0) {
              wx.showToast({ title: '请输入正整数', icon: 'none' });
              return;
            }

            // 【优化】给分时零延迟即时语音播报
            if (this.data.voiceEnabled) {
              const text = '收到' + delta + '分';
              voice.speak(text, this.data.voiceDialect, {
                priority: 'high',
                interrupt: true
              });
              this.lastLocalSpokenText = text;
              this.lastLocalSpokenTime = Date.now();
            }

            // --- 【极速反应核心优化】乐观UI更新：立即本地计算并渲染，杜绝任何卡顿感 ---
            const oldRoom = JSON.parse(JSON.stringify(room));
            const updatedPlayers = room.players.map(p => {
              const playerCopy = Object.assign({}, p);
              playerCopy.currentScore = Number(playerCopy.currentScore || 0);
              return playerCopy;
            });

            const giverPlayer = updatedPlayers.find(p => String(p.userId) === String(giver.userId));
            const targetPlayer = updatedPlayers.find(p => String(p.userId) === String(target.userId));
            if (giverPlayer) giverPlayer.currentScore -= delta;
            if (targetPlayer) targetPlayer.currentScore += delta;

            const decoratedPlayers = decoratePlayers(updatedPlayers);
            const optimisticRoom = Object.assign({}, room, { players: decoratedPlayers });

            this.setData({ room: optimisticRoom });

            // 后台异步提交，即便网络慢也完全不卡顿。利用 watchRoom 进行数据的权威刷新，杜绝二次 setData 与请求冲突。
            api.operateScore(this.data.roomCode, giver.userId, target.userId, delta, this.data.roomMode + '-行内给分').then(() => {
              // 提交成功，不做额外冗余更新，由 watchRoom 机制静默刷新
            }).catch((err) => {
              console.error('[giveScore] failed, rolling back:', err);
              wx.showToast({ title: '计分同步失败，已回滚', icon: 'none' });
              this.setData({ room: oldRoom });
            });
          }
        });
      }
    });
  },

  onRuleInput: function(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    const nineRule = Object.assign({}, this.data.nineRule);
    nineRule[key] = value;
    this.setData({ nineRule: nineRule });
  },

  saveNineRule: function() {
    const rule = {
      foul: Number(this.data.nineRule.foul) || 1,
      normal: Number(this.data.nineRule.normal) || 4,
      smallGold: Number(this.data.nineRule.smallGold) || 7,
      bigGold: Number(this.data.nineRule.bigGold) || 10
    };
    storage.setNineBallRule(rule);
    this.setData({ nineRule: rule });
    wx.showToast({ title: '九球分值已保存', icon: 'success' });
  },

  applyNineAction: function(e) {
    const room = this.data.room;
    if (!room || !room.players || room.players.length === 0) {
      return;
    }

    const rawTargetUserId = e.currentTarget.dataset.uid;
    const targetUserId = String(rawTargetUserId);
    const action = e.currentTarget.dataset.action;
    const map = {
      foul: Number(this.data.nineRule.foul) || 1,
      normal: Number(this.data.nineRule.normal) || 4,
      smallGold: Number(this.data.nineRule.smallGold) || 7,
      bigGold: Number(this.data.nineRule.bigGold) || 10
    };
    const base = Number(map[action] || 0);
    if (base <= 0) {
      wx.showToast({ title: '分值需大于0', icon: 'none' });
      return;
    }

    const targetOthers = room.players.filter(function(p) { return String(p.userId) !== String(targetUserId); });
    const others = targetOthers.length > 0 ? targetOthers : room.players;

    const per = Math.floor(base / others.length);
    const rem = base % others.length;
    const ops = [];

    others.forEach(function(other, index) {
      let delta = per;
      if (index < rem) {
        delta += 1;
      }
      if (delta <= 0) {
        return;
      }
      if (action === 'foul') {
        ops.push({ operatorUserId: targetUserId, targetUserId: other.userId, scoreDelta: delta });
      } else {
        ops.push({ operatorUserId: other.userId, targetUserId: targetUserId, scoreDelta: delta });
      }
    });

    const actionLabelMap = {
      foul: '犯规',
      normal: '普胜',
      smallGold: '小金',
      bigGold: '大金'
    };

    // 【优化】动作即时语音播报
    if (this.data.voiceEnabled) {
      const text = actionLabelMap[action];
      voice.speak(text, this.data.voiceDialect, {
        priority: 'high',
        interrupt: true
      });
      this.lastLocalSpokenText = text;
      this.lastLocalSpokenTime = Date.now();
    }

    // --- 【极速反应核心优化】乐观UI更新：立即本地计算并渲染，杜绝任何网络延迟或遮罩卡顿 ---
    const oldRoom = JSON.parse(JSON.stringify(room));
    const updatedPlayers = room.players.map(p => {
      const playerCopy = Object.assign({}, p);
      playerCopy.currentScore = Number(playerCopy.currentScore || 0);
      return playerCopy;
    });

    ops.forEach(op => {
      const opPlayer = updatedPlayers.find(p => String(p.userId) === String(op.operatorUserId));
      const tgPlayer = updatedPlayers.find(p => String(p.userId) === String(op.targetUserId));
      if (opPlayer) opPlayer.currentScore -= op.scoreDelta;
      if (tgPlayer) tgPlayer.currentScore += op.scoreDelta;
    });

    const decoratedPlayers = decoratePlayers(updatedPlayers);
    const optimisticRoom = Object.assign({}, room, { players: decoratedPlayers });

    this.setData({ room: optimisticRoom });

    // 用封装好的批量操作 API 异步发送请求，不弹出 wx.showLoading 遮罩以允许用户极速连续点击。由 watchRoom 机制异步处理渲染，消灭二次 setData 渲染与网络负载。
    const remarkStr = 'BILLIARDS9-' + actionLabelMap[action];
    api.operateScore(this.data.roomCode, ops, remarkStr).then(() => {
      // 提交成功，不做额外冗余更新，由 watchRoom 机制静默刷新
    }).catch((err) => {
      console.error('[applyNineAction] failed, rolling back:', err);
      wx.showToast({ title: '计分同步失败，已回滚', icon: 'none' });
      this.setData({ room: oldRoom });
    });
  },

  settleRoom: function() {
    const room = this.data.room;
    const user = this.data.user;
    if (!room || !user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认结算',
      content: '结算后不可继续计分，确定继续？',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        api.settleRoom(this.data.roomCode, user.id).then((settleData) => {
          const roomSnapshot = {
            roomCode: this.data.roomCode,
            gameType: settleData.gameType,
            roomMode: this.data.roomMode,
            status: 'SETTLED',
            players: decoratePlayers(settleData.players || []),
            settledAt: settleData.settledAt
          };
          cloud.upsertRoomSnapshot(roomSnapshot);
          this.toResult(settleData.players || []);
        }).catch(() => {});
      }
    });
  },

  toResult: function(players) {
    const payload = encodeURIComponent(JSON.stringify(players || []));
    wx.navigateTo({
      url: '/pages/result/result?roomCode=' + this.data.roomCode + '&players=' + payload
    });
  }
});
