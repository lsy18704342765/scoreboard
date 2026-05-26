Page({
  data: {
    roomCode: '',
    players: [],
    maxScore: 0,
    minScore: 0,
    avgScore: 0
  },

  onLoad: function(options) {
    const roomCode = options.roomCode || '';
    let players = [];
    if (options.players) {
      try {
        players = JSON.parse(decodeURIComponent(options.players));
      } catch (e) {
        players = [];
      }
    }
    players.sort(function(a, b) {
      return b.currentScore - a.currentScore;
    });
    let maxScore = 0;
    let minScore = 0;
    let avgScore = 0;
    if (players.length > 0) {
      const scores = players.map(function(item) { return item.currentScore; });
      maxScore = Math.max.apply(null, scores);
      minScore = Math.min.apply(null, scores);
      avgScore = (scores.reduce(function(sum, n) { return sum + n; }, 0) / scores.length).toFixed(2);
    }
    this.setData({
      roomCode: roomCode,
      players: players,
      maxScore: maxScore,
      minScore: minScore,
      avgScore: avgScore
    });
  },

  backHome: function() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  toRecords: function() {
    wx.switchTab({ url: '/pages/records/records' });
  }
});
