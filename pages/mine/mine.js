const api = require('../../utils/cloud-api');
const storage = require('../../utils/storage');

/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: “我的”页面，保留战绩相关、登录与修改名称、字体大小设置等功能。
 */
Page({
  data: {
    user: null,
    customNickname: '',
    fontSizeMode: 'normal',
    fontSizeLabel: '标准',
    menuItems: [
      { key: 'myRecord', icon: '📈', text: '我的战绩' },
      { key: 'rank', icon: '📊', text: '战绩榜' },
      { key: 'share', icon: '📤', text: '转发分享' },
      { key: 'copyId', icon: '📋', text: '复制ID' },
      { key: 'logout', icon: '🚪', text: '注销' }
    ]
  },

  /**
   * 页面转发配置。
   *
   * @returns {object} 分享参数
   */
  onShareAppMessage: function() {
    const user = this.data.user;
    const nickname = user && user.nickname ? user.nickname : '好友';
    return {
      title: nickname + '邀请你一起用计分神器',
      path: '/pages/index/index'
    };
  },

  onShow: function() {
    this.setData({
      user: storage.getUser()
    });
    this.loadFontSetting();
  },

  /**
   * 加载字体大小配置。
   */
  loadFontSetting: function() {
    const mode = wx.getStorageSync('scoreboard_font_size_mode') || 'normal';
    const map = {
      small: '小号',
      normal: '标准',
      large: '大号'
    };
    this.setData({
      fontSizeMode: map[mode] ? mode : 'normal',
      fontSizeLabel: map[mode] || '标准'
    });
  },

  /**
   * 登录成功后的统一处理。
   * 若存在待加入房间，则自动切回首页继续进房。
   *
   * @param {object} user 登录后的用户信息
   */
  onLoginSuccess: function(user) {
    storage.setUser(user);
    this.setData({ user: user });
    const pending = storage.getPendingJoinInfo();
    if (pending && pending.roomCode) {
      wx.showToast({ title: '登录成功，正在进入房间', icon: 'none' });
      setTimeout(function() {
        wx.switchTab({ url: '/pages/index/index' });
      }, 300);
      return;
    }
    wx.showToast({ title: '登录成功', icon: 'success' });
  },

  loginWechat: function() {
    wx.getUserProfile({
      desc: '用于展示用户资料',
      success: (res) => {
        // 云函数通过 getWXContext() 自动获取 openId，无需 wx.login()
        api.wechatLogin('', res.userInfo.nickName, res.userInfo.avatarUrl)
          .then((user) => { this.onLoginSuccess(user); })
          .catch(() => {});
      }
    });
  },

  onCustomInput: function(e) {
    this.setData({ customNickname: e.detail.value || '' });
  },

  loginCustom: function() {
    const nickname = (this.data.customNickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    api.customLogin(nickname).then((user) => {
      this.onLoginSuccess(user);
    }).catch(() => {});
  },

  /**
   * 修改用户昵称。
   */
  editProfile: function() {
    const user = this.data.user;
    if (!user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改名称',
      editable: true,
      placeholderText: '请输入新的名称',
      content: user.nickname || '',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const nickname = (res.content || '').trim();
        if (!nickname) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
          return;
        }
        api.updateProfile(user.id, nickname, user.avatarUrl || '')
          .then((newUser) => {
          storage.setUser(newUser);
          this.setData({ user: newUser });
          wx.showToast({ title: '名称已更新', icon: 'success' });
        }).catch(() => {});
      }
    });
  },

  /**
   * 修改用户头像。
   *
   * @param {object} e 头像选择事件
   */
  onChooseAvatar: function(e) {
    const user = this.data.user;
    if (!user) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    const avatarUrl = e && e.detail ? (e.detail.avatarUrl || '') : '';
    if (!avatarUrl) {
      wx.showToast({ title: '未获取到头像', icon: 'none' });
      return;
    }
    api.updateProfile(user.id, user.nickname || String(user.id), avatarUrl)
      .then((newUser) => {
      storage.setUser(newUser);
      this.setData({ user: newUser });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    }).catch(() => {});
  },

  tapMenu: function(e) {
    const key = e.currentTarget.dataset.key;
    const user = this.data.user;
    if (key === 'myRecord') {
      wx.switchTab({ url: '/pages/records/records' });
      return;
    }
    if (key === 'rank') {
      wx.navigateTo({ url: '/pages/leaderboard/leaderboard' });
      return;
    }
    if (key === 'copyId') {
      if (!user) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
      wx.setClipboardData({ data: String(user.id) });
      return;
    }
    if (key === 'logout') {
      wx.showModal({
        title: '确认注销',
        content: '注销后你本地所有记录入口会消失，其他人包含你的历史记录不会消失。再次微信登录会生成新ID，确定继续？',
        confirmColor: '#d45b5b',
        success: (res) => {
          if (!res.confirm) {
            return;
          }
          const userInfo = this.data.user;
          const userId = userInfo ? userInfo.id : null;
          storage.clearUser();
          storage.clearUserRelatedData(userId);
          storage.clearWechatOpenId();
          this.setData({ user: null });
          wx.showToast({ title: '已注销', icon: 'success' });
        }
      });
      return;
    }
  },

  /**
   * 字体大小设置入口。
   */
  openFontSetting: function() {
    wx.showActionSheet({
      itemList: ['小号', '标准', '大号'],
      success: (res) => {
        const modeMap = ['small', 'normal', 'large'];
        const labelMap = ['小号', '标准', '大号'];
        const index = res.tapIndex;
        const mode = modeMap[index] || 'normal';
        const label = labelMap[index] || '标准';
        wx.setStorageSync('scoreboard_font_size_mode', mode);
        this.setData({
          fontSizeMode: mode,
          fontSizeLabel: label
        });
        wx.showToast({ title: '字体已切换为' + label, icon: 'none' });
      }
    });
  }
});
