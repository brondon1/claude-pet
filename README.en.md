# claude-pet 🧡

<p align="center">
  <a href="README.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <b>English</b> | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Claude%20Code-D97757">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Electron-47848F">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-339933">
  <img alt="os" src="https://img.shields.io/badge/tested-Windows%2011-0078D4">
  <img alt="assets" src="https://img.shields.io/badge/assets-transparent%20action%20videos-ff69b4">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-orange">
</p>

A **Claude Code desktop pet** that lives on your desktop: Xiaocheng (小橙, "Little Orange"), an orange-haired girl and Claude's little alter ego. She breathes while idle, blinks at random, wanders around, hops and waves, nibbles cookies, sips coffee, blows bubbles, cooks hotpot… more than twenty transparent action videos blend into each other seamlessly. Click her and she bounces back; pick her up and fling her and she flies along a parabola, bounces off the edges and bends her knees as she lands. **She can fly and fall straight across multiple monitors.**

She **works alongside Claude Code**: when you send a prompt she rests her chin in her hand and thinks (the sunflower in her hair starts spinning); when Claude calls tools she types away, with a bubble showing which command is running or which file is being edited; when your approval is needed she raises her hand with a question mark and pops a system notification; at the end of a turn she throws confetti. When things are quiet she mutters to herself, and you can right-click to chat with her.

This project is modeled on [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) (the desktop pet for DeepSeek Harness) and is likewise a **complete three-part kit**:

```
① Prompts (the recipe)          →  ② Asset pipeline (the engine)                   →  ③ Desktop pet (the product)
Recipe for AI action videos         Sprite cutout + green-screen video → alpha video   Electron pet that follows Claude Code
docs/动作视频提示词.md               scripts/make_sprite.py / make_video.py             src/
```

Swap the character, the actions or the style — the whole pipeline is reproducible.

> The pet's own UI text (menus, bubbles, notifications) is in Chinese.

---

## Quick start

### Option 1: download the installer (Windows, recommended)

Download `claude-pet-Setup-<version>.exe` from [Releases](https://github.com/brondon1/claude-pet/releases/latest) and double-click it (it installs for the current user, no admin rights needed); a "小橙" shortcut appears on the desktop. No Node.js or separate Electron download required.

> The installer isn't code-signed, so on first run Windows SmartScreen may say "Windows protected your PC" — click "More info → Run anyway".

After installing, set up hooks as described in "Connect to Claude Code" below (just right-click the pet, no command line needed).

### Option 2: run from source

> Prerequisites: **Node.js ≥ 20** and **Claude Code** (`claude --version` works).

```sh
# ① Enter the project and install dependencies (--omit=optional skips re-downloading Electron, see below)
cd claude-pet
npm install --omit=optional

# ② Start (foreground; with --detach it runs in the background and survives closing the terminal)
npm start
node scripts/start.mjs --detach
```

**Where Electron comes from**: the start script looks, in order, at the `CLAUDE_PET_ELECTRON` environment variable → `node_modules/electron` (installed when you run `npm install` without `--omit=optional`) → `~/.dsh/electron` downloaded by dsh-pet. If you already have dsh-pet, you don't need another copy.

### Connect to Claude Code

Right-click the pet → "连接 Claude Code（安装 hooks）…" (Connect Claude Code / install hooks), or:

```sh
npm run hooks:install      # uninstall: npm run hooks:uninstall
```

This writes the pet's own hooks into `~/.claude/settings.json`. The original file is first backed up as `settings.json.claude-pet.bak`; only entries tagged `claude-pet-hook` are added or removed, and your own hooks are left untouched. **Takes effect in newly started Claude Code sessions.**

The hook script (`hooks/claude-pet-hook.mjs`) runs silently with a 1.5-second timeout and always exits 0 — **even when the pet isn't running, it never slows down or interferes with Claude Code**.

### What you'll see after installing

1. **Xiaocheng drops into the bottom-right corner of the screen** and waves hello: "小橙来啦~".
2. Without hooks installed, after a few seconds she reminds you to right-click her → "连接 Claude Code" so she can keep you company while you work.
3. **Her avatar appears in the system tray**: click it to call her out; right-click for the same menu as on the pet.
4. **"小橙" appears in the Start menu** (Windows): you can launch her from there, and it's also what makes system notifications show "小橙" and her avatar in the header instead of "Electron".
5. Open a new Claude Code session in any directory and ask it something — she starts thinking and working along with it.

## Features

- **Just a pet**: no monitoring, no uploading, doesn't touch Claude Code's internals; it only reads session events through the official hooks
- **Animation chain**: after each action, the next one is picked by weight (defaults: idle 10 / walk 5 / turn 3 / small actions 6, configurable), never repeating the same small action back to back
- **Action videos**: more than twenty AI-generated transparent action videos (hand and full-body movements), the same size as the static sprite with feet on the same line, so switching is seamless; the sprite stays up until a video has loaded, so there's no white flash
- **Natural little details**: random blinks every 2–6 seconds, occasionally a double blink; mouth moves according to the length of the bubble text; legs are separate layers — they alternate while walking, tuck in when jumping and dangle naturally when she's picked up
- **Never sways left and right**: every action only bobs up and down or stretches, so she looks steady and never makes you dizzy
- **Roaming**: walks in the direction she's facing and turns around at the edge of the work area
- **Click / drag / fling**: clicks make her bounce and do a small reaction (happy / shy / dizzy), plus a line generated by Claude Code; dragging follows the cursor through a damped spring; when flung she follows a parabola, bounces off edges, slides to a stop with friction and squashes a little on landing — throw her too hard and she gets dizzy
- **Cross-monitor travel**: when flung, the side that borders another screen (top / bottom / left / right) doesn't bounce — she flies or falls straight through and finally lands on the floor of the lowest screen
- **Clinging to the screen border**: drag her near the left, right or top border and let go (not a hard fling) and she snaps to the nearest point on that border in the matching pose — on the left or right she holds the edge and peeks out from behind it (keeping the height where you let go; mid-air her legs fade out), on the top she hangs over the top border and peeks down (keeping her horizontal position, with the bubble below her). Walking into the left or right edge also has a 30% chance of making her cling. While clinging you can still click her (face and head get different reactions), chat and see work status; after 1–4 minutes she comes down by herself, or drag her off (`edge` config). There's also a small action, 「趴着看你」, where she lies on the taskbar on her front looking up at you. The four pose images were generated with Doubao and cut out with `python scripts/make_sprite.py pet-edge-left` (`pet-edge-right` / `pet-edge-top` / `pet-lie`)
- **Multiple pets and collisions**: keep several at once ("+ 添加宠物" in Settings), each with its own name, size, position, persona and chat memory; a flung pet collides elastically with the others, and the one it hits gets knocked flying too (`physics.petCollision` turns this off)
- **Settings window**: right-click / tray → "设置…" (Settings) to edit the pet list, switches, mutter intervals and physics in a GUI; changes apply on save
- **Follows Claude Code's work status**: six animations — thinking / coding / waiting for approval / organizing memory / celebrating / error — plus a persistent bubble (see the next section)
- **System notifications**: Windows notifications when your approval is needed, when Claude is waiting for your reply, and when a long task finishes (header shows "小橙" and her avatar)
- **Muttering and chat**: at random times, during small actions or after Claude Code events, she calls Claude Code to come up with a line; right-click → "和我聊天…" (Chat with me) to talk to her, with persistent memory
- **Context menu / tray**: play any action via "动作 → category → action"; toggle work-status following / roaming / notifications; install or uninstall hooks; open / reload the config; clear chat memory; when quitting she waves and says "拜拜，下次见~" (Bye, see you next time)
- **Accessibility**: respects `prefers-reduced-motion` (large movements and squashing are removed when reduced motion is on)

## ⚙️ Work-status integration (Claude Code hooks)

| Hook event | Xiaocheng's reaction |
|---|---|
| `SessionStart` | Waves: "New session, let's go!" |
| `UserPromptSubmit` | Chin in hand, thinking, the sunflower in her hair spinning: "Let me think…" |
| `PreToolUse` | Types on her laptop; the bubble says in her own words what she's helping with, e.g. "I'm flipping through the README for you~" (no commands or tool names, see below) |
| `PostToolUse` | Mulling over the result… |
| `Notification` | Raises her hand with a question mark: "I need your approval!" / "Waiting for your reply~", plus a system notification |
| `PreCompact` | Organizing memory |
| `Stop` | With probability `celebrateChance` (default 30%) she throws confetti: "Done!" — not after every turn; when a turn took longer than `notifyMinBusySec` (default 20 s), a "Claude finished (took N s)" notification |
| `PostToolUseFailure` / `StopFailure` | X-shaped eyes and a sweat drop: "Something went wrong, let's try again" |
| `SessionEnd` | "See you next time~" |

- **The bubble tells you the progress in her own voice**: it holds just one line she says herself (no project folder) — what Claude is doing right now (its latest message or the tool it's using) is handed to Claude Code and rewritten as one casual first-person line, e.g. "我要重启一下，马上就能开口说话啦～", with no commands, code or English paths. To save quota there are at least `statusVoice.minIntervalSec` seconds (default 20) between rewrites; until one is ready a casual fallback phrase is shown ("在终端里敲敲打打…", "翻翻 README.md 看看～"); `statusVoice.enabled=false` uses only the fallbacks
- **Parallel sessions**: each session keeps its own state, and the one that most needs your attention is shown (waiting for approval > organizing > working / thinking); sessions with no activity for 10 minutes are cleared automatically
- **Customizable text**: override individual entries with `statusTexts` (keys are in `DEFAULT_TEXTS` in `src/shared/status.js`)
- **Doesn't react to itself**: when the pet calls `claude` itself it sets `CLAUDE_PET_INTERNAL=1`, and the hook ignores it

## ⚙️ Muttering and chat

- **Muttering**: every line is generated on the spot by your local Claude Code (`claude -p`) — **there are no fixed lines**: a random topic, the current time, and avoiding things said recently; if the call fails (not logged in, timeout) that line is simply skipped
- **When she talks** (there's no manual trigger; it all happens on its own):
  - **Random times**: after each line she waits a random time between `minSec` and `maxSec` (default 3–10 minutes)
  - **During small actions**: eating cookies, reading, blowing bubbles… with probability `actionChance` (default 30%) she says something about what she's doing
  - **After Claude Code events**: new session, task done, error — with probability `eventChance` (default 50%) she comments a few seconds later
  - **When clicked**: every click gets a reply, **and it depends on where you click** — sunflower, bow, head, cheeks, long hair, hands, bow tie, waist, skirt, legs and shoes each have their own context and small reaction (body-part regions are in `src/shared/bodyparts.js`); with repeated clicks she knows how many times she's been poked
  - **Requested actions**: when you make her do an action via right-click → "动作" or `POST /play`, she always says something about it
  - **Scheduled**: at the times in `schedule` she does the given action, and Claude Code generates a line around the context (defaults: coffee at 9:30 on workdays, hotpot for lunch at 12:00 and dinner at 19:00, a dance when work ends at 20:20 on workdays)
  - At least `cooldownSec` (default 60 s) between lines; no muttering while chatting, while following work status, or while being held (clicks aren't subject to the cooldown)
- **Chat**: right-click → "和我聊天…" opens an input box; Enter sends, Esc closes; the reply comes with a talking animation and a bubble. The latest `brain.memoryRounds` rounds (default 6) are sent with each request, and the full history is saved to `~/.claude-pet/memory.json`
- **Whose brain** (`brain.provider`, default `auto`):
  - With `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` → Anthropic API (model `brain.apiModel`, billed per use)
  - Otherwise → local `claude -p`, **using your own Claude Code login**, sharing your subscription quota, no key needed
- **Works with both install methods**: the native `claude.exe` and the npm-global `claude.cmd` are both detected automatically; if it's not on `PATH`, common directories like `~/.local/bin` and `%APPDATA%\npm` are searched too. You can also point to the CLI directly with the `CLAUDE_PET_CLAUDE` environment variable
- **Login prompt**: when local Claude Code isn't logged in or the login has expired, her bubble tells you to run `claude auth login`. Note that the Claude desktop app and the command line log in separately; the CLI needs its own login once in a standalone terminal
- **Out of quota**: when Claude Code reports something like "You've hit your session limit · resets 9:10pm", all pets stop calling it; until the reset time, muttering is skipped silently and chat replies right away with "额度用完啦，21:10 恢复~" (out of quota, back at 21:10) instead of running `claude` over and over. When the quota first runs out, all pets doze off and say when it'll come back; at the reset time they stretch and announce they're fully recharged (actions and lines are in the `limit` config; since Claude Code can't be called at that point, these two lines are picked at random from ready-made ones)
- **Memory chain — she gets to know you over time**: she notes which projects you use Claude Code in, when, and what you ask it (only the first 80 characters of each prompt), plus what you chat about, where you like to click her and which actions you ask for. Once enough has built up she has Claude Code distill it into "what she knows about you" (preferences / habits / projects / facts / relationship, up to 30 items) — keeping what still holds, fixing what's outdated, adding new findings. Each pass is one link in the memory chain (what was learned, what was dropped, a line from her), and when she learns something new she tells you in her own words. These memories go into chat and mutterings, so she understands you better the more you use her. Right-click → "记忆链" to see what she remembers, consolidate now, turn it off or make her forget everything; data stays on this machine in `~/.claude-pet/memory-chain.json`, shared by all pets
  - **Work habits and daily schedule**: she also keeps running schedule statistics that survive every consolidation — the first and last time each day you use Claude Code or interact with her (activity before 5 a.m. counts as the previous day's late night), plus activity by hour and weekday. From these she writes memories like when you usually start and finish on workdays, whether you stay up late, whether you take a lunch break, how busy weekends are and when your afternoon peak is. On first start she backfills the last 60 days from Claude Code's session records (`~/.claude/projects`) — only the time and project name of each message you sent, never the content — and consolidates right away, so she knows your routine from day one
- **Persona**: `brain.persona` is the default persona, and each pet can override it with its own `persona`; the actual system prompt automatically appends the name and current time

## 🔌 External API

The pet runs a local HTTP server on `127.0.0.1:7341` (`port` is configurable), with no auth and listening on localhost only. Claude Code hooks go through it, and other scripts / tools can use it to drive Xiaocheng:

| Endpoint | What it does |
|---|---|
| `GET /health` | Liveness check |
| `GET /state` | Current action, facing, window position, bubble, work status, whether hooks are installed, chat channel |
| `POST /hook` | Claude Code hook payload (forwarded by `hooks/claude-pet-hook.mjs`) |
| `POST /say {text, ttl?}` | Make her say something (`ttl` in ms, 0 = stays) |
| `POST /play {action}` | Play an action (built-in action names are in `src/shared/behavior.js`; video actions use the file name) |
| `POST /chat {text}` | Chat with her, returns `{reply}` |
| `POST /settings` | Open the settings window |
| Add `?pet=<id>` to any endpoint (or `pet` in the body) | Choose which pet; defaults to the first |
| `POST /throw {vx, vy}` | Fling her with the given initial velocity (px/s) |
| `POST /edge {side}` | Make her lie on the screen edge (`left` / `right` / `top`); `null` brings her down |
| `POST /rename {name}` | Rename her (same as right-click → "给我改名字…") |
| `GET /memory` | What she remembers about you: memory items, the chain, a schedule summary |
| `POST /memory/consolidate` | Make her consolidate memories now |

```sh
curl -s -X POST 127.0.0.1:7341/say  -H "content-type: application/json" -d '{"text":"Build passed!"}'
curl -s -X POST 127.0.0.1:7341/play -H "content-type: application/json" -d '{"action":"吃冰淇淋"}'
```

## ⚙️ Configuration

Defaults are in [`config.jsonc`](config.jsonc) (every field is commented). **Don't edit that file** — put only the fields you want to change in `~/.claude-pet/config.jsonc` (objects are merged key by key; arrays / scalars are replaced whole), then right-click → "重载配置" (Reload config) to apply it immediately (`port` needs a restart).

| Field | Description |
|---|---|
| `pets` | The pet list, each `{id, name, size, position, offsetX, offsetY, workStatusEnabled, whisperEnabled, fixed, persona}`; the first is named "小橙" by default, and notification headers show its name. Legacy top-level `name` / `size` are migrated to the first pet automatically |
| `autoStart` | Every time the Claude desktop app or the Claude Code CLI starts (native `claude.exe` or npm install), the pet is woken up if it isn't running — even if you quit it earlier; on by default; toggle with right-click → "打开 Claude 时自动启动". Done by a watcher process that starts at login and, on Windows, subscribes to process-start events (blink-and-you-miss-it runs like `claude --version` don't count) |
| `pets[].size` / `position` / `offsetX` / `offsetY` | Sprite height (default 200, the same as the dsh-pet maid), starting corner and offset |
| `animationWeights` / `roam` / `walkSpeed` | Animation-chain weights, whether to roam, walking speed |
| `edge` | Lying on the screen edge: `enabled`, `walkChance` (chance of climbing on when she walks into the edge, default 0.3), `minStaySec` / `maxStaySec` (how long she stays, default 60–240 s) |
| `idleAnimation` | Random small actions while idle: `{enabled, minSec, maxSec}` — after each small action ends, another random one plays `minSec`–`maxSec` seconds later (default 15–45); when on, this alone sets how often small actions play; editable in the settings window |
| `physics` | Gravity, bounciness, ground friction, fling strength, pet-to-pet collisions `petCollision`; `stayAfterDrag`: after dragging she stays where you let go — no fling, no falling (toggle in the settings window or right-click → "拖动后停在原地") |
| `workStatusEnabled` / `notificationsEnabled` / `notifyMinBusySec` / `celebrateChance` / `statusTexts` | Work-status following and notifications; `celebrateChance` is the chance of celebrating when a turn finishes (0–1, default 0.3; set as a percentage in the settings window) |
| `whisper` / `brain` | Muttering and chat |
| `schedule` | Scheduled actions (time, action, context, weekdays) |
| `statusVoice` | Voice of the work-status bubble: `enabled`, `minIntervalSec` (minimum gap between rewrites, default 20 s) |
| `memory` | Memory chain: `enabled`, `observePrompts` (whether to record what you ask Claude), `consolidateEvery` (points needed before a consolidation pass; an observation is 1, a chat 3; default 12), `minIntervalMin`, `maxItems`, … |
| `limit` | Action and lines when the quota runs out / comes back (`{name}`, `{reset}` placeholders) |

## Compatibility

- **OS**: developed and tested on **Windows 11**; Electron and the core logic are cross-platform, so macOS / Linux should work in theory but are untested (the Start-menu shortcut and notification identity are Windows-only and skipped elsewhere)
- **Claude Code**: tested on `2.1.x`; only official hook events are used; both the native install (`claude.exe`) and the npm-global install (`claude.cmd`) work
- **Multiple monitors**: screens arranged above / below / side by side are supported, and flinging works across them; coordinates across different DPIs are converted by Electron
- **Coexists with dsh-pet**: both can run at the same time without getting in each other's way, and they can share dsh-pet's Electron

## Preview

All action videos (GIF previews live in `assets/preview/`, generated by `python scripts/make_previews.py`; what actually plays are the transparent VP9 videos in `assets/webm/`):

**Everyday**

<p>
  <img src="assets/preview/idle.gif" width="140" alt="Idle breathing" title="Idle breathing">
  <img src="assets/preview/walk.gif" width="140" alt="Walking" title="Walking">
  <img src="assets/preview/look.gif" width="140" alt="Looking around" title="Looking around">
  <img src="assets/preview/stretch.gif" width="140" alt="Stretching" title="Stretching">
  <img src="assets/preview/sleep.gif" width="140" alt="Dozing" title="Dozing">
</p>

**Play**

<p>
  <img src="assets/preview/spin.gif" width="140" alt="Hopping and clapping" title="Hopping and clapping">
  <img src="assets/preview/dance.gif" width="140" alt="Dancing" title="Dancing">
  <img src="assets/preview/sing.gif" width="140" alt="Humming" title="Humming">
  <img src="assets/preview/吹泡泡.gif" width="140" alt="Blowing bubbles" title="Blowing bubbles">
  <img src="assets/preview/玩魔方.gif" width="140" alt="Rubik's cube" title="Rubik's cube">
  <img src="assets/preview/纸飞机.gif" width="140" alt="Paper plane" title="Paper plane">
  <img src="assets/preview/抱玩偶.gif" width="140" alt="Hugging a star plushie" title="Hugging a star plushie">
</p>

**Food, drink and little things**

<p>
  <img src="assets/preview/eat.gif" width="140" alt="Eating a cookie" title="Eating a cookie">
  <img src="assets/preview/coffee.gif" width="140" alt="Drinking coffee" title="Drinking coffee">
  <img src="assets/preview/吃冰淇淋.gif" width="140" alt="Eating ice cream" title="Eating ice cream">
  <img src="assets/preview/煮火锅.gif" width="140" alt="Cooking hotpot" title="Cooking hotpot">
  <img src="assets/preview/read.gif" width="140" alt="Reading" title="Reading">
  <img src="assets/preview/写日记.gif" width="140" alt="Writing a diary" title="Writing a diary">
</p>

**Click reactions**

<p>
  <img src="assets/preview/click-happy.gif" width="140" alt="Happy" title="Happy">
  <img src="assets/preview/click-shy.gif" width="140" alt="Shy" title="Shy">
</p>

**Work status** (follows the Claude Code session)

<p>
  <img src="assets/preview/think.gif" width="140" alt="Thinking" title="Thinking">
  <img src="assets/preview/wait.gif" width="140" alt="Waiting for approval" title="Waiting for approval">
  <img src="assets/preview/organize.gif" width="140" alt="Organizing memory" title="Organizing memory">
  <img src="assets/preview/success.gif" width="140" alt="Celebrating" title="Celebrating">
  <img src="assets/preview/error.gif" width="140" alt="Error" title="Error">
</p>

> Note: the "coding" (`work`) and "wave" (`wave`) videos zoomed in during generation, so the character's size isn't stable; they're waiting to be regenerated and aren't listed for now.

## Make your own pet from scratch

**① Character art → transparent static sprite**

```sh
python scripts/make_sprite.py      # assets/source/sticker.webp → assets/sprite/
```

Flood-fills the background from all four edges (stopping at the sticker outline), removes the watermark, strips white fringes, crops and scales to 900 px tall, then cuts out the hair flower (spins while thinking) and the tray icon, and splits the legs into a separate layer at the skirt hem. All hand-measured coordinates are in `POSES` at the top of the script. After swapping the art, the coordinates of the overlays in `src/renderer/index.html` (eyes, mouth, blush, props) need re-measuring too.

**② Prompts + green-screen reference frame → AI action videos**

- Prompts: [`docs/动作视频提示词.md`](docs/动作视频提示词.md) (a shared prefix + each action broken down second by second: stays in place, body never sways left/right, props go "none → there → none", starts and ends in the standard standing pose)
- First frame: [`assets/source/reference-green.png`](assets/source/reference-green.png) (pure #00FF00 green screen, fixed size and position)
- Generate 16:9, 10-second videos with an image-to-video tool such as Jimeng / Doubao, and save them as `assets/video/<action name>.mp4`

**③ Green-screen video → transparent webm**

```sh
npm run video                       # all of them; or python scripts/make_video.py work.mp4 wave.mp4
```

Watermark removal → HSV hue-based green-screen keying (blue / white / orange are never keyed out) → measures only the character body connected to the feet (effects don't count) to fix the layout → 640×360 VP9 + alpha. The layout matches dsh-pet (standing height 900/1215, feet at 1115/1215), so it switches seamlessly with the sprite. Warns about camera zoom, actions going out of bounds, and similar issues. Needs an ffmpeg with libvpx (`winget install Gyan.FFmpeg`, or `pip install imageio-ffmpeg`).

- **File name is a built-in action name** (`idle`, `eat`, `think`…) → replaces that action's visuals; the duration follows the video
- **File name is anything else** (`吃冰淇淋`…) → automatically becomes a new leisure action, added to the random animation chain and to right-click → "动作 → 视频动作"
- Videos in `~/.claude-pet/webm/` only apply on this machine and take priority over the project's

## Project structure

```
claude-pet/
├── README.md  config.jsonc  package.json
├── docs/动作视频提示词.md        # ① Action-video prompt recipe
├── assets/
│   ├── source/                   # Original art + green-screen reference frame
│   ├── sprite/                   # Cut-out sprite (whole / body / legs), hair flower, icons
│   ├── video/                    # AI-generated green-screen videos (input)
│   ├── webm/                     # Transparent action videos (output, what plays)
│   └── preview/                  # GIF previews for the README
├── scripts/                      # ② Asset pipeline and tools
│   ├── make_sprite.py            #    Sprite cutout and layering
│   ├── make_video.py             #    Green-screen video → transparent webm
│   ├── make_previews.py          #    webm → preview GIF
│   ├── start.mjs                 #    Launcher (finds Electron)
│   └── hooks.mjs                 #    Install / uninstall Claude Code hooks
├── hooks/claude-pet-hook.mjs     # Claude Code hook forwarder
├── src/                          # ③ The pet
│   ├── main/                     #    Electron main process: windows and behavior, HTTP API, chat, config, hook install
│   ├── renderer/                 #    Rendering: sprite / video / overlays / bubble / chat box
│   ├── shared/                   #    Pure logic: physics, animation chain, multi-monitor bounds, hook → status, expressions, JSONC
│   └── preload.cjs
└── test/                         # node --test + Python unit tests
```

## Tests

```sh
npm test          # JS: physics, animation chain, multi-monitor bounds, hook state machine, hook install, expression timing…
npm run test:py   # Python: keying, watermark removal, layout alignment, camera-zoom detection (no ffmpeg needed)
```

## Packaging

```sh
npm run dist      # → dist/claude-pet-Setup-<version>.exe (reuses the local Electron; config in package.json "build")
```

## License

- Code: MIT
- **Character**: Xiaocheng's art and action videos were generated by AI (Doubao / Jimeng) and are **not an official Anthropic character**; this project is not affiliated with Anthropic
- **Credits**: project structure, asset pipeline and interaction design are based on [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) (MIT)
