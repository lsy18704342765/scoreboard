const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');

Page({
  data: {
    user: null,
    gameType: 'MAHJONG',
    gameTypeLabel: '四人麻将',
    playerIndex: 2,
    playerOptions: ['2人', '3人', '4人', '5人', '6人', '7人', '8人', '9人', '10人']
  },

  onLoad: function(options) {
    const gameType = options.gameType || 'MAHJONG';
    this.setData({
      user: storage.getUser(),
      gameType: gameType,
      gameTypeLabel: gameType === 'MAHJONG' ? '四人麻将' : '多人台球'
    });
    if (gameType === 'MAHJONG') {
      this.setData({ playerIndex: 2 });
    }
  },

  onPlayerChange: function(e) {
    if (this.data.gameType === 'MAHJONG') {
      this.setData({ playerIndex: 2 });
      return;
    }
    this.setData({ playerIndex: Number(e.detail.value) });
  },

  createRoom: function() {
    const user = this.data.user;
    if (!user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const maxPlayers = this.data.gameType === 'MAHJONG' ? 4 : (this.data.playerIndex + 2);
    api.createRoom(user.id, this.data.gameType, maxPlayers).then((room) => {
      storage.addRoomCode(user.id, room.roomCode);
      storage.setRecentRoom(room);
      wx.navigateTo({ url: '/pages/room/room?roomCode=' + room.roomCode });
    }).catch(() => {});
  }
});
