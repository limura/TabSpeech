TabSpeech は表示されているタブの文章を読み上げる chrome extension です。

Chrome ウェブストアにて[公開しています](https://chrome.google.com/webstore/detail/tabspeech/ccojlmmbakjcoddbepmmogiobbmmhmjc)。

# 使い方

1. 読み上げを開始したい位置を範囲選択
2. PageActionアイコン(右上に出ている黒字に白の「読上」アイコン)をクリックして、「Speech」ボタンを押す

読み上げを停止したい場合は Stop、一時停止なら Pause、一時停止からの復帰には Resume を押します。

読み上げの話者は最初はブラウザの標準設定になっています。例えば日本語環境だと日本語話者になっているので、英語で話させたい時などは設定ページ(アイコンを右クリックしてオプションを選択するか、アイコンをクリックしてOptionsを選択)で設定してください。
設定ページでは読み上げの速度等も変更できます。

# 余談

読み上げを開始した時に表示されていないものは読み上げられません。
つまり、AutoPagerize が効くページの場合、「先に」AutoPagerize で全ページを表示しておいてから読み上げを開始しないと、全てのページを読み上げることはできません。

読み上げには WebSpeech API を利用しています。(つまり、chrome のアドレスバーに `javascript:window.speechSynthesis.speak(new SpeechSynthesisUtterance("こんにちは世界"))` と入力して読み上げられなければ駄目です)

なお、AutoPagerize が効くページの場合には、AutoPagerize の pageElement(本文Element) に当たる部分のみを読み上げようと努力します。

# 更新履歴

## Version 1.1
話者や読み上げ速度などの設定が行えるようにしました。TabSpeechのアイコンを右クリック→オプション から手繰れます。

## Version 1.1.1
SiteInfo の読み込みに失敗しているような挙動があったので修正しました。

## Version.1.1.2
SiteInfo を毎回読み直していた問題を修正しました。

## Version 1.1.3
SiteInfo の最新版が読まれていなかったのを修正。SiteInfo の評価順をより適切なものに変更。

## Version 1.1.4
SiteInfo の読み込み順がおかしくなる問題を解消。

## Version 1.1.5
- アイコンを押した時に出てくるポップアップメニューから設定ページに飛べるようにした。
- SiteInfo で pageElement として指示されていない部分が範囲選択されていた場合、pageElement の指定を無視してその位置から読み上げるようにした。

# 既知の問題

読み上げている場所を範囲選択状態で表示するようにしようとしているのですが、読み上げ開始後しばらくすると読み上げているよイベントが飛んでこなくなるという問題があって、読み上げている場所の視覚的表示がうまく動きません。

