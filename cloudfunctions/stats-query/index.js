/**
 * 统计查询云函数 - 替换后端 /api/stats/*
 * 包含: 好友排行榜、用户战绩
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getUserMap(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const res = await db.collection('app_users').where({ _id: db.command.in(userIds) }).get();
  const map = {};
  (res.data || []).forEach(u => { map[u._id] = u; });
  return map;
}

// 排行榜：聚合所有玩家的总分/总局数/胜场
async function handleLeaderboard(limit = 50) {
  const aggResult = await db.collection('player_results')
    .aggregate()
    .group({ _id: '$userId', totalScore: db.command.aggregate.sum('$finalScore'), totalGames: db.command.aggregate.sum(1) })
    .sort({ totalScore: -1 })
    .limit(limit)
    .end();

  const rows = aggResult.list || [];
  const userIds = rows.map(r => r._id);
  const userMap = await getUserMap(userIds);

  return rows.map((row, idx) => {
    const u = userMap[row._id] || {};
    return {
      userId: row._id,
      nickname: u.nickname || String(row._id),
      avatarUrl: u.avatarUrl || '',
      totalScore: row.totalScore,
      totalGames: row.totalGames,
      winGames: 0,
      avgScoreText: row.totalGames > 0 ? (row.totalScore / row.totalGames).toFixed(2) : '0.00'
    };
  });
}

// 用户战绩
async function handleUserStats(userId) {
  const results = await db.collection('player_results').where({ userId }).get();
  const list = results.data || [];
  const totalGames = list.length;
  const totalScore = list.reduce((sum, r) => sum + (r.finalScore || 0), 0);
  const winGames = list.filter(r => r.rankNo === 1).length;
  return {
    userId,
    totalGames,
    totalScore,
    winGames,
    avgScore: totalGames > 0 ? totalScore / totalGames : 0
  };
}

exports.main = async (event, context) => {
  const { action, userId, limit } = event;
  try {
    if (action === 'leaderboard') return { success: true, data: await handleLeaderboard(limit || 50) };
    if (action === 'userStats') return { success: true, data: await handleUserStats(userId) };
    return { success: false, message: '未知操作' };
  } catch (err) {
    return { success: false, message: err.message || '服务器错误' };
  }
};
