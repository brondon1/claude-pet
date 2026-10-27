# claude-pet 🧡

<p align="center">
  <b>简体中文</b> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Claude%20Code-D97757">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Electron-47848F">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-339933">
  <img alt="os" src="https://img.shields.io/badge/tested-Windows%2011-0078D4">
  <img alt="assets" src="https://img.shields.io/badge/assets-%E9%80%8F%E6%98%8E%E5%8A%A8%E4%BD%9C%E8%A7%86%E9%A2%91-ff69b4">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-orange">
</p>

一只住在桌面上的 **Claude Code 桌宠**——橙发少女「小橙」，Claude 的小分身。待机呼吸、随机眨眼、到处溜达、蹦跳挥手、吃饼干、喝咖啡、吹泡泡、煮火锅……二十多段透明动作视频随时无缝衔接；点击会 Q 弹回应，拖起来甩出去走抛物线、碰边反弹、落地屈膝缓冲，**多块屏幕之间能直接飞过去、掉下去**。

她会**跟着 Claude Code 一起干活**：你发出提问她就托腮思考（发间的向日葵转起来），Claude 调工具她就敲电脑、气泡里写着正在跑什么命令 / 改哪个文件，需要你批准时举手冒问号并弹系统通知，一轮结束时撒彩带庆祝。闲下来会碎碎念，右键还能和她聊两句。

本项目仿照 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（DeepSeek Harness 的桌宠）而作，同样是**完整的三件套**：

```
① 提示词（配方）          →  ② 素材链（引擎）               →  ③ 桌宠（成品）
AI 生成动作视频的配方         立绘抠图 + 绿幕视频 → 透明动画       跟随 Claude Code 的 Electron 桌宠
docs/动作视频提示词.md        scripts/make_sprite.py / make_video.py   src/
```

换角色、换动作、换风格，全流程可复现。

---

## 快速开始

### 方式一：下载安装包（Windows，推荐）

到 [Releases](https://github.com/brondon1/claude-pet/releases/latest) 下载 `claude-pet-Setup-<版本>.exe`，双击安装（装在当前用户目录，不需要管理员权限），桌面会出现「小橙」快捷方式。不需要 Node.js，也不用单独下载 Electron。

> 安装包没有代码签名，首次运行时 Windows SmartScreen 可能提示「已保护你的电脑」，点「更多信息 → 仍要运行」即可。

装好后照下面的「连上 Claude Code」装 hooks（右键宠物即可，不需要命令行）。

### 方式二：从源码运行

> 前提：已安装 **Node.js ≥ 20** 与 **Claude Code**（`claude --version` 可用）。

```sh
# ① 进入项目目录，安装依赖（--omit=optional：不重复下载 Electron，见下方说明）
cd claude-pet
npm install --omit=optional

# ② 启动（前台运行；加 --detach 则后台运行、关掉终端也不退出）
npm start
node scripts/start.mjs --detach
```

**Electron 从哪来**：启动脚本依次查找环境变量 `CLAUDE_PET_ELECTRON` → `node_modules/electron`（`npm install` 不加 `--omit=optional` 时安装）→ dsh-pet 下载过的 `~/.dsh/electron`。装过 dsh-pet 就不用再下一份。

### 连上 Claude Code

右键宠物 →「连接 Claude Code（安装 hooks）…」，或：

```sh
npm run hooks:install      # 卸载：npm run hooks:uninstall
```

会往 `~/.claude/settings.json` 写入桌宠自己的几条 hook：原文件先备份为 `settings.json.claude-pet.bak`，只增删带 `claude-pet-hook` 标记的条目，你自己的 hooks 原样保留。**新开的 Claude Code 会话生效。**

hook 脚本（`hooks/claude-pet-hook.mjs`）静默运行、1.5 秒超时、无论成败都退出 0——**宠物没开着也绝不会拖慢或干扰 Claude Code**。

### 安装后你会看到什么

1. **小橙落在屏幕右下角**，挥手打招呼：「小橙来啦~」。
2. 没装 hooks 时，几秒后她会提醒你「右键我 →『连接 Claude Code』就能陪你干活啦」。
3. **托盘区出现她的头像**：点一下把她叫出来，右键是和宠物右键同样的菜单。
4. **开始菜单出现「小橙」**（Windows）：可以从这里启动；系统通知顶栏也靠它显示「小橙」和头像，而不是「Electron」。
5. 在任意目录开一个新的 Claude Code 会话，问它点什么——她就开始跟着思考、干活了。

## 桌宠功能

- **纯粹的桌宠**：不监控、不上传，不碰 Claude Code 内核；只通过官方 hooks 读会话事件
- **动画链**：每个动作播完按权重挑下一个（默认 待机 10 / 散步 5 / 转身 3 / 小动作 6，可配），不连播同一个小动作
- **动作视频**：二十多段 AI 生成的透明动作视频（手部与全身动作），与静态立绘同尺寸、脚底同一条线，切换无缝；视频没加载出来前不撤立绘，不闪白
- **自然的小细节**：每隔 2~6 秒随机眨眼、偶尔连眨两下；气泡出字时按字数对口型；双腿分层，走路交替抬脚、起跳收腿、被拎起时自然下垂
- **全程不左右晃**：所有动作只做上下起伏和伸缩，看着稳当不晕
- **屏幕漫游**：朝面向方向溜达，到工作区边缘转身
- **点击 / 拖拽 / 甩抛**：点击 Q 弹、随机做个小反应（开心 / 害羞 / 晕乎乎），并通过 Claude Code 回你一句；拖拽过阻尼弹簧跟手；甩出走抛物线、碰边反弹、落地摩擦停稳并挤压一下，摔太狠会晕
- **多屏穿越**：甩抛时，紧挨另一块屏的那一侧（上 / 下 / 左 / 右）不反弹，直接飞过去、掉下去，最终落在最下面那块屏的地面
- **多开与碰撞**：可以同时养好几只（设置里「+ 添加宠物」），每只有自己的名字、大小、位置、人设、对话记忆；甩出去的宠物会和别的宠物弹性碰撞，被撞到的也会被撞飞（`physics.petCollision` 可关）
- **设置窗口**：右键 / 托盘「设置…」，图形化改宠物列表、开关、碎碎念间隔、物理参数，保存即生效
- **跟随 Claude Code 工作状态**：思考 / 敲代码 / 等你批准 / 整理记忆 / 庆祝 / 出错 六档动画 + 常驻气泡（见下节）
- **系统通知**：需要你批准、等你回复、长任务完成时弹 Windows 通知（顶栏显示「小橙」和头像）
- **碎碎念与对话**：随机时间、做小动作或 Claude Code 事件后，调用 Claude Code 冒一句碎碎念；右键「和我聊天…」与她对话，记忆持久化
- **右键菜单 / 托盘**：「动作 → 分类 → 具体动作」任意点播；开关工作状态跟随 / 漫游 / 通知；安装或卸载 hooks；打开 / 重载配置；清空对话记忆；退出时她会挥手说「拜拜，下次见~」
- **无障碍**：支持 `prefers-reduced-motion`（减少动效时去掉大幅位移与挤压）

## ⚙️ 工作状态联动（Claude Code hooks）

| hook 事件 | 小橙的反应 |
|---|---|
| `SessionStart` | 挥手：「新会话开始啦，冲！」 |
| `UserPromptSubmit` | 托腮思考，发间向日葵转起来：「让我想想…」 |
| `PreToolUse` | 敲电脑，气泡里用她自己的话说在帮你干什么，比如「我在帮你翻 README 找位置呢～」（不念命令和工具名，见下） |
| `PostToolUse` | 琢磨一下结果… |
| `Notification` | 举手冒问号：「需要你批准一下！」/「等你回复~」，并弹系统通知 |
| `PreCompact` | 整理记忆 |
| `Stop` | 撒彩带庆祝「搞定啦！」；一轮超过 `notifyMinBusySec`（默认 20 秒）时弹「Claude 完成了（用时 N 秒）」通知 |
| `PostToolUseFailure` / `StopFailure` | 叉叉眼冒汗「出了点岔子，再试试」 |
| `SessionEnd` | 「下次见~」 |

- **气泡显示当前项目，用她的口吻说进展**：第一行是会话所在的项目文件夹（📂 claude-pet）；第二行是她自己说的一句话——把 Claude 此刻在做的事（它最新说的话、正在用的工具）交给 Claude Code 改写成第一人称的口语，比如「我要重启一下，马上就能开口说话啦～」，不出现命令、代码和英文路径。为省额度两次改写至少隔 `statusVoice.minIntervalSec`（默认 20 秒），没改写好时显示兜底的口语文案（「在终端里敲敲打打…」「翻翻 README.md 看看～」）；`statusVoice.enabled=false` 则只用兜底文案
- **多会话并行**：每个会话独立记状态，显示最需要你注意的那个（等批准 > 整理 > 干活 / 思考）；10 分钟没动静的会话自动清掉
- **文案可改**：`statusTexts` 逐项覆盖（键见 `src/shared/status.js` 的 `DEFAULT_TEXTS`）
- **不会对自己起反应**：宠物自己调用 `claude` 聊天时带 `CLAUDE_PET_INTERNAL=1`，hook 直接忽略

## ⚙️ 碎碎念与对话

- **碎碎念**：每一句都调用本机 Claude Code（`claude -p`）现场随机生成，**没有固定台词**：随机抽话题、结合当前时间、避开最近说过的话；调用失败（没登录、超时）时这一句就不说
- **什么时候说**（没有手动入口，都是自己冒出来的）：
  - **随机时间**：每次说完后在 `minSec`~`maxSec`（默认 3~10 分钟）之间随机等一段
  - **做小动作时**：吃饼干、看书、吹泡泡……按 `actionChance`（默认 30%）顺口说一句和这个动作有关的话
  - **Claude Code 事件后**：新会话、任务完成、出错，按 `eventChance`（默认 50%）过几秒评论一句
  - **被点击**：每次点她都会回一句，**点哪里说哪里**——向日葵、蝴蝶结、头、脸蛋、长发、手、领结、腰、裙摆、腿、小皮鞋各有各的情境和小反应（部位划分见 `src/shared/bodyparts.js`）；连续点击时会知道自己被碰了几下
  - **点播动作**：右键「动作」或 `POST /play` 让她做某个动作时，必定说一句和这个动作有关的话
  - **定时**：到了 `schedule` 里的时刻做指定动作，并由 Claude Code 围绕情境现场生成一句（默认工作日 9:30 上班喝咖啡、12:00 午饭和 19:00 晚饭煮火锅、工作日 20:20 下班跳舞）
  - 两句之间至少隔 `cooldownSec`（默认 60 秒）；聊天中、跟随工作状态中、被拎着时不说（点击不受这个间隔限制）
- **对话**：右键「和我聊天…」弹出输入框，回车发送、Esc 关闭；回复走说话动画 + 气泡。最近 `brain.memoryRounds` 轮（默认 6）随请求带上，全部历史保存在 `~/.claude-pet/memory.json`
- **用谁的脑子**（`brain.provider`，默认 `auto`）：
  - 有 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` → 走 Anthropic API（模型 `brain.apiModel`，按量计费）
  - 否则 → 调用本机 `claude -p`，**用你自己的 Claude Code 登录**，与订阅共用额度，无需 key
- **两种安装方式都能调**：原生安装的 `claude.exe` 与 npm 全局安装的 `claude.cmd` 都会自动识别；不在 `PATH` 里时还会找 `~/.local/bin`、`%APPDATA%\npm` 等常见目录。也可以用环境变量 `CLAUDE_PET_CLAUDE` 直接指定 CLI 路径
- **登录提示**：本机 Claude Code 没登录或登录过期时，她会在气泡里提示你运行 `claude auth login`。注意 Claude 桌面应用的登录与命令行是两套，命令行需要在独立终端里单独登录一次
- **额度用完**：Claude Code 报「You've hit your session limit · resets 9:10pm」这类错误时，所有宠物一起暂停调用，到恢复时刻前碎碎念静默跳过、聊天直接提示「额度用完啦，21:10 恢复~」，不会反复白跑 `claude`。刚用完时所有宠物一起打瞌睡并说一句什么时候恢复，到点伸个懒腰报告满血复活（动作和台词见 `limit` 配置；这时调不了 Claude Code，所以这两句用现成台词随机挑）
- **记忆链：越用越懂你**：她会记下你在哪个项目、什么时候用 Claude Code、让它做了什么（提问只记前 80 字），以及和她聊了什么、爱点哪里、常让她做什么动作；攒够了就调用 Claude Code 把这些整理成「她对你的了解」（偏好 / 习惯 / 项目 / 事实 / 相处，最多 30 条），保留仍然成立的、修正过时的、加上新发现。每次整理是记忆链上的一环（学到了什么、忘掉了什么、她的一句感想），学到新东西时她会用自己的话告诉你。这些记忆会带进聊天和碎碎念，所以越用越懂你。右键「记忆链」可以查看她记得的你、立刻整理、关掉或让她忘掉一切；数据只存在本机 `~/.claude-pet/memory-chain.json`，所有宠物共用
- **人设**：`brain.persona` 是默认人设，每只宠物可单独设 `persona` 覆盖；实际系统提示会自动追加名字与当前时间

## 🔌 对外接口

桌宠在 `127.0.0.1:7341`（`port` 可改）开了一个本机 HTTP 服务，无鉴权、只监听本机。Claude Code hooks 走这里，别的脚本 / 工具也可以用它驱动小橙：

| 接口 | 作用 |
|---|---|
| `GET /health` | 存活检查 |
| `GET /state` | 当前动作、朝向、窗口位置、气泡、工作状态、hooks 是否已装、对话通道 |
| `POST /hook` | Claude Code hook 负载（`hooks/claude-pet-hook.mjs` 转发） |
| `POST /say {text, ttl?}` | 让她说一句（`ttl` 毫秒，0 = 常驻） |
| `POST /play {action}` | 点播动作（内置动作名见 `src/shared/behavior.js`，视频动作用文件名） |
| `POST /chat {text}` | 和她对话，返回 `{reply}` |
| `POST /settings` | 打开设置窗口 |
| 任意接口加 `?pet=<id>`（或 body 里带 `pet`） | 指定哪只宠物，默认第一只 |
| `POST /throw {vx, vy}` | 把她按给定初速度（px/s）甩出去 |
| `POST /rename {name}` | 给她改名（与右键「给我改名字…」相同） |

```sh
curl -s -X POST 127.0.0.1:7341/say  -H "content-type: application/json" -d '{"text":"构建通过啦！"}'
curl -s -X POST 127.0.0.1:7341/play -H "content-type: application/json" -d '{"action":"吃冰淇淋"}'
```

## ⚙️ 配置

默认值见 [`config.jsonc`](config.jsonc)（逐项带注释）。**不要改这个文件**——在 `~/.claude-pet/config.jsonc` 里只写想改的字段即可（对象逐键合并，数组 / 标量整段替换），改完右键「重载配置」即时生效（`port` 需重启）。

| 字段 | 说明 |
|---|---|
| `pets` | 宠物列表，每只 `{id, name, size, position, offsetX, offsetY, workStatusEnabled, whisperEnabled, fixed, persona}`；第一只默认叫「小橙」，通知顶栏显示它的名字。旧版顶层 `name` / `size` 会自动迁移到第一只 |
| `autoStart` | 每次打开 Claude 桌面端或 Claude Code CLI（原生 `claude.exe`、npm 装的都算）时，桌宠没在运行就自动唤醒——之前手动退出了也会；默认开，右键「打开 Claude 时自动启动」可直接开关。由开机自启的守望进程实现，Windows 上订阅进程启动事件（一闪而过的 `claude --version` 这类不算） |
| `pets[].size` / `position` / `offsetX` / `offsetY` | 形象高度（默认 200，与 dsh-pet 女仆等高）、初始角落与偏移 |
| `animationWeights` / `roam` / `walkSpeed` | 动画链权重、是否溜达、散步速度 |
| `idleAnimation` | 待机随机小动作：`{enabled, minSec, maxSec}`，每段小动作播完后隔 `minSec`~`maxSec` 秒（默认 15~45）再随机来一段；开着时小动作频率只由它决定，设置窗口里可改 |
| `physics` | 重力、反弹系数、地面摩擦、甩出力度、宠物间碰撞 `petCollision` |
| `workStatusEnabled` / `notificationsEnabled` / `notifyMinBusySec` / `statusTexts` | 工作状态跟随与通知 |
| `whisper` / `brain` | 碎碎念与对话 |
| `schedule` | 定时动作（时刻、动作、情境、星期几） |
| `statusVoice` | 工作状态气泡的口吻：`enabled`、`minIntervalSec`（两次改写的最短间隔，默认 20 秒） |
| `memory` | 记忆链：`enabled`、`observePrompts`（是否记你对 Claude 说的话）、`consolidateEvery`（攒够多少分整理一次，观察 1 分、聊天 3 分，默认 12）、`minIntervalMin`、`maxItems` 等 |
| `limit` | 额度用完 / 恢复时做的动作和说的话（`{name}`、`{reset}` 占位） |

## 兼容性

- **操作系统**：在 **Windows 11** 上开发并实测；Electron 与核心逻辑跨平台，macOS / Linux 理论可用但未测试（开始菜单快捷方式、通知顶栏身份为 Windows 专属，其他平台自动跳过）
- **Claude Code**：在 `2.1.x` 上测试；用到的 hook 事件均为官方事件；原生安装（`claude.exe`）与 npm 全局安装（`claude.cmd`）都能调用
- **多显示器**：支持上下 / 左右相邻的多屏，甩抛可跨屏；不同 DPI 的屏幕坐标由 Electron 统一换算
- **与 dsh-pet 共存**：可以同时运行，两只宠物互不干扰；可共用 dsh-pet 下载的 Electron

## 效果预览

全部动作视频（GIF 预览位于 `assets/preview/`，由 `python scripts/make_previews.py` 生成；实际播放的是 `assets/webm/` 下的透明 VP9 视频）：

**日常**

<p>
  <img src="assets/preview/idle.gif" width="140" alt="待机呼吸" title="待机呼吸">
  <img src="assets/preview/walk.gif" width="140" alt="散步" title="散步">
  <img src="assets/preview/look.gif" width="140" alt="东张西望" title="东张西望">
  <img src="assets/preview/stretch.gif" width="140" alt="伸懒腰" title="伸懒腰">
  <img src="assets/preview/sleep.gif" width="140" alt="打瞌睡" title="打瞌睡">
</p>

**玩耍**

<p>
  <img src="assets/preview/spin.gif" width="140" alt="原地蹦跳拍手" title="原地蹦跳拍手">
  <img src="assets/preview/dance.gif" width="140" alt="跳舞" title="跳舞">
  <img src="assets/preview/sing.gif" width="140" alt="哼小曲" title="哼小曲">
  <img src="assets/preview/吹泡泡.gif" width="140" alt="吹泡泡" title="吹泡泡">
  <img src="assets/preview/玩魔方.gif" width="140" alt="玩魔方" title="玩魔方">
  <img src="assets/preview/纸飞机.gif" width="140" alt="纸飞机" title="纸飞机">
  <img src="assets/preview/抱玩偶.gif" width="140" alt="抱星芒玩偶" title="抱星芒玩偶">
</p>

**吃喝与日常小事**

<p>
  <img src="assets/preview/eat.gif" width="140" alt="吃饼干" title="吃饼干">
  <img src="assets/preview/coffee.gif" width="140" alt="喝咖啡" title="喝咖啡">
  <img src="assets/preview/吃冰淇淋.gif" width="140" alt="吃冰淇淋" title="吃冰淇淋">
  <img src="assets/preview/煮火锅.gif" width="140" alt="煮火锅" title="煮火锅">
  <img src="assets/preview/read.gif" width="140" alt="看书" title="看书">
  <img src="assets/preview/写日记.gif" width="140" alt="写日记" title="写日记">
</p>

**点击回应**

<p>
  <img src="assets/preview/click-happy.gif" width="140" alt="开心" title="开心">
  <img src="assets/preview/click-shy.gif" width="140" alt="害羞" title="害羞">
</p>

**工作状态**（跟随 Claude Code 会话）

<p>
  <img src="assets/preview/think.gif" width="140" alt="思考" title="思考">
  <img src="assets/preview/wait.gif" width="140" alt="等你批准" title="等你批准">
  <img src="assets/preview/organize.gif" width="140" alt="整理记忆" title="整理记忆">
  <img src="assets/preview/success.gif" width="140" alt="庆祝" title="庆祝">
  <img src="assets/preview/error.gif" width="140" alt="出错" title="出错">
</p>

> 注：「敲代码」(`work`) 与「挥手」(`wave`) 两段视频生成时镜头推近了，人物大小不稳定，待重新生成，暂不列出。

## 从零生成你自己的宠物

**① 立绘 → 透明静态形象**

```sh
python scripts/make_sprite.py      # assets/source/sticker.webp → assets/sprite/
```

从四边泛洪去背景（停在贴纸描线外）、去水印、边缘去白边、裁剪缩放到 900px 高，再切出发饰花（思考时旋转）、托盘图标，并在裙摆处把双腿拆成独立图层。需要手工量的坐标都在脚本开头的 `POSES` 里。换立绘后，`src/renderer/index.html` 里叠加层（眼睛、嘴、腮红、道具）的坐标也要重新量。

**② 提示词 + 绿幕参考首帧 → AI 动作视频**

- 提示词：[`docs/动作视频提示词.md`](docs/动作视频提示词.md)（通用前缀 + 每个动作按秒分解：原地不平移、身体不左右晃、道具「无→有→无」、首尾回到标准站立）
- 首帧：[`assets/source/reference-green.png`](assets/source/reference-green.png)（纯 #00FF00 绿幕、统一大小与位置）
- 用即梦 / 豆包等「图生视频」生成 16:9、10 秒视频，按动作名保存到 `assets/video/<动作名>.mp4`

**③ 绿幕视频 → 透明 webm**

```sh
npm run video                       # 全部；或 python scripts/make_video.py work.mp4 wave.mp4
```

去水印 → HSV 色相判定抠绿幕（蓝 / 白 / 橙永不误抠）→ 只量与脚连通的角色本体（特效不算）定版式 → 640×360 VP9 + alpha。版式与 dsh-pet 一致（站立高度 900/1215、脚底 1115/1215），与立绘无缝切换。会提示镜头推拉、动作越界等问题。需要带 libvpx 的 ffmpeg（`winget install Gyan.FFmpeg`，或 `pip install imageio-ffmpeg`）。

- **文件名是内置动作名**（`idle`、`eat`、`think`……）→ 替换该动作画面，时长跟随视频
- **文件名是其他名字**（`吃冰淇淋`……）→ 自动成为新的休闲动作，进随机动画链与右键「动作 → 视频动作」
- 放在 `~/.claude-pet/webm/` 的视频只在本机生效，且优先于项目内的

## 项目结构

```
claude-pet/
├── README.md  config.jsonc  package.json
├── docs/动作视频提示词.md        # ① 动作视频提示词配方
├── assets/
│   ├── source/                   # 原始立绘 + 绿幕参考首帧
│   ├── sprite/                   # 抠好的立绘（整张 / 身体 / 双腿）、发饰花、图标
│   ├── video/                    # AI 生成的绿幕视频（输入）
│   ├── webm/                     # 透明动作视频（输出，实际播放）
│   └── preview/                  # README 用 GIF 预览
├── scripts/                      # ② 素材链与工具
│   ├── make_sprite.py            #    立绘抠图、拆层
│   ├── make_video.py             #    绿幕视频 → 透明 webm
│   ├── make_previews.py          #    webm → 预览 GIF
│   ├── start.mjs                 #    启动（查找 Electron）
│   └── hooks.mjs                 #    安装 / 卸载 Claude Code hooks
├── hooks/claude-pet-hook.mjs     # Claude Code hook 转发脚本
├── src/                          # ③ 桌宠
│   ├── main/                     #    Electron 主进程：窗口与行为调度、HTTP 接口、对话、配置、hooks 安装
│   ├── renderer/                 #    渲染：立绘 / 视频 / 叠加层 / 气泡 / 对话框
│   ├── shared/                   #    纯逻辑：物理、动画链、多屏边界、hook → 状态、表情节奏、JSONC
│   └── preload.cjs
└── test/                         # node --test + Python 单测
```

## 测试

```sh
npm test          # JS：物理、动画链、多屏边界、hook 状态机、hooks 安装、表情节奏……
npm run test:py   # Python：抠像、去水印、版式对齐、镜头推拉检测（不需要 ffmpeg）
```

## 打包

```sh
npm run dist      # → dist/claude-pet-Setup-<版本>.exe（复用本机 Electron，配置见 package.json 的 build）
```

## 许可

- 代码：MIT
- **形象**：小橙的立绘与动作视频由 AI（豆包 / 即梦）生成，**非 Anthropic 官方形象**；本项目与 Anthropic 无关联
- **致谢**：项目结构、素材链与交互设计参考 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT）
