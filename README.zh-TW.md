# claude-pet 🧡

<p align="center">
  <a href="README.md">简体中文</a> | <b>繁體中文</b> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Claude%20Code-D97757">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Electron-47848F">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-339933">
  <img alt="os" src="https://img.shields.io/badge/tested-Windows%2011-0078D4">
  <img alt="assets" src="https://img.shields.io/badge/assets-%E9%80%8F%E6%98%8E%E5%8B%95%E4%BD%9C%E5%BD%B1%E7%89%87-ff69b4">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-orange">
</p>

一隻住在桌面上的 **Claude Code 桌寵**——橙髮少女「小橙」，Claude 的小分身。待機呼吸、隨機眨眼、到處溜達、蹦跳揮手、吃餅乾、喝咖啡、吹泡泡、煮火鍋……二十多段透明動作影片隨時無縫銜接；點擊會 Q 彈回應，拎起來甩出去走拋物線、碰邊反彈、落地屈膝緩衝，**多塊螢幕之間能直接飛過去、掉下去**。

她會**跟著 Claude Code 一起工作**：你送出提問她就托腮思考（髮間的向日葵轉起來），Claude 呼叫工具她就敲電腦、泡泡裡寫著正在跑什麼指令 / 改哪個檔案，需要你核准時舉手冒問號並跳出系統通知，一輪結束時撒彩帶慶祝。閒下來會碎碎念，按右鍵還能和她聊兩句。

本專案仿照 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（DeepSeek Harness 的桌寵）而作，同樣是**完整的三件套**：

```
① 提示詞（配方）          →  ② 素材鏈（引擎）               →  ③ 桌寵（成品）
AI 生成動作影片的配方         立繪去背 + 綠幕影片 → 透明動畫       跟隨 Claude Code 的 Electron 桌寵
docs/动作视频提示词.md        scripts/make_sprite.py / make_video.py   src/
```

換角色、換動作、換風格，全流程可重現。

> 桌寵本身的介面文字（選單、泡泡、通知）為簡體中文。

---

## 快速開始

### 方式一：下載安裝程式（Windows，推薦）

到 [Releases](https://github.com/brondon1/claude-pet/releases/latest) 下載 `claude-pet-Setup-<版本>.exe`，雙擊安裝（裝在目前使用者目錄，不需要系統管理員權限），桌面會出現「小橙」捷徑。不需要 Node.js，也不用另外下載 Electron。

> 安裝程式沒有程式碼簽章，首次執行時 Windows SmartScreen 可能提示「Windows 已保護您的電腦」，點「其他資訊 → 仍要執行」即可。

裝好後照下面的「連上 Claude Code」安裝 hooks（在寵物上按右鍵即可，不需要命令列）。

### 方式二：從原始碼執行

> 前提：已安裝 **Node.js ≥ 20** 與 **Claude Code**（`claude --version` 可用）。

```sh
# ① 進入專案目錄，安裝相依套件（--omit=optional：不重複下載 Electron，見下方說明）
cd claude-pet
npm install --omit=optional

# ② 啟動（前景執行；加 --detach 則背景執行、關掉終端機也不會結束）
npm start
node scripts/start.mjs --detach
```

**Electron 從哪來**：啟動腳本依序尋找環境變數 `CLAUDE_PET_ELECTRON` → `node_modules/electron`（`npm install` 不加 `--omit=optional` 時安裝）→ dsh-pet 下載過的 `~/.dsh/electron`。裝過 dsh-pet 就不用再下載一份。

### 連上 Claude Code

在寵物上按右鍵 →「连接 Claude Code（安装 hooks）…」，或：

```sh
npm run hooks:install      # 解除安裝：npm run hooks:uninstall
```

會往 `~/.claude/settings.json` 寫入桌寵自己的幾條 hook：原檔案先備份為 `settings.json.claude-pet.bak`，只增刪帶 `claude-pet-hook` 標記的項目，你自己的 hooks 原樣保留。**新開的 Claude Code 工作階段生效。**

hook 腳本（`hooks/claude-pet-hook.mjs`）靜默執行、1.5 秒逾時、無論成敗都以 0 結束——**寵物沒開著也絕不會拖慢或干擾 Claude Code**。

### 安裝後你會看到什麼

1. **小橙落在螢幕右下角**，揮手打招呼：「小橙来啦~」。
2. 沒裝 hooks 時，幾秒後她會提醒你「右鍵我 →『连接 Claude Code』就能陪你工作啦」。
3. **系統匣出現她的頭像**：點一下把她叫出來，右鍵是和寵物右鍵同樣的選單。
4. **開始功能表出現「小橙」**（Windows）：可以從這裡啟動；系統通知頂欄也靠它顯示「小橙」和頭像，而不是「Electron」。
5. 在任意目錄開一個新的 Claude Code 工作階段，問它點什麼——她就開始跟著思考、工作了。

## 桌寵功能

- **純粹的桌寵**：不監控、不上傳，不碰 Claude Code 核心；只透過官方 hooks 讀取工作階段事件
- **動畫鏈**：每個動作播完按權重挑下一個（預設 待機 10 / 散步 5 / 轉身 3 / 小動作 6，可設定），不連播同一個小動作
- **動作影片**：二十多段 AI 生成的透明動作影片（手部與全身動作），與靜態立繪同尺寸、腳底同一條線，切換無縫；影片沒載入前不撤立繪，不閃白
- **自然的小細節**：每隔 2~6 秒隨機眨眼、偶爾連眨兩下；泡泡出字時按字數對嘴型；雙腿分層，走路交替抬腳、起跳收腿、被拎起時自然下垂
- **全程不左右晃**：所有動作只做上下起伏和伸縮，看著穩當不暈
- **螢幕漫遊**：朝面向方向溜達，到工作區邊緣轉身
- **點擊 / 拖曳 / 甩拋**：點擊 Q 彈、隨機做個小反應（開心 / 害羞 / 暈乎乎），並透過 Claude Code 回你一句；拖曳經阻尼彈簧跟手；甩出走拋物線、碰邊反彈、落地摩擦停穩並擠壓一下，摔太狠會暈
- **多螢幕穿越**：甩拋時，緊鄰另一塊螢幕的那一側（上 / 下 / 左 / 右）不反彈，直接飛過去、掉下去，最終落在最下面那塊螢幕的地面
- **扒在螢幕邊框上**：把她拖到螢幕左 / 右 / 上邊框附近放手（不是用力甩出去），她會貼到離放手位置最近的那條邊框上，換成對應的姿勢——左右邊扒著螢幕邊從後面探出頭來（保留放手時的高度，半空時腿部淡出），上邊扒著上邊框倒掛下來探頭（保留左右位置，泡泡在她下面）；她散步走到左右邊時也有 30% 機率扒上去。扒著時照樣能點她（點臉蛋 / 頭有不同回應）、跟她聊天、顯示工作狀態，待 1~4 分鐘自己下來，拖她也會下來（`edge` 設定）。另有「趴着看你」小動作，在工作列上趴下來抬頭看你。四張姿勢圖由豆包生成，`python scripts/make_sprite.py pet-edge-left`（`pet-edge-right` / `pet-edge-top` / `pet-lie`）去背
- **多開與碰撞**：可以同時養好幾隻（設定裡「+ 添加宠物」），每隻有自己的名字、大小、位置、人設、對話記憶；甩出去的寵物會和別的寵物彈性碰撞，被撞到的也會被撞飛（`physics.petCollision` 可關）
- **設定視窗**：右鍵 / 系統匣「设置…」，以圖形介面修改寵物清單、開關、碎碎念間隔、物理參數，儲存即生效
- **跟隨 Claude Code 工作狀態**：思考 / 敲程式 / 等你核准 / 整理記憶 / 慶祝 / 出錯 六檔動畫 + 常駐泡泡（見下節）
- **系統通知**：需要你核准、等你回覆、長任務完成時跳出 Windows 通知（頂欄顯示「小橙」和頭像）
- **碎碎念與對話**：隨機時間、做小動作或 Claude Code 事件後，呼叫 Claude Code 冒一句碎碎念；右鍵「和我聊天…」與她對話，記憶持久保存
- **右鍵選單 / 系統匣**：「动作 → 分類 → 具體動作」任意點播；開關工作狀態跟隨 / 漫遊 / 通知；安裝或解除安裝 hooks；開啟 / 重新載入設定；清空對話記憶；結束時她會揮手說「拜拜，下次见~」
- **無障礙**：支援 `prefers-reduced-motion`（減少動態效果時去掉大幅位移與擠壓）

## ⚙️ 工作狀態連動（Claude Code hooks）

| hook 事件 | 小橙的反應 |
|---|---|
| `SessionStart` | 揮手：「新工作階段開始啦，衝！」 |
| `UserPromptSubmit` | 托腮思考，髮間向日葵轉起來：「讓我想想…」 |
| `PreToolUse` | 敲電腦，泡泡裡用她自己的話說在幫你做什麼，比如「我在幫你翻 README 找位置呢～」（不念指令和工具名，見下） |
| `PostToolUse` | 琢磨一下結果… |
| `Notification` | 舉手冒問號：「需要你核准一下！」/「等你回覆~」，並跳出系統通知 |
| `PreCompact` | 整理記憶 |
| `Stop` | 按 `celebrateChance`（預設 30%）的機率撒彩帶慶祝「搞定啦！」，不是每輪都慶祝；一輪超過 `notifyMinBusySec`（預設 20 秒）時跳出「Claude 完成了（用時 N 秒）」通知 |
| `PostToolUseFailure` / `StopFailure` | 叉叉眼冒汗「出了點岔子，再試試」 |
| `SessionEnd` | 「下次見~」 |

- **泡泡用她的口吻說進展**：泡泡裡只有她自己說的一句話（不帶專案目錄）——把 Claude 此刻在做的事（它最新說的話、正在用的工具）交給 Claude Code 改寫成第一人稱的口語，比如「我要重啟一下，馬上就能開口說話啦～」，不出現指令、程式碼和英文路徑。為省額度兩次改寫至少隔 `statusVoice.minIntervalSec`（預設 20 秒），沒改寫好時顯示備用的口語文案（「在终端里敲敲打打…」「翻翻 README.md 看看～」）；`statusVoice.enabled=false` 則只用備用文案
- **多工作階段並行**：每個工作階段獨立記錄狀態，顯示最需要你注意的那個（等核准 > 整理 > 工作 / 思考）；10 分鐘沒動靜的工作階段自動清除
- **文案可改**：`statusTexts` 逐項覆寫（鍵見 `src/shared/status.js` 的 `DEFAULT_TEXTS`）
- **不會對自己起反應**：寵物自己呼叫 `claude` 聊天時帶 `CLAUDE_PET_INTERNAL=1`，hook 直接忽略

## ⚙️ 碎碎念與對話

- **碎碎念**：每一句都呼叫本機 Claude Code（`claude -p`）當場隨機生成，**沒有固定台詞**：隨機抽話題、結合目前時間、避開最近說過的話；呼叫失敗（沒登入、逾時）時這一句就不說
- **什麼時候說**（沒有手動入口，都是自己冒出來的）：
  - **隨機時間**：每次說完後在 `minSec`~`maxSec`（預設 3~10 分鐘）之間隨機等一段
  - **做小動作時**：吃餅乾、看書、吹泡泡……按 `actionChance`（預設 30%）順口說一句和這個動作有關的話
  - **Claude Code 事件後**：新工作階段、任務完成、出錯，按 `eventChance`（預設 50%）過幾秒評論一句
  - **被點擊**：每次點她都會回一句，**點哪裡說哪裡**——向日葵、蝴蝶結、頭、臉蛋、長髮、手、領結、腰、裙擺、腿、小皮鞋各有各的情境和小反應（部位劃分見 `src/shared/bodyparts.js`）；連續點擊時會知道自己被碰了幾下
  - **點播動作**：右鍵「动作」或 `POST /play` 讓她做某個動作時，必定說一句和這個動作有關的話
  - **定時**：到了 `schedule` 裡的時刻做指定動作，並由 Claude Code 圍繞情境當場生成一句（預設工作日 9:30 上班喝咖啡、12:00 午餐和 19:00 晚餐煮火鍋、工作日 20:20 下班跳舞）
  - 兩句之間至少隔 `cooldownSec`（預設 60 秒）；聊天中、跟隨工作狀態中、被拎著時不說（點擊不受這個間隔限制）
- **對話**：右鍵「和我聊天…」彈出輸入框，Enter 送出、Esc 關閉；回覆走說話動畫 + 泡泡。最近 `brain.memoryRounds` 輪（預設 6）隨請求帶上，全部歷史儲存在 `~/.claude-pet/memory.json`
- **用誰的腦子**（`brain.provider`，預設 `auto`）：
  - 有 `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` → 走 Anthropic API（模型 `brain.apiModel`，按用量計費）
  - 否則 → 呼叫本機 `claude -p`，**用你自己的 Claude Code 登入**，與訂閱共用額度，不需要 key
- **兩種安裝方式都能呼叫**：原生安裝的 `claude.exe` 與 npm 全域安裝的 `claude.cmd` 都會自動辨識；不在 `PATH` 裡時還會找 `~/.local/bin`、`%APPDATA%\npm` 等常見目錄。也可以用環境變數 `CLAUDE_PET_CLAUDE` 直接指定 CLI 路徑
- **登入提示**：本機 Claude Code 沒登入或登入過期時，她會在泡泡裡提示你執行 `claude auth login`。注意 Claude 桌面應用程式的登入與命令列是兩套，命令列需要在獨立終端機裡單獨登入一次
- **額度用完**：Claude Code 回報「You've hit your session limit · resets 9:10pm」這類錯誤時，所有寵物一起暫停呼叫，到恢復時刻前碎碎念靜默略過、聊天直接提示「额度用完啦，21:10 恢复~」，不會反覆白跑 `claude`。剛用完時所有寵物一起打瞌睡並說一句什麼時候恢復，到點伸個懶腰報告滿血復活（動作和台詞見 `limit` 設定；這時呼叫不了 Claude Code，所以這兩句從現成台詞隨機挑）
- **記憶鏈：越用越懂你**：她會記下你在哪個專案、什麼時候用 Claude Code、讓它做了什麼（提問只記前 80 字），以及和她聊了什麼、愛點哪裡、常讓她做什麼動作；攢夠了就呼叫 Claude Code 把這些整理成「她對你的了解」（偏好 / 習慣 / 專案 / 事實 / 相處，最多 30 條），保留仍然成立的、修正過時的、加上新發現。每次整理是記憶鏈上的一環（學到了什麼、忘掉了什麼、她的一句感想），學到新東西時她會用自己的話告訴你。這些記憶會帶進聊天和碎碎念，所以越用越懂你。右鍵「记忆链」可以查看她記得的你、立刻整理、關掉或讓她忘掉一切；資料只存在本機 `~/.claude-pet/memory-chain.json`，所有寵物共用
  - **工作習慣與作息**：另外一直累計一份作息統計（整理後也不清空）：每天第一次 / 最後一次用 Claude Code 或和她互動的時間（凌晨 5 點前算前一天熬夜）、各時段和星期的活躍度。整理時她會據此寫出「工作日一般幾點開工、幾點收工、會不會熬夜、中午休不休息、週末忙不忙、下午幾點最忙」這類記憶。第一次啟動時會從 Claude Code 的工作階段紀錄（`~/.claude/projects`）補錄最近 60 天的作息——只取你發訊息的時間和專案名，不讀訊息內容——補完馬上整理一次，所以一裝上她就知道你的作息
- **人設**：`brain.persona` 是預設人設，每隻寵物可單獨設 `persona` 覆寫；實際系統提示會自動附加名字與目前時間

## 🔌 對外介面

桌寵在 `127.0.0.1:7341`（`port` 可改）開了一個本機 HTTP 服務，無驗證、只監聽本機。Claude Code hooks 走這裡，其他腳本 / 工具也可以用它驅動小橙：

| 介面 | 作用 |
|---|---|
| `GET /health` | 存活檢查 |
| `GET /state` | 目前動作、朝向、視窗位置、泡泡、工作狀態、hooks 是否已裝、對話通道 |
| `POST /hook` | Claude Code hook 酬載（`hooks/claude-pet-hook.mjs` 轉送） |
| `POST /say {text, ttl?}` | 讓她說一句（`ttl` 毫秒，0 = 常駐） |
| `POST /play {action}` | 點播動作（內建動作名見 `src/shared/behavior.js`，影片動作用檔名） |
| `POST /chat {text}` | 和她對話，回傳 `{reply}` |
| `POST /settings` | 開啟設定視窗 |
| 任意介面加 `?pet=<id>`（或 body 裡帶 `pet`） | 指定哪隻寵物，預設第一隻 |
| `POST /throw {vx, vy}` | 把她按指定初速度（px/s）甩出去 |
| `POST /edge {side}` | 讓她趴到螢幕邊上（`left` / `right` / `top`），`null` 則下來 |
| `POST /rename {name}` | 幫她改名（與右鍵「给我改名字…」相同） |
| `GET /memory` | 她記得的你：記憶條目、記憶鏈、作息統計摘要 |
| `POST /memory/consolidate` | 讓她立刻整理一次記憶 |

```sh
curl -s -X POST 127.0.0.1:7341/say  -H "content-type: application/json" -d '{"text":"建置通過啦！"}'
curl -s -X POST 127.0.0.1:7341/play -H "content-type: application/json" -d '{"action":"吃冰淇淋"}'
```

## ⚙️ 設定

預設值見 [`config.jsonc`](config.jsonc)（逐項帶註解）。**不要改這個檔案**——在 `~/.claude-pet/config.jsonc` 裡只寫想改的欄位即可（物件逐鍵合併，陣列 / 純量整段取代），改完右鍵「重载配置」即時生效（`port` 需重新啟動）。

| 欄位 | 說明 |
|---|---|
| `pets` | 寵物清單，每隻 `{id, name, size, position, offsetX, offsetY, workStatusEnabled, whisperEnabled, fixed, persona}`；第一隻預設叫「小橙」，通知頂欄顯示它的名字。舊版頂層 `name` / `size` 會自動遷移到第一隻 |
| `autoStart` | 每次開啟 Claude 桌面版或 Claude Code CLI（原生 `claude.exe`、npm 安裝的都算）時，桌寵沒在執行就自動喚醒——之前手動結束了也會；預設開，右鍵「打开 Claude 时自动启动」可直接開關。由開機自啟的守望行程實作，Windows 上訂閱行程啟動事件（一閃而過的 `claude --version` 這類不算） |
| `pets[].size` / `position` / `offsetX` / `offsetY` | 形象高度（預設 200，與 dsh-pet 女僕等高）、初始角落與偏移 |
| `animationWeights` / `roam` / `walkSpeed` | 動畫鏈權重、是否溜達、散步速度 |
| `edge` | 趴在螢幕邊上：`enabled`、`walkChance`（散步走到邊上時趴上去的機率，預設 0.3）、`minStaySec` / `maxStaySec`（趴多久，預設 60~240 秒） |
| `idleAnimation` | 待機隨機小動作：`{enabled, minSec, maxSec}`，每段小動作播完後隔 `minSec`~`maxSec` 秒（預設 15~45）再隨機來一段；開著時小動作頻率只由它決定，設定視窗裡可改 |
| `physics` | 重力、反彈係數、地面摩擦、甩出力道、寵物間碰撞 `petCollision`；`stayAfterDrag`：拖動後停在放手的位置，不甩出去也不往下掉（設定視窗或右鍵「拖动后停在原地」可開） |
| `workStatusEnabled` / `notificationsEnabled` / `notifyMinBusySec` / `celebrateChance` / `statusTexts` | 工作狀態跟隨與通知；`celebrateChance` 是完成一輪時慶祝的機率（0~1，預設 0.3，設定視窗裡按百分比改） |
| `whisper` / `brain` | 碎碎念與對話 |
| `schedule` | 定時動作（時刻、動作、情境、星期幾） |
| `statusVoice` | 工作狀態泡泡的口吻：`enabled`、`minIntervalSec`（兩次改寫的最短間隔，預設 20 秒） |
| `memory` | 記憶鏈：`enabled`、`observePrompts`（是否記你對 Claude 說的話）、`consolidateEvery`（攢夠多少分整理一次，觀察 1 分、聊天 3 分，預設 12）、`minIntervalMin`、`maxItems` 等 |
| `limit` | 額度用完 / 恢復時做的動作和說的話（`{name}`、`{reset}` 佔位） |

## 相容性

- **作業系統**：在 **Windows 11** 上開發並實測；Electron 與核心邏輯跨平台，macOS / Linux 理論可用但未測試（開始功能表捷徑、通知頂欄身分為 Windows 專屬，其他平台自動略過）
- **Claude Code**：在 `2.1.x` 上測試；用到的 hook 事件均為官方事件；原生安裝（`claude.exe`）與 npm 全域安裝（`claude.cmd`）都能呼叫
- **多顯示器**：支援上下 / 左右相鄰的多螢幕，甩拋可跨螢幕；不同 DPI 的螢幕座標由 Electron 統一換算
- **與 dsh-pet 共存**：可以同時執行，兩隻寵物互不干擾；可共用 dsh-pet 下載的 Electron

## 效果預覽

全部動作影片（GIF 預覽位於 `assets/preview/`，由 `python scripts/make_previews.py` 生成；實際播放的是 `assets/webm/` 下的透明 VP9 影片）：

**日常**

<p>
  <img src="assets/preview/idle.gif" width="140" alt="待機呼吸" title="待機呼吸">
  <img src="assets/preview/walk.gif" width="140" alt="散步" title="散步">
  <img src="assets/preview/look.gif" width="140" alt="東張西望" title="東張西望">
  <img src="assets/preview/stretch.gif" width="140" alt="伸懶腰" title="伸懶腰">
  <img src="assets/preview/sleep.gif" width="140" alt="打瞌睡" title="打瞌睡">
</p>

**玩耍**

<p>
  <img src="assets/preview/spin.gif" width="140" alt="原地蹦跳拍手" title="原地蹦跳拍手">
  <img src="assets/preview/dance.gif" width="140" alt="跳舞" title="跳舞">
  <img src="assets/preview/sing.gif" width="140" alt="哼小曲" title="哼小曲">
  <img src="assets/preview/吹泡泡.gif" width="140" alt="吹泡泡" title="吹泡泡">
  <img src="assets/preview/玩魔方.gif" width="140" alt="玩魔術方塊" title="玩魔術方塊">
  <img src="assets/preview/纸飞机.gif" width="140" alt="紙飛機" title="紙飛機">
  <img src="assets/preview/抱玩偶.gif" width="140" alt="抱星芒玩偶" title="抱星芒玩偶">
</p>

**吃喝與日常小事**

<p>
  <img src="assets/preview/eat.gif" width="140" alt="吃餅乾" title="吃餅乾">
  <img src="assets/preview/coffee.gif" width="140" alt="喝咖啡" title="喝咖啡">
  <img src="assets/preview/吃冰淇淋.gif" width="140" alt="吃冰淇淋" title="吃冰淇淋">
  <img src="assets/preview/煮火锅.gif" width="140" alt="煮火鍋" title="煮火鍋">
  <img src="assets/preview/read.gif" width="140" alt="看書" title="看書">
  <img src="assets/preview/写日记.gif" width="140" alt="寫日記" title="寫日記">
</p>

**點擊回應**

<p>
  <img src="assets/preview/click-happy.gif" width="140" alt="開心" title="開心">
  <img src="assets/preview/click-shy.gif" width="140" alt="害羞" title="害羞">
</p>

**工作狀態**（跟隨 Claude Code 工作階段）

<p>
  <img src="assets/preview/think.gif" width="140" alt="思考" title="思考">
  <img src="assets/preview/wait.gif" width="140" alt="等你核准" title="等你核准">
  <img src="assets/preview/organize.gif" width="140" alt="整理記憶" title="整理記憶">
  <img src="assets/preview/success.gif" width="140" alt="慶祝" title="慶祝">
  <img src="assets/preview/error.gif" width="140" alt="出錯" title="出錯">
</p>

> 註：「敲程式」(`work`) 與「揮手」(`wave`) 兩段影片生成時鏡頭推近了，人物大小不穩定，待重新生成，暫不列出。

## 從零生成你自己的寵物

**① 立繪 → 透明靜態形象**

```sh
python scripts/make_sprite.py      # assets/source/sticker.webp → assets/sprite/
```

從四邊泛洪去背（停在貼紙描線外）、去浮水印、邊緣去白邊、裁切縮放到 900px 高，再切出髮飾花（思考時旋轉）、系統匣圖示，並在裙擺處把雙腿拆成獨立圖層。需要手工量的座標都在腳本開頭的 `POSES` 裡。換立繪後，`src/renderer/index.html` 裡疊加層（眼睛、嘴、腮紅、道具）的座標也要重新量。

**② 提示詞 + 綠幕參考首幀 → AI 動作影片**

- 提示詞：[`docs/动作视频提示词.md`](docs/动作视频提示词.md)（通用前綴 + 每個動作按秒分解：原地不平移、身體不左右晃、道具「無→有→無」、首尾回到標準站姿）
- 首幀：[`assets/source/reference-green.png`](assets/source/reference-green.png)（純 #00FF00 綠幕、統一大小與位置）
- 用即夢 / 豆包等「圖生影片」生成 16:9、10 秒影片，按動作名儲存到 `assets/video/<動作名>.mp4`

**③ 綠幕影片 → 透明 webm**

```sh
npm run video                       # 全部；或 python scripts/make_video.py work.mp4 wave.mp4
```

去浮水印 → HSV 色相判定去綠幕（藍 / 白 / 橙永不誤去）→ 只量與腳連通的角色本體（特效不算）定版式 → 640×360 VP9 + alpha。版式與 dsh-pet 一致（站立高度 900/1215、腳底 1115/1215），與立繪無縫切換。會提示鏡頭推拉、動作越界等問題。需要帶 libvpx 的 ffmpeg（`winget install Gyan.FFmpeg`，或 `pip install imageio-ffmpeg`）。

- **檔名是內建動作名**（`idle`、`eat`、`think`……）→ 取代該動作畫面，時長跟隨影片
- **檔名是其他名字**（`吃冰淇淋`……）→ 自動成為新的休閒動作，加入隨機動畫鏈與右鍵「动作 → 视频动作」
- 放在 `~/.claude-pet/webm/` 的影片只在本機生效，且優先於專案內的

## 專案結構

```
claude-pet/
├── README.md  config.jsonc  package.json
├── docs/动作视频提示词.md        # ① 動作影片提示詞配方
├── assets/
│   ├── source/                   # 原始立繪 + 綠幕參考首幀
│   ├── sprite/                   # 去背好的立繪（整張 / 身體 / 雙腿）、髮飾花、圖示
│   ├── video/                    # AI 生成的綠幕影片（輸入）
│   ├── webm/                     # 透明動作影片（輸出，實際播放）
│   └── preview/                  # README 用 GIF 預覽
├── scripts/                      # ② 素材鏈與工具
│   ├── make_sprite.py            #    立繪去背、拆層
│   ├── make_video.py             #    綠幕影片 → 透明 webm
│   ├── make_previews.py          #    webm → 預覽 GIF
│   ├── start.mjs                 #    啟動（尋找 Electron）
│   └── hooks.mjs                 #    安裝 / 解除安裝 Claude Code hooks
├── hooks/claude-pet-hook.mjs     # Claude Code hook 轉送腳本
├── src/                          # ③ 桌寵
│   ├── main/                     #    Electron 主行程：視窗與行為調度、HTTP 介面、對話、設定、hooks 安裝
│   ├── renderer/                 #    繪製：立繪 / 影片 / 疊加層 / 泡泡 / 對話框
│   ├── shared/                   #    純邏輯：物理、動畫鏈、多螢幕邊界、hook → 狀態、表情節奏、JSONC
│   └── preload.cjs
└── test/                         # node --test + Python 單元測試
```

## 測試

```sh
npm test          # JS：物理、動畫鏈、多螢幕邊界、hook 狀態機、hooks 安裝、表情節奏……
npm run test:py   # Python：去背、去浮水印、版式對齊、鏡頭推拉偵測（不需要 ffmpeg）
```

## 打包

```sh
npm run dist      # → dist/claude-pet-Setup-<版本>.exe（沿用本機 Electron，設定見 package.json 的 build）
```

## 授權

- 程式碼：MIT
- **形象**：小橙的立繪與動作影片由 AI（豆包 / 即夢）生成，**非 Anthropic 官方形象**；本專案與 Anthropic 無關聯
- **致謝**：專案結構、素材鏈與互動設計參考 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT）
