/**
 * 作者: Codex
 * 日期: 2026-04-17
 * 描述: 完全离线语音播报工具。基于本地语音片段与整句短语播放，不依赖插件和后端语音服务。
 *      为提升“给分即播”体验，采用单实例播放器 + 优先级队列。
 */

let speakQueue = [];
let speaking = false;
let sharedAudio = null;
let activeFinish = null;
let endedHandler = null;
let errorHandler = null;

const CLIP_TIMEOUT_MS = 2600;
const CLIP_GAP_MS = 25;

/**
 * 当前仅保留普通话选项。
 * 说明: 用户要求“完全免费，多方言不需要”。
 */
const DIALECT_OPTIONS = [
  { key: 'mandarin', label: '普通话' }
];

/**
 * 本地语音片段映射。
 */
const CLIP_PATH_MAP = {
  received: '/assets/voice/received.mp3',
  points: '/assets/voice/points.mp3',
  action_foul: '/assets/voice/action_foul.mp3',
  action_normal: '/assets/voice/action_normal.mp3',
  action_small_gold: '/assets/voice/action_small_gold.mp3',
  action_big_gold: '/assets/voice/action_big_gold.mp3',
  switch_ok: '/assets/voice/switch_ok.mp3',
  digit_0: '/assets/voice/digit_0.mp3',
  digit_1: '/assets/voice/digit_1.mp3',
  digit_2: '/assets/voice/digit_2.mp3',
  digit_3: '/assets/voice/digit_3.mp3',
  digit_4: '/assets/voice/digit_4.mp3',
  digit_5: '/assets/voice/digit_5.mp3',
  digit_6: '/assets/voice/digit_6.mp3',
  digit_7: '/assets/voice/digit_7.mp3',
  digit_8: '/assets/voice/digit_8.mp3',
  digit_9: '/assets/voice/digit_9.mp3',
  unit_10: '/assets/voice/unit_10.mp3',
  unit_100: '/assets/voice/unit_100.mp3',
  unit_1000: '/assets/voice/unit_1000.mp3',
  unit_10000: '/assets/voice/unit_10000.mp3'
};

/**
 * 规范化方言编码（当前固定普通话，参数仅用于兼容）。
 *
 * @param {string} dialect 方言编码
 * @returns {string} 规范化方言编码
 */
function normalizeDialect(dialect) {
  if (dialect) {
    return 'mandarin';
  }
  return 'mandarin';
}

/**
 * 获取方言标签。
 *
 * @param {string} dialect 方言编码
 * @returns {string} 方言名称
 */
function getDialectLabel(dialect) {
  normalizeDialect(dialect);
  return '普通话';
}

/**
 * 获取单例音频播放器。
 *
 * @returns {object} InnerAudioContext 实例
 */
function getAudio() {
  if (!sharedAudio) {
    sharedAudio = wx.createInnerAudioContext();
    sharedAudio.obeyMuteSwitch = false;
    sharedAudio.autoplay = false;
    sharedAudio.volume = 1;
    sharedAudio.playbackRate = 1.05;
  }
  return sharedAudio;
}

/**
 * 休眠指定毫秒。
 *
 * @param {number} ms 毫秒
 * @returns {Promise<void>} 完成后 resolve
 */
function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * 停止当前片段播放（用于高优先级插队）。
 */
function stopCurrentClip() {
  if (activeFinish) {
    activeFinish();
  }
  try {
    getAudio().stop();
  } catch (e) {}
}

/**
 * 播放单个语音片段（单实例）。
 *
 * @param {string} clipPath 片段路径
 * @returns {Promise<void>} 播放结束
 */
function playClip(clipPath) {
  return new Promise(function(resolve) {
    if (!clipPath) {
      resolve();
      return;
    }

    const audio = getAudio();
    let done = false;
    let timer = null;

    const finish = function() {
      if (done) {
        return;
      }
      done = true;
      activeFinish = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve();
    };

    activeFinish = finish;

    if (endedHandler && typeof audio.offEnded === 'function') {
      try {
        audio.offEnded(endedHandler);
      } catch (e) {}
    }
    if (errorHandler && typeof audio.offError === 'function') {
      try {
        audio.offError(errorHandler);
      } catch (e) {}
    }

    endedHandler = function() {
      finish();
    };
    errorHandler = function() {
      finish();
    };

    audio.onEnded(endedHandler);
    audio.onError(errorHandler);

    timer = setTimeout(function() {
      finish();
    }, CLIP_TIMEOUT_MS);

    try {
      audio.stop();
    } catch (e) {}
    audio.src = clipPath;
    audio.play();
  });
}

/**
 * 将数字拆分成中文播报 token。
 * 支持 0 ~ 99999。
 *
 * @param {number} value 数值
 * @returns {string[]} token 列表
 */
function numberToTokens(value) {
  let num = Math.floor(Math.abs(Number(value) || 0));
  if (num === 0) {
    return ['digit_0'];
  }
  if (num < 10) {
    return ['digit_' + num];
  }
  if (num < 20) {
    if (num === 10) {
      return ['unit_10'];
    }
    return ['unit_10', 'digit_' + (num % 10)];
  }
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    const tokens = ['digit_' + tens, 'unit_10'];
    if (ones > 0) {
      tokens.push('digit_' + ones);
    }
    return tokens;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rest = num % 100;
    const tokens = ['digit_' + hundreds, 'unit_100'];
    if (rest > 0) {
      if (rest < 10) {
        tokens.push('digit_0');
      }
      tokens.push.apply(tokens, numberToTokens(rest));
    }
    return tokens;
  }
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    const tokens = ['digit_' + thousands, 'unit_1000'];
    if (rest > 0) {
      if (rest < 100) {
        tokens.push('digit_0');
      }
      tokens.push.apply(tokens, numberToTokens(rest));
    }
    return tokens;
  }
  const high = Math.floor(num / 10000);
  const rest = num % 10000;
  const tokens = numberToTokens(high);
  tokens.push('unit_10000');
  if (rest > 0) {
    if (rest < 1000) {
      tokens.push('digit_0');
    }
    tokens.push.apply(tokens, numberToTokens(rest));
  }
  return tokens;
}

/**
 * 根据播报文本优先尝试匹配整句语音（减少卡顿）。
 *
 * @param {string} text 播报文本
 * @returns {string} 语音片段路径
 */
function buildDirectClipPath(text) {
  const safeText = String(text || '').trim();
  if (!safeText) {
    return '';
  }
  if (safeText.indexOf('普胜') >= 0) {
    return CLIP_PATH_MAP.action_normal;
  }
  if (safeText.indexOf('大金') >= 0) {
    return CLIP_PATH_MAP.action_big_gold;
  }
  if (safeText.indexOf('小金') >= 0) {
    return CLIP_PATH_MAP.action_small_gold;
  }
  if (safeText.indexOf('犯规') >= 0) {
    return CLIP_PATH_MAP.action_foul;
  }
  if (safeText.indexOf('切换') >= 0 || safeText.indexOf('播报') >= 0) {
    return CLIP_PATH_MAP.switch_ok;
  }
  return '';
}

/**
 * 根据播报文本构建语音片段 token 队列（整句未命中时的兜底方案）。
 *
 * @param {string} text 播报文本
 * @returns {string[]} token 列表
 */
function buildTokenQueue(text) {
  const safeText = String(text || '').trim();
  if (!safeText) {
    return [];
  }
  const scoreMatched = safeText.match(/(\d+)\s*分/);
  if (scoreMatched) {
    const score = Number(scoreMatched[1] || 0);
    const scoreTokens = numberToTokens(score);
    return ['received'].concat(scoreTokens).concat(['points']);
  }
  return [];
}

/**
 * 播放 token 队列。
 *
 * @param {string[]} tokenQueue token 列表
 * @returns {Promise<void>} 播放结束
 */
function playTokenQueue(tokenQueue) {
  const tasks = [];
  for (let i = 0; i < tokenQueue.length; i += 1) {
    const clipPath = CLIP_PATH_MAP[tokenQueue[i]];
    if (clipPath) {
      tasks.push(clipPath);
    }
  }
  if (tasks.length === 0) {
    return Promise.resolve();
  }
  let chain = Promise.resolve();
  for (let i = 0; i < tasks.length; i += 1) {
    const clipPath = tasks[i];
    chain = chain.then(function() {
      return playClip(clipPath);
    }).then(function() {
      if (i < tasks.length - 1) {
        return wait(CLIP_GAP_MS);
      }
      return Promise.resolve();
    });
  }
  return chain;
}

/**
 * 播放一条文本。
 *
 * @param {string} text 文本
 * @returns {Promise<void>} 播放结束
 */
function playText(text) {
  const directClipPath = buildDirectClipPath(text);
  if (directClipPath) {
    return playClip(directClipPath);
  }
  const tokenQueue = buildTokenQueue(text);
  return playTokenQueue(tokenQueue);
}

/**
 * 归一化 speak 参数中的选项对象。
 *
 * @param {object|string} dialectOrOptions 第二参数（方言或选项）
 * @param {object} maybeOptions 第三参数（选项）
 * @returns {object} 选项
 */
function resolveSpeakOptions(dialectOrOptions, maybeOptions) {
  if (dialectOrOptions && typeof dialectOrOptions === 'object' && !Array.isArray(dialectOrOptions)) {
    return dialectOrOptions;
  }
  if (maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions)) {
    return maybeOptions;
  }
  return {};
}

/**
 * 将文本加入队列。
 *
 * @param {object} item 播报项
 * @param {string} priority 优先级
 */
function enqueue(item, priority) {
  if (priority === 'high') {
    speakQueue.unshift(item);
    return;
  }
  speakQueue.push(item);
}

/**
 * 消费队列，串行播报，避免声音重叠。
 */
function flushQueue() {
  if (speaking) {
    return;
  }
  if (speakQueue.length === 0) {
    return;
  }
  const item = speakQueue.shift();
  if (!item || !item.text) {
    flushQueue();
    return;
  }
  speaking = true;
  playText(item.text).then(function() {
    speaking = false;
    flushQueue();
  }).catch(function() {
    speaking = false;
    flushQueue();
  });
}

/**
 * 入队播报文本。
 *
 * @param {string} text 播报文本
 * @param {string|object} dialectOrOptions 方言编码或选项
 * @param {object} maybeOptions 可选项
 */
function speak(text, dialectOrOptions, maybeOptions) {
  if (!text) {
    return;
  }
  const options = resolveSpeakOptions(dialectOrOptions, maybeOptions);
  const dialect = normalizeDialect(
    typeof dialectOrOptions === 'string' ? dialectOrOptions : 'mandarin'
  );

  if (options.interrupt) {
    speakQueue = [];
    stopCurrentClip();
    speaking = false;
  }

  enqueue({
    text: String(text),
    dialect: dialect
  }, options.priority);

  flushQueue();
}

/**
 * 与页面层兼容: 不使用插件。
 */
/**
 * 给分时语音反馈（最高优先级，立即播放）
 * 封装常见给分场景：普通给分、九球动作分
 * 
 * @param {string} text 播报文本，如 "10分"、"普胜"、"大金"
 * @param {object} options 可选参数 { interrupt: true }
 */
function scoreFeedback(text, options) {
  if (!text) return;
  speak(String(text), { priority: 'high', interrupt: options && options.interrupt });
}

/**
 * 麻将计分播报
 * @param {number} delta 分值
 */
function playMahjongScore(delta) {
  if (!delta || delta <= 0) return;
  scoreFeedback(delta + '分', { interrupt: true });
}

/**
 * 九球动作播报
 * @param {string} actionName 动作名（普胜/大金/小黑/小黑金等）
 */
function playBilliardsAction(actionName) {
  if (!actionName) return;
  scoreFeedback(actionName, { interrupt: true });
}

/**
 * 与页面层兼容: 不使用插件。
 */
function canUseWechatSiPlugin() {
  return false;
}

/**
 * 返回当前播报引擎标识。
 */
function getDialectEngine() {
  return 'local';
}

module.exports = {
  speak: speak,
  DIALECT_OPTIONS: DIALECT_OPTIONS,
  getDialectLabel: getDialectLabel,
  canUseWechatSiPlugin: canUseWechatSiPlugin,
  getDialectEngine: getDialectEngine,
  // 新增便捷方法
  scoreFeedback: scoreFeedback,
  playMahjongScore: playMahjongScore,
  playBilliardsAction: playBilliardsAction
};
