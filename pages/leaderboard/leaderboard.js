const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');

/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 战绩榜页面。头像在前，名称在后，展示总分与平均分。
 */
Page({
  data: {
    user: null,
    list: []
  },

  onShow: function() {
    this.setData({
      user: storage.getUser()
    });
    this.loadList();
  },

  onPullDownRefresh: function() {
    this.loadList().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  loadList: function() {
    return api.leaderboard().then((list) => {
      const rows = (list || []).map(function(item, index) {
        const totalGames = Number(item.totalGames || 0);
        const totalScore = Number(item.totalScore || 0);
        const avgScore = totalGames > 0 ? (totalScore / totalGames) : 0;
        return {
          rankNo: index + 1,
          userId: item.userId,
          nickname: item.nickname || String(item.userId),
          avatarUrl: item.avatarUrl || '',
          totalScore: totalScore,
          totalGames: totalGames,
          winGames: Number(item.winGames || 0),
          avgScoreText: avgScore.toFixed(2)
        };
      });
      this.setData({ list: rows });
    }).catch(() => {});
  }
});
