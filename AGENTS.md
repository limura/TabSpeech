# AGENTS.md

このファイルは、このリポジトリで作業するコーディングエージェント(Claude Code / Codex 等)向けのガイドです。

TabSpeech は、表示中のタブの本文を Web Speech API で読み上げる Manifest V3 の Chrome 拡張です。ビルド工程・テスト・lint・パッケージマネージャは無く、`TabSpeech/` 配下の素の JS/HTML をブラウザが直接読み込みます。

## 開発コマンド

- **拡張の読み込み**: `chrome://extensions` → デベロッパーモード ON → 「パッケージ化されていない拡張機能を読み込む」で **`TabSpeech/` サブディレクトリ**(リポジトリルートではなく manifest.json のある方)を選ぶ。
- **変更の反映**: service worker / content script を編集したら拡張を再読み込みする。content script の変更は対象タブのリロードも必要。
- **ストア用 zip 作成**: `sh makeZip.sh`(`TabSpeech/` を `TabSpeech.zip` に固める。`zip` コマンドが必要)。
- **バージョン更新**: `TabSpeech/manifest.json` の `version` を上げ、`README.md` の「更新履歴」に追記する(リリースのたびに両方更新するのが慣例)。
- **デバッグ**: service worker は `chrome://extensions` の「service worker」リンクから専用 DevTools を開く。offscreen ドキュメントと content script はそれぞれのコンソールに出力。コード内の `console.log` は多くがコメントアウトされているので、調査時は適宜外す。
- **Safari / iOS・iPadOS での確認**: Safari Web Extension 用の Xcode プロジェクトがリポジトリ外の `../xcode/TabSpeech` にある(変換ツール生成・git 管理外)。拡張の実体はその `Shared (Extension)/Resources/` で、`sh syncToXcode.sh`(リポジトリルート)で `TabSpeech/` の中身をそこへ同期してから Xcode でビルドする。**注意: Safari は service worker / 拡張リソースを強くキャッシュする**ため、コードを差し替えても古い版が動き続け「バックグラウンドコンテンツを読み込めませんでした」等が出ることがある。反映されない時は **Safari を完全終了(mac は ⌘Q、iOS は App スイッチャーから終了)し、拡張を一度オフ→オン**してから再読み込みする(Chrome の再読み込み一発とは勝手が違う)。iOS のデバッグは端末を Mac に有線接続し、Mac の Safari「開発」メニュー →[端末名]から各コンテキスト(ページ=content script / service worker / ポップアップ)の Web インスペクタを開く。

リポジトリルートには README/TODO/LICENSE/makeZip.sh/syncToXcode.sh/ScreenShot があり、**読み込み可能な拡張本体は `TabSpeech/` サブフォルダ**にある、という構成に注意。

## アーキテクチャ(複数ファイルにまたがる全体像)

4 つの実行コンテキストがメッセージパッシングで連携する。**「実際に音声を発話するのはどこか」** が最大の非自明ポイント。

| コンテキスト | ファイル | 役割 |
|---|---|---|
| Service Worker | `background.js` | 全体の司令塔。設定・SiteInfo・読み替え辞書を集めて各所へ中継 |
| Content Script | `contentScript.js` | ページ内で本文抽出・読み上げ位置算出・ハイライト・スクロール |
| Offscreen Document | `speechSynthesis.html` / `speechSynthesis.js` | 実際に `speechSynthesis.speak()` を実行する場所 |
| Popup / Options | `popup.{html,js}` / `options.{html,js}` | ボタン UI と設定画面 |

### 発話フロー(最重要)

1. 起動トリガ(後述)で `background.js` の `RunStartSpeech()` が走り、`chrome.storage.local` から音声設定・SiteInfo(URL ごとの本文 XPath)・読み替え辞書を集めて、対象タブの content script へ `KickSpeech` / `KickSpeechRepeatMode` / `KickSpeechOnlySelected` を送る。
2. `contentScript.js` が SiteInfo の `pageElement` XPath(無ければ `//body`)で読み上げ対象 Element を抽出し、選択範囲から開始位置を決め、読み替えを適用したテキストを作って、`StartSpeech` メッセージを background へ返す。
3. **content script で直接 `window.speechSynthesis` を呼ぶとユーザー操作前は `not-allowed` で失敗する**ため、background は offscreen ドキュメント(`speechSynthesis.html`)を生成してテキストを転送する。
4. `speechSynthesis.js`(offscreen)が `speechSynthesis.speak()` を実行し、`onboundary` / `onend` を background 経由で content script に返す(offscreen→background が `OnBoundary` / `EndSpeech`、background→content が `Speech_OnBoundary` / `Speech_OnEnd` に変換して再配信)。
5. content script は boundary イベントで現在発話中の文を Selection/Range でハイライトし、オートスクロールする。

つまり発話エンジンは **offscreen ドキュメント上**で動く(Safari 等のフォールバック時のみ content script 上)。**かつて存在した `chrome.tts` を使う `RunSpeechOnServiceWorker` 経路はリファクタ(フェーズ4a)で削除済み**で、発話バックエンドは「offscreen(Chrome 系)」と「content script(Safari/タッチ端末)」の 2 つだけ。

注意点:
- offscreen の生成理由は `['AUDIO_PLAYBACK', 'WORKERS']`。`AUDIO_PLAYBACK` 単独だと約 30 秒で offscreen が無反応になるため `WORKERS` を足している(`setupOffscreenDocument` のコメント参照)。
- **Safari 等で `chrome.offscreen` が無い場合**のフォールバックとして、background は `Speech_StartOnContentScript` を送り、content script が `StartSpeechByContentScript` で直接発話する。

### メッセージ種別(コンテキスト間プロトコル)

メッセージ駆動なので、`type` 文字列とその流れる向きを把握するのが読解の鍵。

- **background `onMessage`**(content / offscreen から): `StartSpeech`(content から → offscreen 生成 or フォールバック)、`EndSpeech`(offscreen から → content へ中継し offscreen を閉じる)、`OnBoundary`(offscreen から → content へ中継)、`RunStartSpeech`/`RunStopSpeech`/`RunPauseSpeech`/`RunResumeSpeech`(popup・2 ボタンジェスチャ・FAB・2 本指タップから)、`KickSpeechRepeatMode`、`onRemoved`(content の beforeunload から → offscreen にタブ消滅を通知)。
- **content `onMessage`**(background から): `KickSpeech`/`KickSpeechRepeatMode`/`KickSpeechOnlySelected`、`StopSpeech`/`PauseSpeech`/`ResumeSpeech`、`Speech_OnBoundary`/`Speech_OnEnd`、`Speech_StartOnContentScript`(フォールバック発話)。
- **offscreen `onMessage`**(background から): `StartSpeech`/`StopSpeech`/`TabClosed`。

### 起動トリガ

- キーボードショートカット: `chrome.commands`(`start-speech`/`stop-speech`/`pause-speech`/`resume-speech`、ユーザーが `chrome://extensions/shortcuts` で割り当てるまで無効)。
- popup のボタン(開始/停止/中断/再開/繰り返し開始/設定)。
- 右クリックメニュー: 「選択範囲のみ読み上げ」(selection)と「ここから読み上げ」(page)。`install` 時に作成。
- **2 ボタン同時押しジェスチャ**: `startSpeechClickTarget`/`stopSpeechClickTarget` に `mousedown` の `ev.buttons` ビットマスク値(3=左+右, 5=左+中, 6=右+中)を保存し、content script が一致時に開始/停止する(該当時は contextmenu も抑止)。
- **フローティングボタン(FAB)/ 2 本指タップ**(`contentScript.js` 末尾): iOS・iPadOS の Safari や Firefox for Android 等タッチ端末向けトリガ。`matchMedia('(hover: none) and (pointer: coarse)')` でタッチ主体端末を判定。`fabDisplayMode`(`auto`/`always`/`selection`/`hidden`)と `touchGestureMode`(`auto`/`on`/`off`)で出し分け、既定の `auto` は **タッチ端末で表示・有効 / PC で非表示・無効**。FAB は Shadow DOM 内に置き本文抽出(`//body`)に混ざらないようにする。開始/停止は既存と同じ `RunStartSpeech`/`RunStopSpeech` を background へ送るだけ(開始位置は選択範囲から決まる)。FAB・2 本指タップとも開始/停止のトグル(マウスジェスチャは開始固定/停止固定だが、こちらは入力手段の制約上トグルで統一)。iOS は発話にユーザー操作が必須なため、タップ時に無音発話でエンジンを解錠する(`primeSpeechSynthesis`)。`forceTextSelection` で選択禁止ページでも選択可にできる。

### SiteInfo(AutoPagerize 形式)

- background が起動時に TSV の SiteInfo データベース(`kotosekaiSiteInfoTSVURL`、Google スプレッドシート公開 TSV)を取得。URL 正規表現ごとに本文 `pageElement`(XPath)と `url` を定義する。**かつては wedata.net 由来だったが廃止**された(README の Version 2.1.1 参照)。1 時間(`expireMillisecond`)キャッシュし、`SearchSiteInfo` が URL を正規表現でマッチ(URL が長い順にソート)。
- **AutoPagerize 継続読み上げ**: `isAutopagerizeContinueEnabled` が ON のとき、発話終了後に `CheckAutopagerizedContentAlive` で追記分を検出して続けて読む。

### 読み替え辞書

- ユーザー設定 URL から「通常」と「正規表現」2 種の辞書を取得(既定は空。元は wedata)。wedata JSON 形式 `{data:{from,to}}`。
- `GenerateSpeechTextHints` が最長一致で `[{before, after}]` ペア列を作り、表示テキスト(before)と発話テキスト(after)を分離する。boundary の発話側 index を表示側 index に戻すのが `SpeechTextIndexToDisplayTextIndex`(ハイライト位置合わせ用)。

## 設定とストレージの落とし穴

- 設定はすべて `chrome.storage.local` に保存。主なキー: `lang` `voice` `extensionId` `pitch` `rate` `volume` `isScrollEnabled` `scrollPositionRatio` `isAutopagerizeContinueEnabled` `convertTableURL` `regexpConvertTableURL` `startSpeechClickTarget` `stopSpeechClickTarget` `isDelayAutoScrollEnabled` `fabDisplayMode` `touchGestureMode` `forceTextSelection`。キャッシュ系: `siteInfo` `siteInfoFetchMillisecond` `convertTable` `regexpConvertTable` `convertTableFetchMillisecond` `currentSpeechTabId` `migrateFromLocalStorage`。
- **boolean は文字列 `"true"`/`"false"` で保存している**(`chrome.storage.local` に boolean が安定して入らないため、というコード上の判断)。比較も文字列で行うこと。
- 旧 `window.localStorage` から `chrome.storage.local` への移行が `options.js` の `migrateFromLocalStorage()` にある。未移行のまま `install` するとオプションページが自動で開く。

## 国際化

- 文言は `TabSpeech/_locales/<locale>/messages.json`(`en` / `ja` / `zh_CN` / `zh_TW`)。`default_locale` は `en`。
- 参照方法: JS では `chrome.i18n.getMessage("Key")`、HTML では `data-i18n-text` / `data-i18n-value` 属性(`localizeHtmlPage()` が流し込む)。
- 文言を増やすときは原則 4 ロケールすべてに追加する。

## 規約

- README・TODO・コミットメッセージ・コードコメントはすべて日本語。新規の文言も日本語で揃える。
