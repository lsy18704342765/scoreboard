/**
 * 云开发配置文件
 * 在微信公众平台 - 云开发控制台 创建环境后填入环境ID
 */
module.exports = {
  // TODO: 替换为实际的云开发环境ID
  CLOUD_ENV: 'scoreboard-env-xxxxxx', // 例: 'my-cloud-1a2b3c'
  
  // 数据库集合名称（与后端 MySQL 表名对应）
  COLLECTIONS: {
    USERS: 'app_users',
    ROOMS: 'game_rooms',
    ROOM_PLAYERS: 'room_players',
    SCORE_RECORDS: 'score_records',
    SETTLEMENTS: 'settlements',
    PLAYER_RESULTS: 'player_results'
  }
};
