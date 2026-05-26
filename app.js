/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 小程序入口 - 优化版
 * 改动：云开发惰性初始化、启动速度优化、本地缓存加速
 */
const cloudUtil = require('./utils/cloud');
const storage = require('./utils/storage');

App({
  globalData: {
    user: null,
    cloudInited: false
  },

  onLaunch: function() {
    // 1. 先恢复本地缓存用户（最快，不走网络）
    const cachedUser = storage.getUser();
    if (cachedUser) {
      this.globalData.user = cachedUser;
      console.log('[app] user restored from cache, id:', cachedUser.id);
    }

    // 2. 延迟初始化云开发（首屏渲染后再初始化，不阻塞）
    // 使用 setTimeout 0 让出主线程，保证首页先渲染
    setTimeout(() => {
      this.initCloud();
    }, 100);
  },

  /**
   * 初始化云开发（非阻塞方式）
   */
  initCloud: function() {
    if (this.globalData.cloudInited) return;
    try {
      cloudUtil.initCloud();
      this.globalData.cloudInited = true;
      console.log('[app] cloud initialized');
    } catch (e) {
      console.error('[app] cloud init failed:', e);
    }
  },

  /**
   * 确保云开发已就绪（异步）
   * 页面调用此方法等待云开发就绪
   */
  waitCloudReady: function() {
    if (this.globalData.cloudInited) return Promise.resolve();
    return new Promise(resolve => {
      const check = () => {
        if (this.globalData.cloudInited) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }
});
