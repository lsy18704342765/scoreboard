# 🏆 计分神器 - 微信小程序项目部署与配置指南

本指南将手把手带您完成 **计分神器**（基于微信原生小程序与微信云开发构建的台球/麻将多玩家计分系统）的完整部署流程。请严格按照以下步骤操作，确保系统各项功能（尤其是核心的云端计分同步与离线语音播报）正常运行。

---

## 📅 版本与环境要求

*   **微信开发者工具**：最新稳定版（Stable）
*   **小程序基础库版本**：推荐 `3.15.2` 或以上
*   **云开发环境**：已开通微信云开发（Cloud Development）服务的腾讯云或微信小程序云开发环境
*   **前端框架**：原生小程序框架（无 npm 构建依赖，开箱即用）
*   **后端服务**：全栈无服务器架构（WeChat Cloud Functions & Cloud Database）

---

## 🛠️ 第一阶段：准备工作

### 1. 获取小程序 AppID
1. 登录 [微信公众平台](https://mp.weixin.qq.com/)。
2. 进入 **开发** -> **开发管理** -> **开发设置**。
3. 复制您的 **AppID(小程序ID)**（注意：不要使用“测试号AppID”，云开发必须使用正式注册的个人或企业小程序账号）。

### 2. 开通云开发
1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 登录开发者工具，点击右上角的 **云开发** 按钮。
3. 按照提示开通云开发服务，创建一个新的云开发环境。
4. **获取环境 ID**：进入云开发控制台 -> 设置 -> 环境设置，复制形如 `scoreboard-env-xxxxxx` 的 **环境 ID**。

---

## 💻 第二阶段：项目导入与本地配置

### 1. 导入项目
1. 打开微信开发者工具，选择 **导入项目**。
2. **目录**：选择本项目根目录 `frontend-wxapp`。
3. **AppID**：填入您在第一阶段获取的真实 **AppID**。
4. **后端服务**：选择 **微信云开发**。
5. 点击导入。

### 2. 配置环境 ID 
为使小程序前端和云端同步指向您的云开发环境，需要修改以下两个配置文件：

#### ① 修改 `utils/cloud-config.js`
打开 `utils/cloud-config.js`，将第 `7` 行的 `CLOUD_ENV` 替换为您的云开发环境 ID：
```javascript
// utils/cloud-config.js
module.exports = {
  // TODO: 替换为实际的云开发环境ID
  CLOUD_ENV: '你的微信云开发环境ID', // 例如: 'scoreboard-env-123456'
  
  // 数据库集合名称
  COLLECTIONS: {
    USERS: 'app_users',
    ROOMS: 'game_rooms',
    ROOM_PLAYERS: 'room_players',
    SCORE_RECORDS: 'score_records',
    SETTLEMENTS: 'settlements',
    PLAYER_RESULTS: 'player_results'
  }
};
```

#### ② 修改 `utils/config.js`
打开 `utils/config.js`，同步修改第 `9` 行的 `CLOUD_ENV` 为您的云开发环境 ID：
```javascript
// utils/config.js
const CONFIG = {
  BASE_URL: '',
  CLOUD_ENV: '你的微信云开发环境ID', // 同步修改此处
  CLOUD_ROOM_COLLECTION: 'scoreboard_room_sync' // 实时对局同步表
};

module.exports = CONFIG;
```

---

## 🗄️ 第三阶段：云数据库初始化配置

计分神器依赖云数据库存储对局、战绩和用户信息。您需要在云开发控制台中手动创建数据库集合，并配置索引和权限。

> [!IMPORTANT]
> 必须严格在 **云开发控制台 -> 数据库** 中创建以下 **6 个集合**。

| 集合名称（Collection Name） | 作用描述 | 推荐安全权限设置 |
| :--- | :--- | :--- |
| **`app_users`** | 存储用户的微信基础资料及自定义属性 | **所有用户可读，仅创建者及管理员可写** |
| **`game_rooms`** | 记录房间的状态（等待中、进行中、已结算） | **所有用户可读，仅创建者及管理员可写** |
| **`score_records`** | 记录每一笔计分或扣分操作明细 | **所有用户可读，仅创建者及管理员可写** |
| **`settlements`** | 记录房间对局结算时的最终积分结果 | **所有用户可读，仅创建者及管理员可写** |
| **`player_results`** | 归档每个玩家在每场对局中的胜负结果（排行榜） | **所有用户可读，仅创建者及管理员可写** |
| **`scoreboard_room_sync`** | **[极其关键]** 用于房间数据实时联机同步 | **所有用户可读，所有用户可写** ⚠️ |

> [!WARNING]
> ⚠️ **关于 `scoreboard_room_sync` 的特殊配置说明**：
> 该集合由于在前端代码中直接执行了 `.set()` 写操作和 `.watch()` 监听操作（位于 `utils/cloud.js`），因此**必须**将安全规则权限修改为 **「所有用户可读，所有用户可写」**，否则其他联机玩家将无法实时加入房间或同步对局数据。

### 配置数据库索引（提升性能与保证唯一性）
为防止并发冲突并提高查询效率，请进入云开发控制台中的每个集合，点击 **索引管理 -> 添加索引**，按照以下结构配置索引：

1. **`app_users`**
   - 索引名称：`idx_openid` | 字段：`wechatOpenId` (升序, **唯一索引**)
   - 索引名称：`idx_id` | 字段：`_id` (升序)

2. **`game_rooms`**
   - 索引名称：`idx_roomcode` | 字段：`roomCode` (升序, **唯一索引**)
   - 索引名称：`idx_owner` | 字段：`ownerUserId` (升序)
   - 索引名称：`idx_status` | 字段：`status` (升序)
   - 索引名称：`idx_created` | 字段：`createdAt` (降序)

3. **`score_records`**
   - 索引名称：`idx_roomid` | 字段：`roomId` (升序)
   - 索引名称：`idx_operator` | 字段：`operatorUserId` (升序)
   - 索引名称：`idx_target` | 字段：`targetUserId` (升序)
   - 索引名称：`idx_created` | 字段：`createdAt` (降序)

4. **`settlements`**
   - 索引名称：`idx_roomid` | 字段：`roomId` (升序, **唯一索引**)
   - 索引名称：`idx_settler` | 字段：`settledByUserId` (升序)

5. **`player_results`**
   - 索引名称：`idx_userid` | 字段：`userId` (升序)
   - 索引名称：`idx_roomid` | 字段：`roomId` (升序)
   - 索引名称：`idx_gametype` | 字段：`gameType` (升序)

---

## ⚡ 第四阶段：部署云函数

项目包含 **4 个核心业务云函数**，用于处理免运维的后端接口与原子化的高并发数据库写入。

### 部署步骤：
1. 在微信开发者工具的左侧目录树中，找到 **`cloudfunctions`** 文件夹。
2. 会看到以下 4 个云函数子目录：
   *   `user-login` (微信一键登录与个人资料更新)
   *   `room-crud` (房间的创建、加入、解散与状态流转)
   *   `room-score` (核心计分、扣分、撤销及原子性给分逻辑)
   *   `stats-query` (个人战绩查询与全局实力排行榜统计)
3. 依次对这 4 个文件夹执行以下操作：
   *   **右键点击** 云函数文件夹（例如 `user-login`）。
   *   选择 **“上传并部署：云端安装依赖（不上传 node_modules）”**。
4. 部署成功后，控制台日志会提示部署完成，且文件夹图标旁会出现小绿云的标识。

---

## 🎙️ 第五阶段：静态资源与语音包确认

计分神器具备**完全本地离线的拼音流式语音播报功能**，不依赖任何云端 TTS 或外部插件。
为确保播报无误，请在导入后确认以下目录结构及资源是否存在：

*   **资源目录**：`frontend-wxapp/assets/voice/`
*   **核心音频文件**：
    *   `received.mp3`（“收到”）
    *   `points.mp3`（“分”）
    *   `digit_0.mp3` 到 `digit_9.mp3`（“零” 到 “九”）
    *   `unit_10.mp3`, `unit_100.mp3`, `unit_1000.mp3`, `unit_10000.mp3`（“十”、“百”、“千”、“万”）
    *   `action_normal.mp3`, `action_small_gold.mp3`, `action_big_gold.mp3`, `action_foul.mp3`（“普胜”、“小金”、“大金”、“犯规”等游戏动作术语）

> [!TIP]
> 微信开发者工具模拟器中有时会因系统差异或音频格式导致播放不连贯，此为正常现象。在手机真机上运行时，底层采用 `InnerAudioContext` 队列会实现 0ms 延迟的流畅连贯播报。

---

## 🔍 第六阶段：运行与调试验证

1. **清除缓存**：在微信开发者工具上方菜单选择 **缓存** -> **清除全部缓存**，确保全新的环境配置生效。
2. **本地编译**：点击 **编译** 按钮。
3. **功能验证**：
   *   **登录注册**：点击首页或「我的」页面，触发微信授权登录，验证 `app_users` 集合中是否成功生成用户数据。
   *   **创建房间**：进入创建房间页，选择玩法（如：中式八球），点击“创建房间”，验证是否成功跳转至计分板页面，并且 `game_rooms` 与 `scoreboard_room_sync` 表中生成了相应房间数据。
   *   **计分与语音**：在房间计分板中点击玩家卡片加分，验证声音是否播放，以及计分明细是否记录到 `score_records` 表。
   *   **联机同步**：使用微信开发者工具的 **真机调试** 功能，手机扫描二维码进入小程序，或拉入好友，验证双方数据能否通过 `scoreboard_room_sync` 实时更新。

---

## 🚀 第七阶段：审核与发布上线

当一切验证通过后，您可以准备发布上线：

1. **上传代码**：
   *   在微信开发者工具右上角，点击 **上传** 按钮。
   *   填写版本号（例如 `1.0.0`）及备注（如 `首个稳定版发布`）。
2. **提交审核**：
   *   登录 [微信公众平台](https://mp.weixin.qq.com/)。
   *   进入 **管理** -> **版本管理**。
   *   在 **开发版本** 中找到您刚刚上传的版本，点击 **提交审核**。
   *   按照要求填写小程序类目（推荐选择：*体育 - 体育科普*、*工具 - 记账/效率* 等无敏感类目的选项，以便快速通过审核）。
3. **全量发布**：
   *   审核通过后，在版本管理中点击 **发布**，即刻全网发布上线！

---

## 💡 常见问题与排查 (Troubleshooting)

### Q1: 报错 `Error: errCode: -501007 invalid environment | errMsg: database.collection:fail env not exists`
*   **原因**：未正确配置云开发环境 ID。
*   **解决方案**：请仔细检查 `utils/cloud-config.js` 和 `utils/config.js` 中的 `CLOUD_ENV`，确保与云开发控制台的环境 ID 完全一致。修改后请点击“重新编译”并“清除全部缓存”。

### Q2: 玩家计分时无声音播报，或提示 `audio.play fail`
*   **原因**：本地语音包缺失或微信底层音频上下文未初始化成功。
*   **解决方案**：
    1. 确保 `assets/voice/` 路径下有完整的 MP3 切片。
    2. 检查 `app.json` 中是否申请了可能需要的系统权限，或者用户手机是否处于静音/媒体音量过低状态。
    3. 检查微信基础库版本是否大于等于 `3.15.2`。

### Q3: 联机加入房间时，其他玩家看到的比分不同步，或报错权限不足 `fail database.collection.permissionDenied`
*   **原因**：`scoreboard_room_sync` 集合的安全规则未设置为「所有用户可读，所有用户可写」。
*   **解决方案**：进入云开发控制台 -> 数据库 -> 选择 `scoreboard_room_sync` -> 点击 **安全规则** 标签页，将规则修改为：
    ```json
    {
      "read": true,
      "write": true
    }
    ```
    并点击保存。

---

祝您部署顺利！如果有任何技术细节需要进一步调整，欢迎随时联系维护者或提交反馈。🏆
