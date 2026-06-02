#!/bin/sh
# syncToXcode.sh
#
# git 管理されたこちらの web 拡張ソース(TabSpeech/)を、Safari 動作確認用の
# Xcode プロジェクトの Resources フォルダへ同期する。
#
# 構成メモ:
#   - 正本はこのリポジトリの TabSpeech/ サブフォルダ(manifest.json のある方)。
#   - Xcode プロジェクト(xcode/TabSpeech)は変換ツールが生成したテスト用の派生物で
#     git 管理外。拡張の実体は "Shared (Extension)/Resources/" に置かれている。
#   - Swift コードや project.pbxproj はいじらず、ここでは web ファイルだけ追従させる。
#
# 使い方: リポジトリルートで `sh syncToXcode.sh`
# 前提: rsync が使えること(macOS 標準で入っている)。

set -eu

# このスクリプトの場所(= リポジトリルート)
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SRC="${SCRIPT_DIR}/TabSpeech/"

# Xcode プロジェクト側の Resources。環境が変わったらここを直す。
DEST="/Users/limura/Desktop/work/Extension/xcode/TabSpeech/TabSpeech/Shared (Extension)/Resources/"

if [ ! -d "$SRC" ]; then
  echo "エラー: 同期元が見つかりません: $SRC" >&2
  exit 1
fi
if [ ! -d "$DEST" ]; then
  echo "エラー: 同期先が見つかりません: $DEST" >&2
  echo "       Xcode プロジェクトのパスが変わっていないか確認してください。" >&2
  exit 1
fi

# --delete で同期元に無いファイル(古い残骸)も消す。
# .DS_Store は Xcode 側で混ざりがちなので除外。
rsync -av --delete \
  --exclude '.DS_Store' \
  "$SRC" "$DEST"

echo ""
echo "同期完了: TabSpeech/ → Xcode Resources"
echo "次は Xcode でビルドし直し、Safari で拡張を再読み込みしてください。"
