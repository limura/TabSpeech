TabSpeech は表示されているタブの文章を読み上げる chrome extension です。

Chrome ウェブストアにて[公開しています](https://chrome.google.com/webstore/detail/tabspeech/ccojlmmbakjcoddbepmmogiobbmmhmjc)。

# 使い方

1. 読み上げを開始したい位置を範囲選択
2. PageActionアイコン(右上に出ている黒字に白の「読上」アイコン)をクリックして、「Speech」ボタンを押す

読み上げを停止したい場合は Stop、一時停止なら Pause、一時停止からの復帰には Resume を押します。

読み上げの話者は最初はブラウザの標準設定になっています。例えば日本語環境だと日本語話者になっているので、英語で話させたい時などは設定ページ(アイコンを右クリックしてオプションを選択するか、アイコンをクリックしてOptionsを選択)で設定してください。
設定ページでは読み上げの速度等も変更できます。

# 余談

読み上げを開始した時に表示されていないものは読み上げられません(Version 1.5以降であれば、オプションで「Enable force scroll to speech sentence」と「読み終わった時に読み上げられるものが追加されていたら追加分を読み上げる」の両方をONにした上で Autopagerize を効かせており、読み上げ中のタブを表示し続けているという前提であれば、Autopagerize がロードした続きの内容を読み上げ続ける事ができる「かも」しれません)。
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

## Version 1.2
対象のURIを *://*/* から <all_urls> に変更。これで file://... のものでも読み上げられるようになるはずです。

## Version 1.3
リピート再生用の再生ボタンを追加。

## Version 1.4
読み上げ位置にスクロールするか否かの設定を追加。(ONにしないと今まで通りスクロールはしません)
キーボードショートカットの設定を追加。(オプション→Set keyboard shortcutsで設定しないと有効になりません)

## Version 1.5
「読み終わった時に読み上げられるものが追加されていたら追加分を読み上げる」機能のON/OFF設定を追加。

## Version 1.6
読みがおかしい場合の読み替えを外部の辞書に頼れるようにしました。
今の所、以下の2つの読み替え辞書を使うように設定されています。
http://wedata.net/databases/TTS%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items
http://wedata.net/databases/TTS%20Regulaer%20Expression%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items
ただ、読み替えは音声合成エンジン側でのおかしな読み上げを矯正するという目的のため、複数の音声合成エンジンが利用できる TabSpeech においては固定の読み替え辞書を利用するのはよろしくないと考えられます。
ただ、変な読み方をする単語を正しい発音に読み替えるという場合、もともとその単語は正しく読み上げていた音声合成エンジンでも、単に正しく読み上げられるようになるだけなので大体は大丈夫かなぁ……という事で見切り発車的に導入します。
独自の読み替え辞書が必要な方はご自身で似たようなJSON形式のデータベースを構築するなどした後に、オプションページにてURLを指定することでご利用ください。
なお、上記の2つのデータベースについては(Wedataのデータなので)パブリックドメインでありますし、OpenIDがあれば誰でも書き換えが可能でありますので利用者に被害が及ばないような形での編集への協力を望みます。

## Version 1.6.1
正規表現での読み替えがうまく動いていなかった問題を修正。

## Version 1.7
国際化してみました。(en, jp, zh_CN, zh_TW)

## Version 1.7.1
読み替え辞書は今の所日本語用の物しか用意していないので、jp 以外の国の場合の標準の読み替え辞書を空欄に変えました。
今までは全てのタブで動作するようになっていましたが、activeTabのみで利用可能な設定に書き換えました(審査の時間短縮用で、多分動作には問題ないと思います)。

## Version 1.7.2
読み上げ時の速度(rate)設定で 2 よりも大きい値(最大10)まで指定できるようにするチェックボックスを追加しました。
この設定をチェックボックスでON/OFFするようにしたのは、話者によっては2よりも大きい値にした場合に読み上げが行われなかったり、速度の設定を無視するようになったりする事が確認されているためです。

## Version 1.8
右クリックメニューとして「選択範囲のみを読み上げる」という機能を追加。

## Version 1.8.1
PageElement で指定されていない部分を読み上げようと範囲指定して読み上げを開始した時に、PageElement で指定されている部分しか読み上げられなかった問題を修正。

## Version 1.9
オプションに強制スクロールする時の縦位置の指定を追加。

## Version 2.0
Manifest V3 に移行。
オプションに「2つのボタンクリック(同時押し)で読み上げを開始(又は停止)する」オプションを追加。
読み上げ中の読み上げ位置表示の選択範囲を変更。

## Version 2.0.1
設定を保存できない場合がある問題に対処。

## Version 2.0.2
右クリックメニューからの呼び出しが正しく動作していない問題に対処。

# 既知の問題

読み上げている場所を範囲選択状態で表示するようにしようとしているのですが、読み上げ開始後しばらくすると読み上げているよイベントが飛んでこなくなるという問題があって、読み上げている場所の視覚的表示がうまく動きません。

同様の理由(再生終了イベントが飛んでこない)により、リピート再生が行われない問題があります(というかだいたい動きません……(´・ω・`)。

