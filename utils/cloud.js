/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 云开发同步工具。用于房间 watch 实时同步。
 */
const CONFIG = require('./config');

let roomWatcher = null;

function initCloud() {
  if (!wx.cloud) {
    return;
  }
  wx.cloud.init({
    env: CONFIG.CLOUD_ENV || 'default',
    traceUser: true
  });
}

function closeRoomWatcher() {
  if (roomWatcher) {
    roomWatcher.close();
    roomWatcher = null;
  }
}

function upsertRoomSnapshot(room) {
  if (!wx.cloud || !room || !room.roomCode) {
    return;
  }
  const db = wx.cloud.database();
  db.collection(CONFIG.CLOUD_ROOM_COLLECTION).doc(room.roomCode).set({
    data: {
      roomCode: room.roomCode,
      gameType: room.gameType,
      roomMode: room.roomMode || '',
      status: room.status,
      players: room.players || [],
      settledAt: room.settledAt || null,
      updatedAt: Date.now()
    }
  }).catch(function() {
    // 云同步失败不阻塞主流程。
  });
}

function watchRoom(roomCode, onChanged) {
  if (!wx.cloud || !roomCode) {
    return;
  }
  closeRoomWatcher();
  const db = wx.cloud.database();
  roomWatcher = db.collection(CONFIG.CLOUD_ROOM_COLLECTION).doc(roomCode).watch({
    onChange: function(snapshot) {
      if (snapshot.docs && snapshot.docs.length > 0) {
        if (onChanged) {
          onChanged(snapshot.docs[0]);
        }
      }
    },
    onError: function() {
      // 页面层按需提示。
    }
  });
}

module.exports = {
  initCloud: initCloud,
  watchRoom: watchRoom,
  closeRoomWatcher: closeRoomWatcher,
  upsertRoomSnapshot: upsertRoomSnapshot
};
