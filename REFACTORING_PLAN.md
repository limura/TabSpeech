# TabSpeech リファクタリング計画

このドキュメントは、複数世代の「やっつけ移行」で混乱した発話まわりのコードを、
役割を固定したきれいな形に整理するための計画書です。

---

## 進捗(2026-06-02 時点)

フェーズ1〜4 まで完了。各フェーズは Chrome DevTools MCP で検証のうえ master に個別コミット済み。

- ✅ **フェーズ1**: 発話まわりの死にコード削除(chrome.tts 系・旧 pageAction・空 status 等)。挙動不変。
- ✅ **フェーズ2**: 停止/中断/再開を offscreen にも届ける(「停止しても止まらない」既存バグの修正)+ Safari フォールバックの `request.tab.id` バグ修正。
- ✅ **フェーズ3**: メッセージ名 `SpeechOnServiceWorker_*` → `Speech_*` に改名、バックエンド選択を `isOffscreenSpeechBackendAvailable()` に集約、offscreen の target ガード追加(二重発話防止)。
- ✅ **フェーズ4a**: 発話エンジンを `window.speechSynthesis` に統一(オプションのテスト再生・声一覧も)、`chrome.tts` と `tts` パーミッション・`extensionId` を廃止。
- ⏭️ **フェーズ4b(重複関数の共有ファイル化)**: 見送り。content/offscreen 間の小さな重複は拡張のマルチコンテキスト構造に由来する自然なもので、全ページへの util 注入を増やす代償に見合わないと判断。
- ⏳ **Safari 実機確認**: 未実施。Windows 環境のため、ユーザーの Mac で別途確認する(下記フェーズ2の Safari 項目)。

---

## 0. ゴール

- 「発話を実際にどこで実行しているか」を一本化し、誰が読んでも追える状態にする。
- Chrome(offscreen)と Safari(content script 直接)の **両対応**を、1つの抽象でまかなう。
- 過去世代(content script 直接発話 / service worker の `chrome.tts`)の残骸を削除する。
- 挙動を変えずに消せるものから順に、段階的に進める。

---

## 1. 現状の整理(なぜ混乱しているか)

発話方法は歴史的に4世代あり、コードに痕跡が混在している。

| 世代 | 発話方法 | 今コードのどこに残っているか | 状態 |
|---|---|---|---|
| ① 最初 | content script の `window.speechSynthesis` | `StartSpeechByContentScript` / `SpeechWithPageElementArray` 内の `//speechSynthesis.speak()` | ほぼ死。Safari 用残骸 |
| ② SW導入前後 | service worker の `chrome.tts` | `RunSpeechOnServiceWorker`(約90行)/ `case "SpeechOnServiceWorker"` / `StopChromeTTS` | **完全に死** |
| ③ 30秒問題で戻る | content script に戻った | ①と同じ残骸群 | 死 |
| ④ 現在 | **offscreen の `window.speechSynthesis`** | `speechSynthesis.html` / `speechSynthesis.js` | ✅ 唯一の現役 |

### 現在生きている実際のフロー

```
[起動トリガ] popup / キーボード / 右クリック / 2ボタン同時押し
  → background.js  RunStartSpeech()  設定・SiteInfo・読み替え辞書を収集
  → (KickSpeech 系) contentScript.js  本文抽出・開始位置決定・読み替え・utterance組立
       ※ここで utterance を作るが speak() はしない。text だけ送る
  → (StartSpeech) background.js  case "StartSpeech"  offscreen を生成して転送
  → (StartSpeech / offscreen) speechSynthesis.js  ★ここで speechSynthesis.speak() 実行★
  → (OnBoundary / EndSpeech) background.js  → content へ中継
  → (SpeechOnServiceWorker_OnBoundary / _OnEnd) contentScript.js  ハイライト＆スクロール＆繰り返し判定
```

### Safari に関する確定事実(2026-06 調査)

- `chrome.offscreen` は **Safari 非対応**(Chromium 専用 API、Safari は実装にコミットしていない)。
  → Safari では offscreen 経路は使えず、content script 直接発話に頼るしかない。
- Safari の拡張内 `speechSynthesis` には既知の癖がある:
  - `getVoices()` が空配列を返すことがある(声選択 UI が空になる)。
  - 非永続バックグラウンド(service worker)が **30秒でクラッシュ**することがある。
  - content script の `onMessage` がまれに無言でドロップされる。
- これらより、**発話を content script(ページ側)で回す**方式は Safari の 30秒問題を踏みにくく、フォールバックとして妥当。

---

## 2. 目標アーキテクチャ

役割を以下に固定する。

| コンテキスト | 責務 |
|---|---|
| **content script** | 画面まわり専任 = 本文抽出・開始位置決定・読み替え適用・ハイライト・スクロール。utterance は組み立てず「読み上げるテキスト」だけ作る |
| **background (SW)** | 仲介専任 = 設定収集・SiteInfo/辞書取得・**発話バックエンドの選択**・offscreen ライフサイクル管理・イベント中継 |
| **発話バックエンド** | 発話エンジン専任。下記2実装を機能検出で切替 |

### 発話バックエンド抽象(肝)

background.js が `chrome.offscreen` の有無で発話先を振り分ける。両バックエンドは
**同じイベントメッセージ名**で content script に start/boundary/end を返す。

```
background.js:
  if (chrome.offscreen)   → [Chrome バックエンド] offscreen document (speechSynthesis.js)
  else                    → [Safari バックエンド] content script 直接 (StartSpeechByContentScript)
```

- どちらの経路でも content 側の受け口(ハイライト/スクロール/繰り返し)は共通。
- これにより「発話の出口」は2つだが、それ以外のロジックは1本化される。

### Safari 経路で追加検討すること

- **ユーザージェスチャ制約**: content script の `speak()` はタブ内でのユーザー操作後でないと
  `not-allowed` になる場合がある。content script は既に `mousedown`/`keydown` を監視しているので、
  最初のユーザー操作時に空 utterance を1回 `speak()` して「解錠」する案を検証する(効果は要実機確認)。
- **`getVoices()` 空対策**: 声リストが取れない場合はブラウザ既定話者で発話継続できるようにする。

---

## 3. フェーズ分割

各フェーズ終了時に必ず手動動作確認(§5)を行い、挙動が変わっていないことを確かめてから次へ進む。

### フェーズ 1 — 死にコード削除(挙動不変)

100% 到達不能なコードのみを消す。発話フローは一切変えない。

**background.js**
- `RunSpeechOnServiceWorker`(`chrome.tts` 発話、約90行)を削除。
- `case "SpeechOnServiceWorker"` / `case "StopChromeTTS"` を削除(発火元が存在しない)。
- `chrome.action.onClicked` リスナーを削除(manifest に `default_popup` があるので発火しない)。
- `enableActionButton` + `chrome.tabs.onUpdated` を削除(旧 pageAction 時代の名残。今の `action` は常時有効)。
- `status` / `StatusStartSpeech` / `StatusEndSpeech` と各呼び出しを削除(中身が空の no-op)。
- 冒頭のコメントアウト済み旧 wedata URL 群を削除。
- `case "onRemoved"` に `break;` を追加(default へのフォールスルー防止。バグ修正)。

**contentScript.js**
- `StartSpeechEventHandle` / `EndSpeechEventHandle` を削除(未呼び出し)。
- `SpeechWithPageElementArray` 内の `if(chrome && false){…}` を畳んで `StartSpeech(...)` 呼び出しだけ残す。
- 同関数内の `utterance.onboundary = …` 等、**speak() しない utterance への代入**を削除
  (生きているのは隣の `speechEventHandlerHolder.xxx = …` 側だけ)。
- コメントアウト済み `beforeunload`→`StopChromeTTS` を削除。
- `GetNextLink` の `pageElement` 参照バグ(本来 `nextLink`)を、nextLink 自体が未使用なので関数ごと削除検討。

**options.js**
- `class SpeechSynthesisSetting` を削除(一度も new されておらず `apply()` も壊れている)。
- `addConvertColumn` を削除(未呼び出し)。

> このフェーズは「消すだけ」。発話・ハイライト・スクロール・繰り返し・選択範囲読み上げの挙動は変わらないはず。

> **【フェーズ1完了・Chrome DevTools MCP で検証済み(2026-06-02)】**
> 拡張ロード(SW 登録・install 時のオプション表示・コンテキストメニュー作成)、popup の i18n 表示、
> `RunStartSpeech → KickSpeech →`(content script 受信を console で確認)`→ StartSpeech → offscreen 生成`
> までの現役パイプラインが正常動作することを確認。削除した関数(`RunSpeechOnServiceWorker` /
> `KickSpeech` / `enableActionButton` / `status`)が消え、現役関数が残っていることも SW 内で確認。
> 各コンテキストのコンソールに(無関係な favicon 404 と quirks-mode 通知を除き)エラー無し。

> **【検証で判明した既存バグ(フェーズ2で対処)】**
> 「停止」を押すと `RunStopSpeech` は **content script にしか** `StopSpeech` を送らず、content 側の
> `speechSynthesis.cancel()` は(発話は offscreen で行われているため)何も止めない。結果、**offscreen の
> 発話が止まらない**。実際に長文読み上げ中に停止しても offscreen ドキュメントが生き残り発話継続することを確認。
> 一時停止(中断)・再開も同様に offscreen へ届いていない可能性が高い。これはフェーズ1とは無関係の既存問題
> (フェーズ1では空 no-op の `StatusEndSpeech()` 呼び出しを消しただけで停止配線は不変)。

### フェーズ 2 — 発話制御を「実際に発話しているバックエンド」へ正しく届ける + Safari 経路

- **【最優先・上記の既存バグ】停止/中断/再開を offscreen にも届ける**。現状 `RunStopSpeech` /
  `RunPauseSpeech` / `RunResumeSpeech` は content script にしか送っていない。発話バックエンドが offscreen の
  ときは offscreen にも停止/一時停止/再開を送る(または background が offscreen を閉じる)よう配線する。
  フェーズ2で導入する「発話バックエンド抽象」に stop/pause/resume も含めて一本化するのが本筋。
- background.js の `case "StartSpeech"` else 側のバグ修正: `request.tab.id` → `sender.tab.id`。
- `StartSpeech-force-speech-on-contentScript` → `StartSpeechByContentScript` の経路が、
  ハイライト/スクロール/繰り返し/続き読みまで offscreen 経路と同等に動くことを確認・補修。
- §2 の「ユーザージェスチャ解錠」案・「getVoices 空対策」を実機(可能なら macOS Safari)で検証。
- offscreen 経路(Chrome)を壊していないことを必ず再確認。

### フェーズ 3 — 命名・抽象の整理

- メッセージ名を実態(② chrome.tts 時代の名前)から中立名へ改名:
  - `SpeechOnServiceWorker_OnStart` → `Speech_OnStart`
  - `SpeechOnServiceWorker_OnBoundary` → `Speech_OnBoundary`
  - `SpeechOnServiceWorker_OnEnd` → `Speech_OnEnd`
- background.js の発話まわり関数名・コメントを「offscreen / content のどちらのバックエンドか」が
  分かる名前に整理。
- 「発話バックエンド選択」を 1 箇所(1関数)に集約し、分岐の意図をコメントで明示。

### フェーズ 4 — 重複統合・声リストの整合

- `ApplyVoiceSetting` / `getVoiceList` / 声設定オブジェクトの content / offscreen / options 重複を整理。
- **オプションのテスト再生と本番再生のエンジン不一致を解消**:
  現在オプションは `chrome.tts`(`voiceName`/`extensionId`)で声一覧・テストしているが、
  本番発話は `window.speechSynthesis`(`name`/`lang`)。テストで聞いた声と実際の声が食い違う。
  → オプションも `speechSynthesis.getVoices()` ベースへ寄せ、テスト=本番にする。
- 上記が済めば `manifest.json` の `tts` パーミッションを削除可能(最後に実施)。

---

## 4. 残す/注意するもの(消さない)

- **boolean を文字列 `"true"`/`"false"` で保存**する仕組み:`chrome.storage.local` の既知制約対応なので維持。
  ただし読み書きのヘルパに寄せて統一はしたい。
- `localStorage` → `chrome.storage.local` 移行コード(`migrateFromLocalStorage`):既存ユーザー設定の引き継ぎに必要。
- `onRemoved` / `TabClosed`(タブ閉鎖時の発話停止):現役。
- SiteInfo / 読み替え辞書の取得・キャッシュ:現役。

---

## 5. 動作確認チェックリスト(各フェーズ後に実施)

**Chrome(offscreen 経路)**
- [ ] popup の「開始」で読み上げ開始、現在文がハイライト＆スクロールする
- [ ] 「停止」「中断(一時停止)」「再開」が効く
- [ ] 「開始(繰り返し)」で末尾到達後に最初へ戻る
- [ ] 範囲選択 → 右クリック「選択範囲のみ読み上げ」が選択分だけ読む
- [ ] 右クリック「ここから読み上げ」が効く
- [ ] キーボードショートカット(設定時)が効く
- [ ] 2ボタン同時押し(設定時)で開始/停止できる
- [ ] 読み上げ中にタブを閉じると発話が止まる
- [ ] オプション: 話者/速度/音量/スクロール設定の保存・反映

**Safari(content script 直接経路)** ※フェーズ2以降
- [ ] 上記主要項目が動く(動かない項目は既知制約として記録)
- [ ] `getVoices()` が空でも既定話者で発話できる
- [ ] 長文読み上げ中にバックグラウンドの30秒クラッシュで止まらない

---

## 6. 進め方の方針

- フェーズ1(削除)→ 動作確認 → フェーズ2(Safari修正)→ … と**1フェーズずつ**進める。
- 各フェーズは独立コミットにし、挙動が変わった箇所を後から追えるようにする。
- バージョンを上げる場合は `manifest.json` の `version` と `README.md` の更新履歴を両方更新する。
