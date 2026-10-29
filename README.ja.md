# claude-pet 🧡

<p align="center">
  <a href="README.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.en.md">English</a> | <b>日本語</b>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Claude%20Code-D97757">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Electron-47848F">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-339933">
  <img alt="os" src="https://img.shields.io/badge/tested-Windows%2011-0078D4">
  <img alt="assets" src="https://img.shields.io/badge/assets-%E9%80%8F%E9%81%8E%E3%82%A2%E3%82%AF%E3%82%B7%E3%83%A7%E3%83%B3%E5%8B%95%E7%94%BB-ff69b4">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-orange">
</p>

デスクトップに住む **Claude Code のデスクトップペット**——オレンジ髪の女の子「小橙（シャオチョン）」、Claude の小さな分身です。待機中の呼吸、ランダムなまばたき、お散歩、ジャンプや手を振る動き、クッキーを食べる、コーヒーを飲む、シャボン玉を吹く、火鍋を煮る……20 本以上の透過アクション動画がシームレスにつながります。クリックするとぷるんと反応し、つまんで投げると放物線を描いて飛び、端で跳ね返り、着地ではひざを曲げて受け止めます。**複数のモニター間もそのまま飛び越えたり落ちたりできます。**

彼女は **Claude Code と一緒に働きます**：プロンプトを送るとほおづえをついて考え込み（髪のひまわりがくるくる回ります）、Claude がツールを呼ぶとパソコンを叩きながら、実行中のコマンドや編集中のファイルを吹き出しに表示します。承認が必要なときは手を挙げて「？」を出し、システム通知も表示。1 ターンが終わると紙吹雪でお祝いします。ひまなときはひとりごとをつぶやき、右クリックでおしゃべりもできます。

本プロジェクトは [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（DeepSeek Harness のデスクトップペット）を参考に作られており、同じく**完全な 3 点セット**です：

```
① プロンプト（レシピ）         →  ② 素材パイプライン（エンジン）              →  ③ デスクトップペット（完成品）
AI アクション動画のレシピ          立ち絵の切り抜き + グリーンバック → 透過動画   Claude Code に連動する Electron ペット
docs/动作视频提示词.md              scripts/make_sprite.py / make_video.py         src/
```

キャラクター、アクション、スタイルを差し替えても、全工程を再現できます。

> ペット本体の UI（メニュー、吹き出し、通知）は中国語です。

---

## クイックスタート

### 方法 1：インストーラーをダウンロード（Windows、おすすめ）

[Releases](https://github.com/brondon1/claude-pet/releases/latest) から `claude-pet-Setup-<バージョン>.exe` をダウンロードしてダブルクリック（現在のユーザーにインストールされ、管理者権限は不要）。デスクトップに「小橙」のショートカットができます。Node.js も Electron の別途ダウンロードも不要です。

> インストーラーはコード署名されていないため、初回起動時に Windows SmartScreen が「PC が保護されました」と表示することがあります。「詳細情報 → 実行」を選んでください。

インストール後、下の「Claude Code と接続する」に従って hooks を入れてください（ペットを右クリックするだけで、コマンドラインは不要です）。

### 方法 2：ソースから実行

> 前提：**Node.js ≥ 20** と **Claude Code**（`claude --version` が使えること）がインストール済み。

```sh
# ① プロジェクトに入り、依存関係をインストール（--omit=optional：Electron を重複ダウンロードしない。下記参照）
cd claude-pet
npm install --omit=optional

# ② 起動（フォアグラウンド。--detach を付けるとバックグラウンドで動き、ターミナルを閉じても終了しない）
npm start
node scripts/start.mjs --detach
```

**Electron の入手先**：起動スクリプトは環境変数 `CLAUDE_PET_ELECTRON` → `node_modules/electron`（`--omit=optional` なしで `npm install` した場合に入る）→ dsh-pet がダウンロードした `~/.dsh/electron` の順に探します。dsh-pet を入れていればもう 1 つダウンロードする必要はありません。

### Claude Code と接続する

ペットを右クリック →「连接 Claude Code（安装 hooks）…」（Claude Code に接続／hooks をインストール）、または：

```sh
npm run hooks:install      # アンインストール：npm run hooks:uninstall
```

`~/.claude/settings.json` にペット用の hook をいくつか書き込みます。元のファイルはまず `settings.json.claude-pet.bak` としてバックアップされ、`claude-pet-hook` の印が付いた項目だけを追加・削除し、あなた自身の hooks はそのまま残ります。**新しく開いた Claude Code セッションから有効になります。**

hook スクリプト（`hooks/claude-pet-hook.mjs`）は静かに動作し、1.5 秒でタイムアウト、成否にかかわらず終了コード 0 で終わります——**ペットが起動していなくても、Claude Code を遅くしたり邪魔したりすることは絶対にありません**。

### インストール後に起こること

1. **小橙が画面右下に降りてきて**、手を振って「小橙来啦~」とあいさつします。
2. hooks が未インストールなら、数秒後に「右クリック →『连接 Claude Code』で一緒に働けるよ」と教えてくれます。
3. **タスクトレイに彼女のアイコンが出ます**：クリックで呼び出し、右クリックでペットと同じメニュー。
4. **スタートメニューに「小橙」が出ます**（Windows）：ここから起動でき、システム通知のヘッダーに「Electron」ではなく「小橙」とアイコンが表示されるのもこのおかげです。
5. 任意のディレクトリで新しい Claude Code セッションを開いて何か聞くと、彼女も一緒に考えたり作業したりし始めます。

## 機能

- **純粋なペット**：監視なし、アップロードなし、Claude Code の内部には触れません。公式 hooks でセッションイベントを読むだけです
- **アニメーションチェーン**：各アクションが終わるたびに重み付きで次を選びます（デフォルト：待機 10 ／散歩 5 ／振り向き 3 ／小さな動作 6、設定可能）。同じ小さな動作は連続しません
- **アクション動画**：AI 生成の透過アクション動画 20 本以上（手の動きと全身の動き）。静止立ち絵と同じサイズ、足元も同じラインなので切り替えはシームレス。動画が読み込まれるまで立ち絵を消さないので、白くちらつきません
- **自然な細部**：2〜6 秒ごとにランダムにまばたき、ときどき 2 回連続で。吹き出しの文字数に合わせて口が動きます。脚は別レイヤーで、歩くと交互に上がり、ジャンプでは引き寄せ、つままれると自然に垂れます
- **常に左右に揺れない**：すべての動作は上下の弾みと伸縮だけ。安定していて酔いません
- **画面内のお散歩**：向いている方向に歩き、作業領域の端で振り向きます
- **クリック／ドラッグ／投げる**：クリックでぷるんと弾み、ちょっとした反応（うれしい／照れる／目が回る）をして、Claude Code が考えた一言を返します。ドラッグは減衰ばねでカーソルに追従。投げると放物線を描き、端で跳ね返り、着地は摩擦で止まってきゅっとつぶれます。強く投げすぎると目を回します
- **マルチモニター越え**：投げたとき、ほかの画面と接している側（上／下／左／右）では跳ね返らず、そのまま飛び越え・落ちていき、最終的にいちばん下の画面の床に着地します
- **画面の枠にしがみつく**：画面の左・右・上の枠の近くまでドラッグして離すと（強く投げた場合は除く）、離した位置から一番近い枠にくっついて、その枠用のポーズになります——左右は画面の端につかまって陰から顔を出し（離したときの高さのまま。宙に浮いているときは脚がフェードアウト）、上は上の枠につかまってぶら下がり、下をのぞきます（左右の位置はそのまま、吹き出しは下に）。散歩で左右の端に着いたときも 30% の確率でしがみつきます。しがみついている間もクリック（顔と頭で反応が違う）・会話・作業状態の表示はそのまま。1〜4 分で自分で降り、ドラッグしても降ります（`edge` 設定）。小さな動作「趴着看你」では、タスクバーの上にうつ伏せになってこちらを見上げます。4 枚のポーズ画像は豆包で生成し、`python scripts/make_sprite.py pet-edge-left`（`pet-edge-right` / `pet-edge-top` / `pet-lie`）で切り抜いています
- **複数起動と衝突**：何匹も同時に飼えます（設定の「+ 添加宠物」）。それぞれ名前・サイズ・位置・人格・会話の記憶を持ちます。投げたペットはほかのペットと弾性衝突し、ぶつけられた側も吹っ飛びます（`physics.petCollision` でオフにできます）
- **設定ウィンドウ**：右クリック／トレイの「设置…」（設定）で、ペット一覧・スイッチ・ひとりごとの間隔・物理パラメーターを GUI で変更。保存するとすぐ反映されます
- **Claude Code の作業状態に連動**：考え中／コーディング／承認待ち／記憶の整理／お祝い／エラー の 6 段階アニメーション + 常駐吹き出し（次の節を参照）
- **システム通知**：承認が必要なとき、返信待ちのとき、長いタスクが終わったときに Windows 通知（ヘッダーに「小橙」とアイコン）
- **ひとりごとと会話**：ランダムなタイミング、小さな動作の最中、Claude Code のイベント後に、Claude Code を呼んでひとりごとをつぶやきます。右クリック「和我聊天…」（おしゃべり）で会話でき、記憶は保存されます
- **右クリックメニュー／トレイ**：「动作 → カテゴリ → アクション」で好きな動作を再生。作業状態への連動／お散歩／通知のオンオフ、まだ接続していなければワンクリックで Claude Code に接続（hooks をインストール）。終了時には手を振って「拜拜，下次见~」（バイバイ、またね）と言います
- **アクセシビリティ**：`prefers-reduced-motion` に対応（視差効果を減らす設定では大きな移動とつぶれを省きます）

## ⚙️ 作業状態の連動（Claude Code hooks）

| hook イベント | 小橙の反応 |
|---|---|
| `SessionStart` | 手を振って：「新しいセッションだ、いくよ！」 |
| `UserPromptSubmit` | ほおづえで考え込み、髪のひまわりが回る：「ちょっと考えさせて…」 |
| `PreToolUse` | パソコンを叩き、吹き出しで何を手伝っているかを彼女自身の言葉で言います（例「README をめくって場所を探してるよ～」。コマンドやツール名は読み上げません。下記参照） |
| `PostToolUse` | 結果をじっくり検討中… |
| `Notification` | 手を挙げて「？」：「承認してほしいな！」／「返事を待ってるよ~」、さらにシステム通知 |
| `PreCompact` | 記憶の整理 |
| `Stop` | `celebrateChance`（デフォルト 30%）の確率で紙吹雪でお祝い「できた！」。毎ターンではありません。1 ターンが `notifyMinBusySec`（デフォルト 20 秒）を超えたら「Claude が完了しました（N 秒）」と通知 |
| `PostToolUseFailure` / `StopFailure` | バツ目で冷や汗「ちょっと失敗、もう一回」 |
| `SessionEnd` | 「またね~」 |

- **吹き出しで彼女の言葉で進み具合を表示**：吹き出しには彼女自身のひと言だけが入ります（プロジェクトフォルダーは出しません）。Claude がいましていること（最新の発言や使っているツール）を Claude Code に一人称の話し言葉へ言い換えさせたものです（例「我要重启一下，马上就能开口说话啦～」）。コマンド・コード・英語のパスは出ません。使用量節約のため言い換えは最低 `statusVoice.minIntervalSec` 秒（デフォルト 20 秒）空け、準備できるまでは代わりの話し言葉（「在终端里敲敲打打…」「翻翻 README.md 看看～」）を表示します。`statusVoice.enabled=false` なら代わりの言葉だけを使います
- **複数セッションの並行**：セッションごとに状態を持ち、いちばん注意が必要なものを表示します（承認待ち > 整理 > 作業／考え中）。10 分間動きのないセッションは自動で消えます
- **文言は変更可能**：`statusTexts` で項目ごとに上書き（キーは `src/shared/status.js` の `DEFAULT_TEXTS`）
- **自分には反応しない**：ペット自身が `claude` を呼ぶときは `CLAUDE_PET_INTERNAL=1` を付けるので、hook は無視します

## ⚙️ ひとりごとと会話

- **ひとりごと**：毎回ローカルの Claude Code（`claude -p`）を呼んでその場でランダムに生成します。**固定のセリフはありません**：話題をランダムに選び、現在時刻を踏まえ、最近言ったことは避けます。呼び出しに失敗したら（未ログイン、タイムアウト）その一言は言いません
- **いつしゃべるか**（手動のきっかけはなく、すべて自然に出てきます）：
  - **ランダムな時間**：言い終わるたびに `minSec`〜`maxSec`（デフォルト 3〜10 分）の間でランダムに待ちます
  - **小さな動作の最中**：クッキーを食べる、本を読む、シャボン玉を吹く……`actionChance`（デフォルト 30%）の確率で、その動作にちなんだ一言
  - **Claude Code のイベント後**：新しいセッション、タスク完了、エラー——`eventChance`（デフォルト 50%）の確率で数秒後にコメント
  - **クリックされたとき**：毎回必ず返事をし、**クリックした場所によって内容が変わります**——ひまわり、リボン、頭、ほっぺ、長い髪、手、ボウタイ、腰、スカート、脚、靴、それぞれに状況と小さな反応があります（部位の区分は `src/shared/bodyparts.js`）。連続でクリックすると何回つつかれたか分かります
  - **アクションの指定**：右クリック「动作」や `POST /play` で動作をさせると、必ずその動作にちなんだ一言を言います
  - **定時**：`schedule` の時刻になると指定の動作をし、Claude Code が状況に合わせてその場で一言を生成します（デフォルト：平日 9:30 出勤でコーヒー、12:00 昼食と 19:00 夕食に火鍋、平日 20:20 退勤でダンス）
  - 一言と一言の間は最低 `cooldownSec`（デフォルト 60 秒）空けます。会話中・作業状態に連動中・つままれている間はしゃべりません（クリックはこの間隔の対象外）
- **会話**：右クリック「和我聊天…」で入力欄が開き、Enter で送信、Esc で閉じます。返事はおしゃべりアニメーション + 吹き出しで。直近 `brain.memoryRounds` 往復（デフォルト 6）をリクエストに含め、全履歴は `~/.claude-pet/memory.json` に保存されます
- **誰の頭脳を使うか**（`brain.provider`、デフォルト `auto`）：
  - `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` がある → Anthropic API（モデルは `brain.apiModel`、従量課金）
  - ない → ローカルの `claude -p` を呼び、**あなた自身の Claude Code ログインを使います**。サブスクリプションと使用量を共有し、キーは不要です
- **2 種類のインストール方法に対応**：ネイティブインストールの `claude.exe` と npm グローバルインストールの `claude.cmd` を自動で認識します。`PATH` にない場合は `~/.local/bin`、`%APPDATA%\npm` など一般的なディレクトリも探します。環境変数 `CLAUDE_PET_CLAUDE` で CLI のパスを直接指定することもできます
- **ログインの案内**：ローカルの Claude Code が未ログイン、またはログインが期限切れのときは、吹き出しで `claude auth login` を実行するよう案内します。Claude デスクトップアプリとコマンドラインのログインは別物なので、コマンドラインは独立したターミナルで一度ログインする必要があります
- **使用量の上限**：Claude Code が「You've hit your session limit · resets 9:10pm」のようなエラーを返すと、すべてのペットが呼び出しを止めます。リセット時刻まではひとりごとを静かにスキップし、会話にはすぐ「额度用完啦，21:10 恢复~」（使用量切れ、21:10 に回復）と返して、`claude` を無駄に何度も実行しません。上限に達した瞬間はすべてのペットが居眠りして回復時刻を告げ、時刻になると伸びをして全回復を報告します（動作とセリフは `limit` 設定で変更可。このときは Claude Code を呼べないので、この 2 つは用意済みのセリフからランダムに選びます）
- **記憶チェーン：使うほどあなたを分かっていく**：どのプロジェクトで・いつ Claude Code を使い・何を頼んだか（プロンプトは先頭 80 文字だけ）、彼女と何を話したか、どこをよくクリックするか、どんな動作をよく頼むかを記録します。ある程度たまると Claude Code に「あなたについて知っていること」（好み／習慣／プロジェクト／事実／付き合い方、最大 30 件）へ整理させ、今も正しいものは残し、古いものは直し、新しい発見を加えます。整理のたびに記憶チェーンに 1 つ輪が増え（何を覚え、何を忘れたか、彼女のひと言）、新しく分かったことがあると彼女の言葉で教えてくれます。記憶は会話とひとりごとに使われるので、使うほどあなたを分かってくれます。右クリック「记忆链」で、覚えていることの確認・今すぐ整理・オフ・全部忘れさせることができます。データはこのマシンの `~/.claude-pet/memory-chain.json` だけに保存され、全ペットで共有します
  - **仕事の習慣と生活リズム**：整理しても消えない生活リズムの統計も積み上げます。毎日はじめて／最後に Claude Code を使ったり彼女と関わったりした時刻（朝 5 時前は前日の夜更かし扱い）、時間帯・曜日ごとの活発さです。整理のときこれをもとに「平日は何時ごろ始めて何時ごろ終わるか、夜更かしするか、昼休みを取るか、週末は忙しいか、午後は何時が一番忙しいか」といった記憶を書きます。初回起動時には Claude Code のセッション記録（`~/.claude/projects`）から直近 60 日分を補完します——送ったメッセージの時刻とプロジェクト名だけで、内容は読みません——補完後すぐ整理するので、入れたその日から生活リズムを知っています
- **人格**：`brain.persona` がデフォルトの人格で、ペットごとに `persona` で上書きできます。実際のシステムプロンプトには名前と現在時刻が自動で追加されます

## 🔌 外部 API

ペットは `127.0.0.1:7341`（`port` で変更可）でローカル HTTP サーバーを開いています。認証なし、ローカルのみで待ち受け。Claude Code hooks はここを通り、ほかのスクリプトやツールからも小橙を操作できます：

| エンドポイント | 内容 |
|---|---|
| `GET /health` | 死活確認 |
| `GET /state` | 現在の動作、向き、ウィンドウ位置、吹き出し、作業状態、hooks の有無、会話チャネル |
| `POST /hook` | Claude Code hook のペイロード（`hooks/claude-pet-hook.mjs` が転送） |
| `POST /say {text, ttl?}` | 一言しゃべらせる（`ttl` はミリ秒、0 = 表示し続ける） |
| `POST /play {action}` | 動作を再生（組み込みの動作名は `src/shared/behavior.js`、動画アクションはファイル名） |
| `POST /chat {text}` | 会話し、`{reply}` を返す |
| `POST /settings` | 設定ウィンドウを開く |
| 任意のエンドポイントに `?pet=<id>`（または body に `pet`） | 対象のペットを指定。デフォルトは 1 匹目 |
| `POST /throw {vx, vy}` | 指定の初速（px/s）で投げる |
| `POST /edge {side}` | 画面の端に寝そべらせる（`left` / `right` / `top`）。`null` で降りる |
| `POST /rename {name}` | 名前を変える（右クリック「给我改名字…」と同じ） |
| `GET /memory` | 覚えていること：記憶の項目、記憶チェーン、生活リズムの要約 |
| `POST /memory/consolidate` | 今すぐ記憶を整理させる |

```sh
curl -s -X POST 127.0.0.1:7341/say  -H "content-type: application/json" -d '{"text":"ビルド成功！"}'
curl -s -X POST 127.0.0.1:7341/play -H "content-type: application/json" -d '{"action":"吃冰淇淋"}'
```

## ⚙️ 設定

デフォルト値は [`config.jsonc`](config.jsonc)（全項目にコメント付き）。**このファイルは編集しないでください**——`~/.claude-pet/config.jsonc` に変えたい項目だけを書きます（オブジェクトはキーごとにマージ、配列／スカラーは丸ごと置き換え）。書いたらペットを再起動すると反映されます。よく使う項目の多くは右クリック「设置…」（設定）でも変更でき、保存するとすぐ反映されます。

| 項目 | 説明 |
|---|---|
| `pets` | ペット一覧。各 `{id, name, size, position, offsetX, offsetY, workStatusEnabled, whisperEnabled, fixed, persona}`。1 匹目のデフォルト名は「小橙」で、通知のヘッダーにはその名前が表示されます。旧版のトップレベル `name` / `size` は自動で 1 匹目に移行されます |
| `autoStart` | Claude デスクトップアプリや Claude Code CLI（ネイティブの `claude.exe`、npm 版どちらも）を起動するたびに、ペットが動いていなければ自動で呼び起こします（以前に手動で終了していても）。デフォルトでオン。右クリック「打开 Claude 时自动启动」で切り替え。ログイン時に起動する見張りプロセスが担当し、Windows ではプロセス起動イベントを購読します（`claude --version` のような一瞬で終わるものは対象外） |
| `pets[].size` / `position` / `offsetX` / `offsetY` | 立ち絵の高さ（デフォルト 200、dsh-pet のメイドと同じ）、初期位置の角とオフセット |
| `animationWeights` / `roam` / `walkSpeed` | アニメーションチェーンの重み、お散歩するか、歩く速さ |
| `edge` | 画面の端に寝そべる：`enabled`、`walkChance`（散歩で端に着いたとき寝そべる確率、デフォルト 0.3）、`minStaySec` / `maxStaySec`（寝そべる時間、デフォルト 60〜240 秒） |
| `idleAnimation` | 待機中のランダムな小さな動作：`{enabled, minSec, maxSec}`。小さな動作が終わるたびに `minSec`〜`maxSec` 秒（デフォルト 15〜45）後、次をランダムに再生。オンのときは小さな動作の頻度はこれだけで決まります。設定ウィンドウでも変更可 |
| `physics` | 重力、反発係数、地面の摩擦、投げる強さ、ペット同士の衝突 `petCollision`。`stayAfterDrag`：ドラッグして離した場所にそのまま留まり、投げ飛ばしも落下もしない（設定ウィンドウか右クリック「拖动后停在原地」で切り替え） |
| `workStatusEnabled` / `notificationsEnabled` / `notifyMinBusySec` / `celebrateChance` / `statusTexts` | 作業状態への連動と通知。`celebrateChance` はターン完了時にお祝いする確率（0〜1、デフォルト 0.3。設定ウィンドウではパーセントで変更） |
| `whisper` / `brain` | ひとりごとと会話 |
| `schedule` | 定時アクション（時刻、動作、状況、曜日） |
| `statusVoice` | 作業状態の吹き出しの口調：`enabled`、`minIntervalSec`（言い換えの最短間隔、デフォルト 20 秒） |
| `memory` | 記憶チェーン：`enabled`、`observePrompts`（Claude への依頼内容を記録するか）、`consolidateEvery`（整理に必要なポイント。観察 1、会話 3、デフォルト 12）、`minIntervalMin`、`maxItems` など |
| `limit` | 使用量が切れたとき／回復したときの動作とセリフ（`{name}`、`{reset}` のプレースホルダー） |

## 互換性

- **OS**：**Windows 11** で開発・実機検証。Electron とコアロジックはクロスプラットフォームなので macOS / Linux でも理論上は動きますが未検証です（スタートメニューのショートカットと通知の ID は Windows 専用で、ほかのプラットフォームでは自動でスキップ）
- **Claude Code**：`2.1.x` で検証。使用する hook イベントはすべて公式のもの。ネイティブインストール（`claude.exe`）と npm グローバルインストール（`claude.cmd`）のどちらからも呼び出せます
- **マルチモニター**：上下／左右に隣接する複数画面に対応し、画面をまたいで投げられます。DPI の異なる画面の座標は Electron が換算します
- **dsh-pet との共存**：同時に起動でき、2 匹は互いに干渉しません。dsh-pet がダウンロードした Electron を共用できます

## プレビュー

すべてのアクション動画（GIF プレビューは `assets/preview/` にあり、`python scripts/make_previews.py` で生成。実際に再生されるのは `assets/webm/` の透過 VP9 動画）：

**日常**

<p>
  <img src="assets/preview/idle.gif" width="140" alt="待機の呼吸" title="待機の呼吸">
  <img src="assets/preview/walk.gif" width="140" alt="お散歩" title="お散歩">
  <img src="assets/preview/look.gif" width="140" alt="きょろきょろ" title="きょろきょろ">
  <img src="assets/preview/stretch.gif" width="140" alt="伸び" title="伸び">
  <img src="assets/preview/sleep.gif" width="140" alt="居眠り" title="居眠り">
</p>

**あそび**

<p>
  <img src="assets/preview/spin.gif" width="140" alt="その場でジャンプして拍手" title="その場でジャンプして拍手">
  <img src="assets/preview/dance.gif" width="140" alt="ダンス" title="ダンス">
  <img src="assets/preview/sing.gif" width="140" alt="鼻歌" title="鼻歌">
  <img src="assets/preview/吹泡泡.gif" width="140" alt="シャボン玉" title="シャボン玉">
  <img src="assets/preview/玩魔方.gif" width="140" alt="ルービックキューブ" title="ルービックキューブ">
  <img src="assets/preview/纸飞机.gif" width="140" alt="紙飛行機" title="紙飛行機">
  <img src="assets/preview/抱玩偶.gif" width="140" alt="星のぬいぐるみを抱っこ" title="星のぬいぐるみを抱っこ">
</p>

**食べたり飲んだり、日々のこと**

<p>
  <img src="assets/preview/eat.gif" width="140" alt="クッキーを食べる" title="クッキーを食べる">
  <img src="assets/preview/coffee.gif" width="140" alt="コーヒーを飲む" title="コーヒーを飲む">
  <img src="assets/preview/吃冰淇淋.gif" width="140" alt="アイスを食べる" title="アイスを食べる">
  <img src="assets/preview/煮火锅.gif" width="140" alt="火鍋を煮る" title="火鍋を煮る">
  <img src="assets/preview/read.gif" width="140" alt="読書" title="読書">
  <img src="assets/preview/写日记.gif" width="140" alt="日記を書く" title="日記を書く">
</p>

**クリックへの反応**

<p>
  <img src="assets/preview/click-happy.gif" width="140" alt="うれしい" title="うれしい">
  <img src="assets/preview/click-shy.gif" width="140" alt="照れる" title="照れる">
</p>

**作業状態**（Claude Code のセッションに連動）

<p>
  <img src="assets/preview/think.gif" width="140" alt="考え中" title="考え中">
  <img src="assets/preview/wait.gif" width="140" alt="承認待ち" title="承認待ち">
  <img src="assets/preview/organize.gif" width="140" alt="記憶の整理" title="記憶の整理">
  <img src="assets/preview/success.gif" width="140" alt="お祝い" title="お祝い">
  <img src="assets/preview/error.gif" width="140" alt="エラー" title="エラー">
</p>

> 注：「コーディング」（`work`）と「手を振る」（`wave`）の 2 本は生成時にカメラが寄ってしまい、キャラクターの大きさが安定しないため、作り直し待ちで今は載せていません。

## 自分だけのペットをゼロから作る

**① 立ち絵 → 透過の静止画**

```sh
python scripts/make_sprite.py      # assets/source/sticker.webp → assets/sprite/
```

四辺から塗りつぶしで背景を抜き（ステッカーの縁取りの外で止まる）、ウォーターマークを消し、縁の白を取り除き、高さ 900px に切り抜き・縮小したうえで、髪飾りの花（考え中に回る）とトレイアイコンを切り出し、スカートの裾で両脚を独立したレイヤーに分けます。手で測る座標はすべてスクリプト冒頭の `POSES` にあります。立ち絵を差し替えたら、`src/renderer/index.html` の重ねレイヤー（目、口、ほお紅、小道具）の座標も測り直してください。

**② プロンプト + グリーンバックの参照フレーム → AI アクション動画**

- プロンプト：[`docs/动作视频提示词.md`](docs/动作视频提示词.md)（共通の前置き + 各動作を秒単位で分解：その場から動かない、体を左右に揺らさない、小道具は「なし→あり→なし」、最初と最後は標準の立ち姿に戻る）
- 最初のフレーム：[`assets/source/reference-green.png`](assets/source/reference-green.png)（純粋な #00FF00 グリーンバック、大きさと位置は統一）
- 即夢（Jimeng）／豆包（Doubao）などの「画像から動画」で 16:9・10 秒の動画を生成し、動作名で `assets/video/<動作名>.mp4` に保存

**③ グリーンバック動画 → 透過 webm**

```sh
npm run video                       # すべて。または python scripts/make_video.py work.mp4 wave.mp4
```

ウォーターマーク除去 → HSV の色相判定でグリーンバックを抜く（青／白／オレンジは決して抜かない）→ 足とつながったキャラクター本体だけを測って（エフェクトは含めない）レイアウトを決定 → 640×360 VP9 + アルファ。レイアウトは dsh-pet と同じ（立ち姿の高さ 900/1215、足元 1115/1215）で、立ち絵とシームレスに切り替わります。カメラの寄り引きや動作のはみ出しなどの問題も知らせます。libvpx 付きの ffmpeg が必要です（`winget install Gyan.FFmpeg`、または `pip install imageio-ffmpeg`）。

- **ファイル名が組み込みの動作名**（`idle`、`eat`、`think`……）→ その動作の映像を差し替え、長さは動画に従います
- **ファイル名がそれ以外**（`吃冰淇淋`……）→ 自動で新しいくつろぎ動作になり、ランダムなアニメーションチェーンと右クリック「动作 → 视频动作」に加わります
- `~/.claude-pet/webm/` に置いた動画はこのマシンでのみ有効で、プロジェクト内のものより優先されます

## プロジェクト構成

```
claude-pet/
├── README.md  config.jsonc  package.json
├── docs/动作视频提示词.md        # ① アクション動画のプロンプトレシピ
├── assets/
│   ├── source/                   # 元の立ち絵 + グリーンバック参照フレーム
│   ├── sprite/                   # 切り抜いた立ち絵（全体／体／脚）、髪飾りの花、アイコン
│   ├── video/                    # AI 生成のグリーンバック動画（入力）
│   ├── webm/                     # 透過アクション動画（出力、実際に再生）
│   └── preview/                  # README 用の GIF プレビュー
├── scripts/                      # ② 素材パイプラインとツール
│   ├── make_sprite.py            #    立ち絵の切り抜き、レイヤー分け
│   ├── make_video.py             #    グリーンバック動画 → 透過 webm
│   ├── make_previews.py          #    webm → プレビュー GIF
│   ├── start.mjs                 #    起動（Electron を探す）
│   └── hooks.mjs                 #    Claude Code hooks のインストール／アンインストール
├── hooks/claude-pet-hook.mjs     # Claude Code hook の転送スクリプト
├── src/                          # ③ デスクトップペット
│   ├── main/                     #    Electron メインプロセス：ウィンドウと行動の制御、HTTP API、会話、設定、hooks のインストール
│   ├── renderer/                 #    描画：立ち絵／動画／重ねレイヤー／吹き出し／入力欄
│   ├── shared/                   #    純粋なロジック：物理、アニメーションチェーン、マルチモニターの境界、hook → 状態、表情のリズム、JSONC
│   └── preload.cjs
└── test/                         # node --test + Python のユニットテスト
```

## テスト

```sh
npm test          # JS：物理、アニメーションチェーン、マルチモニターの境界、hook の状態機械、hooks のインストール、表情のリズム……
npm run test:py   # Python：キーイング、ウォーターマーク除去、レイアウト合わせ、カメラの寄り引き検出（ffmpeg 不要）
```

## パッケージ化

```sh
npm run dist      # → dist/claude-pet-Setup-<バージョン>.exe（ローカルの Electron を再利用。設定は package.json の build）
```

## ライセンス

- コード：MIT
- **キャラクター**：小橙の立ち絵とアクション動画は AI（豆包／即夢）で生成したもので、**Anthropic 公式のキャラクターではありません**。本プロジェクトは Anthropic とは無関係です
- **謝辞**：プロジェクト構成、素材パイプライン、インタラクションデザインは [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT）を参考にしています
