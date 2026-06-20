var isRepeat = false;
var isStopped = true;
let speechSynthesis = window.speechSynthesis;
var chromeStorageCache = undefined;

function getVoiceList() {
  let voices = speechSynthesis.getVoices();
  return voices;
}

// getVoices() は初回(ページ読み込み直後)に空のことがある。空のまま speak すると
// 指定の声が当たらず既定の声(別人)で発話されてしまうため、声が揃ってから speak する。
function speakWhenVoicesReady(doSpeak){
    let voices = speechSynthesis.getVoices();
    if(voices && voices.length){ doSpeak(); return; }
    var fired = false;
    let go = function(){ if(fired){ return; } fired = true; doSpeak(); };
    try { speechSynthesis.addEventListener('voiceschanged', go, {once: true}); } catch(e){}
    speechSynthesis.getVoices(); // ロードを促す
    setTimeout(go, 1500);        // voiceschanged が来ない環境向けフォールバック
}

function StartSpeechByContentScript(speechText, voiceSetting){
    StopSpeech();
    speakWhenVoicesReady(function(){
      let utterance = new SpeechSynthesisUtterance(speechText);
      utterance.onboundary = function(event){
          SpeechOnBoundary(event);
      };
      utterance.onstart = function(event){
        // onstart は iOS では実音声より早く来るため FAB 状態には使わない(最初の onboundary で切替)。
      };
      utterance.onend = function(event){
          SpeechOnEnd(event);
      };
      utterance.onerror = function(event){console.log("SpeechSynthesisUtterance Event onError", event);};
      utterance.onmark = function(event){console.log("SpeechSynthesisUtterance Event onMark", event);};
      utterance.onpause = function(event){console.log("SpeechSynthesisUtterance Event onPause", event);};
      utterance.onresume = function(event){console.log("SpeechSynthesisUtterance Event onResume", event);};
      ApplyVoiceSetting(utterance, voiceSetting);
      speechSynthesis.speak(utterance);
    });
}

function StartSpeech(text, voiceSetting) {
    autoScrollActive = true;
    setFabState("preparing"); // 発話を依頼した段階。実際に始まったら onstart で "speaking" にする
    chrome.runtime.sendMessage({
      type: 'StartSpeech',
      speechText: text,
      voiceSetting: voiceSetting,
    });
}

function StopSpeech(){
  speechSynthesis.cancel();
}

function PauseSpeech(){
  speechSynthesis.pause();
}
function ResumeSpeech(){
  speechSynthesis.resume();
}

function CreateVoiceSettingFromMessage(message) {
  return CreateVoiceSetting(message.lang, message.voice, message.pitch, message.rate, message.volume, message.isScrollEnabled, message.isAutopagerizeContinueEnabled, message.convertTable, message.regexpConvertTable, message.scrollPositionRatio, message.scrollDeadZoneRatio);
}

function CreateVoiceSetting(lang, voice, pitch, rate, volume, isScrollEnabled, isAutopagerizeContinueEnabled, convertTable, regexpConvertTable, scrollPositionRatio, scrollDeadZoneRatio){
  return {
    "lang": lang,
    "voice": voice,
    "pitch": pitch,
    "rate": rate,
    "volume": volume,
    "isScrollEnabled": isScrollEnabled,
    "isAutopagerizeContinueEnabled": isAutopagerizeContinueEnabled,
    "convertTable": convertTable,
    "regexpConvertTable": regexpConvertTable,
    "scrollPositionRatio": scrollPositionRatio,
    "scrollDeadZoneRatio": scrollDeadZoneRatio,
  };
}

function ApplyVoiceSetting(utterance, voiceSetting){
  if(voiceSetting.lang){
    utterance.lang = voiceSetting.lang; // 指定の声が見つからない場合でも言語だけは合わせる
    let voiceArray = getVoiceList();
    for(voice of voiceArray){
      if(voice.lang == voiceSetting.lang && voiceSetting.voice && voice.name == voiceSetting.voice){
        utterance.voice = voice;
        break;
      }
    }
  }
  if(typeof voiceSetting.pitch != "undefined"){
    utterance.pitch = voiceSetting.pitch;
  }
  if(typeof voiceSetting.rate != "undefined"){
    utterance.rate = voiceSetting.rate;
  }
  if(typeof voiceSetting.volume != "undefined"){
    utterance.volume = voiceSetting.volume;
  }
}

function GetPageElementArray(SiteInfo){
  if("data" in SiteInfo && "pageElement" in SiteInfo.data){
    return document.evaluate(SiteInfo.data.pageElement, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  }
  return undefined;
}

let autoScrollActive = 1;
let autoScrollTimeout = null;
const PAUSE_DURATION = 4000; // 4秒間スクロールがない場合は自動スクロールを停止する
// 読み上げ位置が既に画面内の快適な範囲にあるときは再スクロールしないための許容幅(ビューポート高に対する割合)の既定値。
// オプションの「強制スクロールの追従のゆとり」(scrollDeadZoneRatio)が未設定のときに使う。
// スクロール量でページ高さが変わるサイト(折りたたみヘッダー等)があると、毎boundaryで厳密に
// 再センタリングするたびに高さがズレて目標が動き、スクロールが上下にガクガク振動する(リミットサイクル)。
// この不感帯(デッドゾーン)で微小な補正スクロールを抑止して振動を断ち切る。値は典型的なヘッダー高(数十px)
// を十分上回るように取り、読み進めて行がこの幅を超えて流れたときだけ滑らかに再センタリングする。
// 0 にすると不感帯が無くなり、従来どおり1行ごとに厳密追従する(ガクつき対策は無効)。
const SCROLL_DEAD_ZONE_RATIO = 0.1;

function detectUserScroll() {
  // 自動スクロールを一時停止
  autoScrollActive = false;

  // 既存のタイムアウトがあればクリア
  if (autoScrollTimeout) {
    clearTimeout(autoScrollTimeout);
  }

  // 一定時間後に自動スクロールを再開
  autoScrollTimeout = setTimeout(() => {
    autoScrollActive = true;
  }, PAUSE_DURATION);
}

// 各種スクロールイベントのリスナーを設定
function setupScrollDetection() {
  // マウスホイールによるスクロールを検知
  document.addEventListener('wheel', (event) => {
    detectUserScroll();
  });

  // キーボードによるスクロールを検知（上下キー）
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'PageUp' || event.key === 'PageDown' ||
        event.key === 'Home' || event.key === 'End' ||
        event.key === ' ') {
      detectUserScroll();
    }
  });
}
setupScrollDetection();

function ScrollToElement(element, index, margin, deadZoneRatio = SCROLL_DEAD_ZONE_RATIO) {
  if (!autoScrollActive) {
    const localStorage = chromeStorageCache;
    const isDelayAutoScrollEnabled = localStorage["isDelayAutoScrollEnabled"] != "false";
    if (isDelayAutoScrollEnabled) {
      return;
    }
  }
  let range = new Range();
  range.selectNode(element);
  if(index > 0){
    range.setStart(element, index);
  }
  let xMargin = window.innerWidth * margin;
  let yMargin = window.innerHeight * margin;
  rect = range.getBoundingClientRect();
  let x = window.scrollX + rect.left - xMargin;
  let y = window.scrollY + rect.top - window.innerHeight + yMargin;
  if(rect.x == 0 && rect.y == 0) { return; }
  if(y < -window.innerHeight){ return; }
  // 読み上げ位置が既に快適な範囲(不感帯)に収まっているなら再スクロールしない。
  // (y - window.scrollY) は「現在の行が目標の縦位置からどれだけズレているか」のpx。これが不感帯内なら
  // 微小な補正を打たず、スクロール量依存でページ高が変わるサイトでの上下振動(ガクガク)を防ぐ。
  // deadZoneRatio は 0 で無効化(従来どおり厳密追従)。
  if(Math.abs(y - window.scrollY) <= window.innerHeight * deadZoneRatio){ return; }
  //console.log("scrollTo:", y, window.scrollY, rect.top, window.innerHeight, yMargin, margin, rect.y, rect.top, rect);
  //window.scrollTo({left: x, top: y, behavior: "smooth"});
  window.scrollTo({top: y, behavior: "smooth"});
}

function ScrollToIndex(index, margin){
  let elementData = SearchElementFromIndex(elementArray, index);
  if(elementData){
    ScrollToElement(elementData.element, elementData.index, margin);
  }
}

function HighlightSpeechSentence(element, index, endElement, endIndex){
  // element.isConnected は light DOM でも Shadow DOM でも「ツリーに繋がっているか」を返す。
  // document.contains() は Shadow DOM 内のノードに対して false になり、MSN 等の本文(Shadow
  // DOM 内)でハイライトがスキップされてしまうため、isConnected で判定する。
  if(!element.isConnected) { return; }
  //element.parentNode.scrollIntoView(true); // TEXT_NODE には scrollIntoView が無いっぽい(´・ω・`)
  let range = new Range();
  //range.selectNodeContents(element); // selectNodeContents() では子要素が無いと駄目
  range.selectNode(element);
  if(element && index > 0){
    range.setStart(element, index);
  }
  if(endElement && endIndex > 0 && endElement.isConnected){
    try {
      // TODO: 怪しく末尾に「。」を追加しているので setEnd() については範囲外になる可能性があるので例外を握りつぶしています
      range.setEnd(endElement, endIndex);
    }catch{
      //
    }
  }

  let selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function RemoveHighlightSpeechSentence(){
  //chrome.runtime.sendMessage({"type": "EndSpeech"});
  let selection = window.getSelection();
}

function BoundarySpeechEventHandle(element, event){

}

function isNotSpeechElement(element){
  if(element instanceof HTMLElement){
    // TabSpeech 自身が挿入した UI(FAB・トースト・強制選択用 style)は読み上げ対象から除外する。
    // Shadow DOM を貫通して抽出するようになったため、明示的に弾かないと FAB のつまみ("⠿")等が
    // 本文に混ざってしまう(id はすべて "tabspeech-" 始まりで付けてある)。
    if(element.id && typeof element.id === "string" && element.id.indexOf("tabspeech-") === 0){
      return true;
    }
    switch(element.tagName){
    case "SCRIPT":
    case "NOSCRIPT":
    case "STYLE":
      return true;
    case "BLOCKQUOTE":
      if(element.className == "twitter-tweet"){
        return true;
      }
      break;
    case "SPAN":
      if(element.class == "katex-mathml"){
        console.log("katex", element);
        return true;
      }
      break;
    default:
      break;
    }
  }
  return false;
}

// 抽出時に辿るべき子ノード列を返す。
// - open な Shadow DOM を持つ要素は、実際に描画されるシャドウツリー(shadowRoot)を辿る。
//   これで MSN(<cp-article> 等の Web Components で本文を Shadow DOM 内に描画するサイト)でも
//   本文を抽出できる。素の childNodes は light DOM しか見えず、本文が一切取れなかった。
// - <slot> はそこへ割り当てられた実ノード(assignedNodes)へ展開する。これでスロット投影された
//   light DOM の内容も描画順どおりに拾える(shadowRoot 経由で二重に拾うことはない)。
// 閉じた(closed)Shadow DOM は shadowRoot が取れないので従来どおり貫通できない。
function getExtractionChildNodes(element){
  if(element.shadowRoot){
    return element.shadowRoot.childNodes;
  }
  if(element.tagName === "SLOT" && typeof element.assignedNodes === "function"){
    let assigned = element.assignedNodes();
    if(assigned && assigned.length > 0){
      return assigned;
    }
  }
  return element.childNodes;
}

function extractElement(element){
  if(isNotSpeechElement(element)){
    return [];
  }
  let childNodes = getExtractionChildNodes(element);
  if(childNodes.length <= 0){
    var text = "";
    if(element.nodeType == Node.TEXT_NODE){
      text = element.textContent;
    }else{
      text = element.innerText;
    }
    if(!text || text.trim().length <= 0){
      return [];
    }
    return [{"element": element, "text": text}];
  }
  var elementArray = [];
  for(var i = 0; i < childNodes.length; i++){
    let childNode = childNodes[i];
    elementArray = elementArray.concat(extractElement(childNode))
  }
  return elementArray;
}

function getRect(element) {
  if(element === undefined) { return undefined; }
  let range = new Range();
  range.selectNode(element);
  return range.getBoundingClientRect();
}

function getPunctuation() {
  const lang = document.documentElement.lang;
  // 言語コードから主要な言語部分のみ抽出
  const primaryLang = lang.split('-')[0];

  switch (primaryLang) {
    case 'ja':
      return '。';
    case 'en':
      return '.';
    case 'ko':
      return '。'; // 韓国語でも「。」がよく使われます
    case 'zh':
      return '。'; // 中国語は簡体字と繁体字どちらも「。」にします
    default:
      return '.';
  }
}

function getLineHeight(node) {
  try {
    return getComputedStyle(node).lineHeight;
  }catch{
    let parent = node.parentNode;
    if(parent) {
      return getLineHeight(parent);
    }
  }
  return undefined;
}

function extractElementForPageElementArray(pageElementArray){
  var elementArray = [];
  for(var i = 0; i < pageElementArray.snapshotLength; i++){
    let element = pageElementArray.snapshotItem(i);
    elementArray = elementArray.concat(extractElement(element));
  }

  // 読み上げないような文字列のElementについては弾きます
  let filterdElementArray = elementArray.filter((obj)=> !/^[\s\n\r]+$/.test(obj.text));

  // 次の読み上げ対象のelementが縦方向で下にあるなら、文末に「。」に当たる文字列を追加します。
  let panctuation = getPunctuation();
  for (let i = 0; i < filterdElementArray.length - 1; i++) {
    let currentElement = filterdElementArray[i].element;
    let nextElement = filterdElementArray[i+1].element;
    let currentRect = getRect(currentElement);
    let nextRect = getRect(nextElement);
    let currentBottom = currentRect.top + currentRect.height;
    let nextTop = nextRect.top;
    let currentElementLineHeight = getLineHeight(currentElement);
    var threshold = 5;
    if (currentElementLineHeight) {
      threshold += currentElementLineHeight;
    }
    if (currentBottom < nextTop - threshold) {
      //console.log("add panctuaton:", filterdElementArray[i].element, panctuation, nextTop, currentBottom - threshold, currentRect, nextRect);
      filterdElementArray[i].text += panctuation;
    }
  }
  return filterdElementArray;
}

// [{"element":, "text":}, ...] の配列の text の文字を index として、
// index (0 起点) で示される element の何文字目であるかを返す({"element":, "text":, "index":})
// 見つからなければ undefined が返ります
function SearchElementFromIndex(elementArray, index){
  var i = 0;
  for(var i = 0; i < elementArray.length && index >= 0; i++){
    let data = elementArray[i];
    let element = data["element"];
    let text = data["text"];
    let textLength = text.length;
    if(index < textLength){
      return {"element": element, "text": text, "index": index, "textLength": textLength}
    }
    index -= textLength;
  }
  return undefined
}

// ページ内の open な Shadow root をすべて集める。getComposedRanges に渡すと選択境界が
// Shadow 内の実ノードのまま返る(渡さないと shadow host へ retarget され実ノードが取れない)。
function collectOpenShadowRoots(){
  let roots = [];
  let stack = [document];
  while(stack.length){
    let node = stack.pop();
    let elements = node.querySelectorAll ? node.querySelectorAll("*") : [];
    for(let el of elements){
      if(el.shadowRoot){
        roots.push(el.shadowRoot);
        stack.push(el.shadowRoot); // 入れ子の Shadow root も辿る
      }
    }
  }
  return roots;
}

// 選択範囲を取得する。**Shadow DOM 内を選択すると** window.getSelection().getRangeAt() は
// 境界を shadow host(light DOM 側の祖先要素)へ retarget してしまい、実際に選択された
// Shadow 内のテキストノードが取れない(startContainer が light DOM の <article> 等になる)。
// その結果 SplitElementFromSelection が選択位置を見つけられず、別の場所(「こちらもおすすめ」等)
// から読み始めてしまう。getComposedRanges に全 open shadow root を渡すと実ノード境界の
// StaticRange が得られるので、それを live Range にして返す。MSN 等で「選択位置から読む」ための要。
function getDeepSelectionRange(selection){
  if(!selection || selection.rangeCount <= 0){ return null; }
  let fallback = selection.getRangeAt(0);
  if(typeof selection.getComposedRanges === "function"){
    let roots = collectOpenShadowRoots();
    let candidates = [];
    // ブラウザによりシグネチャが2形式ある(オプション形式 / 可変長引数形式)。両方試す。
    try { let c = selection.getComposedRanges({shadowRoots: roots}); if(c && c[0]){ candidates.push(c[0]); } } catch(e){}
    try { let c = selection.getComposedRanges.apply(selection, roots); if(c && c[0]){ candidates.push(c[0]); } } catch(e){}
    // Shadow 内の実ノード(テキストノード)に解決できた候補を優先する。
    let best = candidates.find(function(sr){ return sr.startContainer && sr.startContainer.nodeType === Node.TEXT_NODE; }) || candidates[0];
    if(best && best.startContainer){
      try {
        let live = document.createRange();
        live.setStart(best.startContainer, best.startOffset);
        try { live.setEnd(best.endContainer, best.endOffset); } catch(e){ /* 始点と別ツリー等は始点のみ */ }
        return live;
      } catch(e){ /* 失敗時は通常の range */ }
    }
  }
  return fallback;
}

// elementArray から range で示された範囲を先頭とする elementArray と、その先頭の index を返す
// 返されるのは {"elementArray": , "index": } の形式で、発見できなかった場合は undefined が返る
function SplitElementFromSelection(elementArray, range){
  // まず選択(キャレット)開始ノードに「正確に一致」する葉を探す。これは Shadow DOM 内の
  // 選択でも light DOM の選択でも確実に効き、後段の compareBoundaryPoints がツリーをまたぐと
  // 例外(WrongDocumentError)になる問題も避けられる。MSN 等の Web Components サイト
  // (本文が Shadow DOM 内にある)で選択位置から読み始めるための本命の経路。
  let startContainer = range.startContainer;
  for(var hitIndex = 0; hitIndex < elementArray.length; hitIndex++){
    let element = elementArray[hitIndex]["element"];
    if(element === startContainer
       || (element.nodeType === Node.ELEMENT_NODE && element.contains && element.contains(startContainer))){
      var startIndex = (startContainer.nodeType === Node.TEXT_NODE) ? range.startOffset : 0;
      if(elementArray[hitIndex]["text"].length < startIndex){ startIndex = 0; }
      return {"elementArray": elementArray.slice(hitIndex), "index": startIndex};
    }
  }

  // 正確一致しないが開始が「要素」の場合: Shadow DOM 内の選択が shadow host(light DOM 側の
  // 祖先要素)へ retarget され、startContainer が要素になっているケース。getComposedRanges が
  // 使えず実ノードが取れなかった時の保険として、その要素の部分木に(Shadow 境界を越えて)
  // 含まれる最初の葉から読み始める。まず startOffset の子subtree(より正確)、無ければ要素全体。
  if(startContainer.nodeType === Node.ELEMENT_NODE){
    let childAnchor = startContainer.childNodes[range.startOffset];
    let anchors = childAnchor ? [childAnchor, startContainer] : [startContainer];
    for(let anchor of anchors){
      for(var ai = 0; ai < elementArray.length; ai++){
        if(composedContains(anchor, elementArray[ai]["element"])){
          return {"elementArray": elementArray.slice(ai), "index": 0};
        }
      }
    }
  }

  // それでも見つからない場合(要素の境界・空白上にキャレットがある等)は、従来どおり境界比較で
  // 「選択先頭を含む/横切った」葉を探す。ただし選択範囲と別ツリー(別の Shadow root や
  // light DOM)にある葉とは比較できず compareBoundaryPoints が例外を投げるので、その葉は
  // 先頭判定の対象から外して読み飛ばす。
  var resultArray = [];
  var isHit = false;
  var index = 0;
  var prevSTART_TO_START = -2;
  var prevSTART_TO_END = -2;
  for(var i = 0; i < elementArray.length; i++){
    let data = elementArray[i];
    let element = data["element"];
    let text = data["text"];
    if(isHit){
      resultArray.push(data);
      continue;
    }
    let elementRange = new Range();
    elementRange.selectNode(element);
    if(!elementRange){
      //console.log("elementRange", elementRange, element);
      continue;
    }
    //console.log("compare", elementRange.compareBoundaryPoints(Range.START_TO_START, range), elementRange.compareBoundaryPoints(Range.START_TO_END, range));
    var START_TO_START, START_TO_END;
    try {
      START_TO_START = elementRange.compareBoundaryPoints(Range.START_TO_START, range)
      START_TO_END = elementRange.compareBoundaryPoints(Range.START_TO_END, range)
    } catch(e){
      // 選択範囲と別ツリーにある葉は比較不能。先頭判定には使えないので飛ばす。
      continue;
    }
    // elementRange の中に range の先頭部分が入っている場合(START_TO_START <= 0 && START_TO_END >= 0)
    // または、前回は elementRange の末尾が range の先頭部分より前(prevSTART_TO_START == -1 && prevSTART_TO_END == -1)で、かつ
    // 今回 elementRange の末尾が range の先頭部分より後(START_TO_START == 1 && START_TO_END == 1)であれば、
    // ここで選択範囲を横切ったと判定する。
    if((START_TO_START <= 0 && START_TO_END >= 0) || (prevSTART_TO_START == -1 && prevSTART_TO_END == -1 && START_TO_START == 1 && START_TO_END == 1)){
      isHit = true;
      resultArray.push(data);

      // TODO: ちゃんとやるなら range.startContainer が
      // element と同じかどうかを確認して、startOffset を使う必要がある
      index = range.startOffset;
      if(text.length < index){
        index = 0;
      }
    }
    prevSTART_TO_START = START_TO_START;
    prevSTART_TO_END = START_TO_END;
  }
  if(resultArray.length <= 0){
    return undefined;
  }
  return {"elementArray": resultArray, "index": index};
}

// [{"element":, "text":}, ...] の配列の text の文字を、全部組み合わせた文字列を取得します
// index は最初のelementでのオフセットになります
function GenerateWholeText(elementArray, index){
  var text = "";
  elementArray.forEach(function(data){
    text += data["text"];
  });
  return text.slice(index);
}

function checkRepeat(elementArray, index, voiceSetting){
  if(isRepeat){
    SpeechWithPageElementArray(elementArray, index, voiceSetting);
    return true;
  }
  return false;
}

// 文字列(text)を受け取って、読み替え辞書(convertDicSortedArray)を使って読み替えた文字列リストを生成する。
// 生成されるデータは
// [{"before":, "after":}, ...]
// という形式で、before から after へと読み替えられるべき、という意味合い。
// convertDicSortedArray は以下の形式
// [{"before":, "after":}, ...]
// で、before に格納されている文字列の長さが長い順に sort されているという前提をおく。(最長マッチ向け)
function GenerateSpeechTextHints(text, convertDicSortedArray) {
  let textArray = Array.from(text);
  var resultArray = [];
  var currentText = "";
  for(var i = 0; i < textArray.length; i++){
    let c = textArray[i];
    var convertData = undefined;
    for(var convertDicIndex in convertDicSortedArray) {
      let convertDic = convertDicSortedArray[convertDicIndex];
      let beforeText = convertDic["before"];
      let beforeFirstChar = Array.from(beforeText)[0];
      if(c !== beforeFirstChar) { continue; }
      let matchTarget = textArray.slice(i, i + beforeText.length).join('');
      if(matchTarget !== beforeText){ continue; }
      i += beforeText.length - 1;
      convertData = convertDic;
      break;
    }
    if(convertData){
      if(currentText.length > 0){
        resultArray.push({"before": currentText, "after": currentText});
        currentText = "";
      }
      resultArray.push(convertData);
      continue;
    }
    currentText += c;
  }
  if(currentText.length > 0){
    resultArray.push({"before": currentText, "after": currentText});
  }
  return resultArray;
}

// 対象の文字列の中から、正規表現でひっかかる文字列を抜き出して、読み替え用の辞書を生成します。
// 注意: pattern に指定するものは、後で new Regexp(pattern, "g") とされるため、複数ヒットします。
function GenerateConvertDictionaryFromRegularExpression(targetText, pattern, convertTo){
  var resultArray = [];
  let regexp = new RegExp(pattern ,"g");
  let matchIterator = targetText.matchAll(regexp);
  for(let match of matchIterator) {
    let matchText = match[0];
    if(matchText){
      let convertedText = matchText.replace(regexp, convertTo);
      resultArray.push({"before": matchText, "after": convertedText});
    }
  }
  return resultArray;
}

function SortConvertDictionary(convertDictionaryArray){
  return convertDictionaryArray.sort(function(a, b){
    let aBefore = a["before"];
    let bBefore = b["before"];
    if(aBefore.length < bBefore.length) { return 1; }
    if(bBefore.length < aBefore.length) { return -1; }
    return aBefore < bBefore;
  });
}

function SpeechTextHintToDisplayText(speechTextHintArray, displayTextIndex = 0){
  var resultText = "";
  for(var i in speechTextHintArray){
    let speechTextHint = speechTextHintArray[i];
    resultText += speechTextHint.before;
  }
  return resultText.slice(displayTextIndex);
}

function SpeechTextHintToSpeechText(speechTextHintArray, speechTextIndex = 0){
  var resultText = "";
  for(var i in speechTextHintArray){
    let speechTextHint = speechTextHintArray[i];
    resultText += speechTextHint.after;
  }
  return resultText.slice(speechTextIndex);
}

function SpeechTextIndexToDisplayTextIndex(speechTextHintArray, index){
  var currentSpeechTextIndex = 0;
  var currentDisplayTextIndex = 0;
  for(var hintIndex in speechTextHintArray){
    let speechTextHint = speechTextHintArray[hintIndex];
    let speechText = speechTextHint.after;
    let displayText = speechTextHint.before;
    if(currentSpeechTextIndex + speechText.length > index){
      let speechTextIndexLength = index - currentSpeechTextIndex;
      let displayTextLength = displayText.length;
      let speechTextLength = speechText.length;
      let diffLength = Math.ceil(displayTextLength * speechTextIndexLength / speechTextLength);
      return currentDisplayTextIndex + diffLength;
    }
    currentDisplayTextIndex += displayText.length;
    currentSpeechTextIndex += speechText.length;
  }
  return currentDisplayTextIndex;
}

function CheckAutopagerizedContentAlive(SiteInfo, displayText){
  let elementArray = extractElementForPageElementArray(GetPageElementArray(SiteInfo));
  let newText = GenerateWholeText(elementArray, 0);
  if(displayText.length < newText.length) {
    return {"hasNewContent": true, "elementArray": elementArray, "index": displayText.length, "newText": newText};
  }
  return {"hasNewContent": false};
}

function WedataConvertTableToLocalConvertDic(json){
  if (Array.isArray(json) != true) { return []; }
  var result = [];
  for(var i = 0; i < json.length; i++){
    let column = json[i];
    if("data" in column){
      let data = column["data"];
      var to = "";
      if("to" in data){ to = data["to"]; }
      if("from" in data){
        result.push({"before": data["from"], "after": to});
      }
    }
  }
  return result;
}

function CreateConvertDic(wholeText, convertTable, regexpConvertTable){
  var convertDic = WedataConvertTableToLocalConvertDic(convertTable);
  let regexpConvertDic = WedataConvertTableToLocalConvertDic(regexpConvertTable);
  for(var i = 0; i < regexpConvertDic.length; i++){
    let dic = regexpConvertDic[i];
    try {
      let resultArray = GenerateConvertDictionaryFromRegularExpression(wholeText, dic.before, dic.after);
      convertDic.push(...resultArray);
    }catch(e){
      console.log("parse RegularExpression error?", e);
    }
  }
  return SortConvertDictionary(convertDic);
}

function GetScrollRatio(voiceSetting) {
  if("scrollPositionRatio" in voiceSetting) {
    let scrollPositionRatio = voiceSetting.scrollPositionRatio;
    if(scrollPositionRatio){
      return 1 - voiceSetting.scrollPositionRatio;
    }
  }
  return 0.65;
}

// 強制スクロールの不感帯(デッドゾーン)の割合を返す。0 は有効な値(従来どおり厳密追従)なので、
// GetScrollRatio と違い 0 を「未設定」と取り違えないよう、値の有無と数値妥当性で判定する。
function GetScrollDeadZoneRatio(voiceSetting) {
  if("scrollDeadZoneRatio" in voiceSetting) {
    let ratio = parseFloat(voiceSetting.scrollDeadZoneRatio);
    if(!isNaN(ratio) && ratio >= 0){
      return ratio;
    }
  }
  return SCROLL_DEAD_ZONE_RATIO;
}

let speechEventHandlerHolder = {};
function SpeechOnBoundary(event){
  // 最初の boundary = 実際に音声が出始めた合図(onstart は iOS で早すぎるため使わない)。
  // ここで「準備中スピナー」→「停止(■)」表示へ切り替える。
  if(fabState === "preparing"){ setFabState("speaking"); }
  if(speechEventHandlerHolder.onboundary){
    speechEventHandlerHolder.onboundary(event);
  }
}
function SpeechOnEnd(event){
  // 一旦「停止(idle)」状態にする。onend が繰り返し/追記継続する場合は
  // 内部で再び StartSpeech() が呼ばれて "preparing" に戻る。
  setFabState("idle");
  if(speechEventHandlerHolder.onend){
    speechEventHandlerHolder.onend(event);
  }
}

function SpeechWithPageElementArray(elementArray, index, voiceSetting, SiteInfo, maxLength = -1){
  StopSpeech();
  let wholeText = GenerateWholeText(elementArray, 0);
  let text = GenerateWholeText(elementArray, index);
  if(text.length <= 0){
    //console.log("no text found");
    return false;
  }
  let convertDic = CreateConvertDic(wholeText, voiceSetting.convertTable, voiceSetting.regexpConvertTable);
  let speechTextHints = GenerateSpeechTextHints(text, convertDic);
  var speechText = SpeechTextHintToSpeechText(speechTextHints, 0);
  if(maxLength > 0){
    speechText = speechText.substring(0, maxLength);
  }
  // Safari は発話テキストに改行が含まれると onboundary の charIndex が 0 のまま進まず、
  // ハイライトが先頭固定になる。改行・タブを「1文字=1スペース」で置換して回避する
  // (長さ・各文字位置が変わらないので、ハイライトの index マッピングは保たれる)。
  speechText = speechText.replace(/[\r\n\t]/g, " ");
  // Safari は ①②③… のような囲み数字が含まれると onboundary の charIndex が壊れ、
  // 0 のまま進まずハイライトが先頭固定になる。①〜⑨ を同じ長さの 1〜9 に置換して回避する
  // (表示は元のまま・発話テキストのみ。長さ保持なのでハイライトの index マッピングも保たれる)。
  speechText = speechText.replace(/[①-⑨]/g, function(ch){
    return String(ch.charCodeAt(0) - 0x2460 + 1);
  });
  speechEventHandlerHolder.onboundary = function(event){
    //console.log("SpeechSynthesisUtterance Event onBoundary", event.charIndex, event);
    let displayTextIndex = SpeechTextIndexToDisplayTextIndex(speechTextHints, event.charIndex);
    let elementData = SearchElementFromIndex(elementArray, displayTextIndex + index);
    if(elementData){
      let highlightLength = 3;
      // 別のelementにかぶって良い場合はこうする
      //let endElementData = SearchElementFromIndex(elementArray, displayTextIndex + index + highlightLength);
      //let endElementIndex = endElementData.index;
      // 同じelementだけに絞る場合はこう。
      let endElementData = elementData;
      let endElementIndex = (elementData.text.length > elementData.index + highlightLength)
      ? elementData.index + highlightLength
      : elementData.text.length;
      HighlightSpeechSentence(elementData.element, elementData.index, endElementData.element, endElementIndex);
      if(voiceSetting.isScrollEnabled == "true"){ // localStorage には boolean が入らないぽいので文字列で入れている
        ScrollToElement(elementData.element, elementData.index, GetScrollRatio(voiceSetting), GetScrollDeadZoneRatio(voiceSetting));
      }
    }
    BoundarySpeechEventHandle(elementArray, event);
  };
  speechEventHandlerHolder.onend = function(event){
    //console.log("SpeechSynthesisUtterance Event onEnd", event);
    RemoveHighlightSpeechSentence();
    //chrome.runtime.sendMessage({"type": "EndSpeech"});

    if(checkRepeat(elementArray, index, voiceSetting)){
      return;
    }

    let isAutopagerizeContinueEnabled = voiceSetting["isAutopagerizeContinueEnabled"];
    if(!isStopped && isAutopagerizeContinueEnabled == "true"){
      let result = CheckAutopagerizedContentAlive(SiteInfo, wholeText);
      if(result.hasNewContent){
        SpeechWithPageElementArray(result.elementArray, result.index, voiceSetting, SiteInfo);
      }
      return;
    }
  };
  speechEventHandlerHolder.onerror = function(event){console.log("SpeechSynthesisUtterance Event onError", event);};
  speechEventHandlerHolder.onmark = function(event){console.log("SpeechSynthesisUtterance Event onMark", event);};
  speechEventHandlerHolder.onpause = function(event){console.log("SpeechSynthesisUtterance Event onPause", event);};
  speechEventHandlerHolder.onresume = function(event){console.log("SpeechSynthesisUtterance Event onResume", event);};
  //console.log("speech", text);
  StartSpeech(speechText, voiceSetting);
  return true;
}

// ===========================================================================
// 本文コンテナの自動推定(軽量ヒューリスティック)
//   選択もされておらず SiteInfo(本文 XPath)も無いページで「開始」したとき、ページ全体を
//   先頭(ナビ等)から読み始めてしまうのを避けるため、本文らしいブロックを推定してそこを
//   開始位置にする。Readability の採点を簡略化したもので、テキスト量・句読点・リンク密度・
//   class/id・カスタム要素名のヒントでブロックを採点する。
//   ニュース記事・ブログ・フィードでは有効。見出しごとに <section> 分割される巨大記事
//   (Wikipedia 等)は苦手で導入部を飛ばすことがある。確実に読みたい所は範囲選択で指定する。
// ===========================================================================

// Shadow DOM 境界(host)を越えて親要素を辿る。
function composedParentElement(node){
  let p = node.parentNode;
  while(p && p.nodeType !== Node.ELEMENT_NODE){
    p = p.host ? p.host : p.parentNode; // ShadowRoot(DocumentFragment)→ host へ
  }
  return p;
}

// ancestor が node を(Shadow DOM 境界を越えて)内包するか。
function composedContains(ancestor, node){
  let p = node;
  var guard = 0;
  while(p && guard++ < 500){
    if(p === ancestor){ return true; }
    if(p.parentNode){
      p = p.parentNode;
      if(p && p.nodeType === 11){ p = p.host; } // DocumentFragment(ShadowRoot)→ host へ
    }else if(p.host){
      p = p.host;
    }else{
      break;
    }
  }
  return false;
}

const CONTENT_POSITIVE_RE = /(article|body|content|entry|main|post|text|story|paragraph)/i;
const CONTENT_NEGATIVE_RE = /(comment|combx|disqus|foot|header|menu|meta|nav|rss|shout|sidebar|sponsor|ad-|advert|promo|social|share|breadcrumb|related|recommend|widget|banner|rail)/i;

function contentTagScore(tagName){
  switch(tagName){
    case "DIV": case "SECTION": case "ARTICLE": case "MAIN": return 5;
    case "PRE": case "TD": case "BLOCKQUOTE": return 3;
    case "ADDRESS": case "OL": case "UL": case "DL": case "DD": case "DT": case "LI": case "FORM": return -3;
    case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": case "TH": return -5;
    default: return 0;
  }
}

function contentClassWeight(el){
  var s = 0;
  let str = ((el.className && typeof el.className === "string") ? el.className : "") + " " + (el.id || "");
  if(CONTENT_NEGATIVE_RE.test(str)){ s -= 25; }
  if(CONTENT_POSITIVE_RE.test(str)){ s += 25; }
  // カスタム要素名(Web Components)のヒント。MSN の <cp-article> 等を拾い、ナビ系を弾く。
  let tn = el.tagName ? el.tagName.toLowerCase() : "";
  if(/(^|-)(article|content|story|post|body|reader)(-|$)/.test(tn)){ s += 25; }
  if(/(^|-)(nav|header|footer|rail|ad|ads|promo|banner|related|recommend)(-|$)/.test(tn)){ s -= 25; }
  return s;
}

// elementArray(本文抽出済みの葉)から本文らしいコンテナ要素を1つ推定して返す。無ければ null。
function estimateMainContentElement(elementArray){
  if(!elementArray || elementArray.length <= 0){ return null; }
  // 葉ごとのメタ: テキスト長 と リンク(<a>)内かどうか。
  let leaves = elementArray.map(function(data){
    let len = (data.text || "").trim().length;
    let inLink = false;
    let p = composedParentElement(data.element);
    var guard = 0;
    while(p && p !== document.body && guard++ < 40){
      if(p.tagName === "A"){ inLink = true; break; }
      p = composedParentElement(p);
    }
    return {node: data.element, len: len, inLink: inLink};
  }).filter(function(o){ return o.len > 0; });
  if(leaves.length <= 0){ return null; }

  // 各葉のスコアを「段落の親・祖父」へ伝播する(本体側 extractElement とは別の採点専用処理)。
  let score = new Map();
  function ensure(el){ if(!score.has(el)){ score.set(el, contentTagScore(el.tagName) + contentClassWeight(el)); } }
  for(let lf of leaves){
    let cs = 1;
    cs += ((lf.node.textContent || "").match(/[,，、。]/g) || []).length; // 句読点が多い=散文=本文っぽい
    cs += Math.min(Math.floor(lf.len / 100), 3);                        // 長文ほど加点(上限あり)
    let para = composedParentElement(lf.node);
    if(!para){ continue; }
    let parent = composedParentElement(para);
    let grand = parent ? composedParentElement(parent) : null;
    if(parent){ ensure(parent); score.set(parent, score.get(parent) + cs); }
    if(grand){ ensure(grand); score.set(grand, score.get(grand) + cs / 2); }
  }
  if(score.size <= 0){ return null; }

  // 上位候補のみリンク密度で最終化する(全候補に内包判定を回すのは重いので上位に絞る)。
  let candidates = Array.from(score.entries()).sort(function(a, b){ return b[1] - a[1]; }).slice(0, 12);
  let scored = [];
  for(let entry of candidates){
    let el = entry[0];
    let total = 0, linkLen = 0;
    for(let lf of leaves){
      if(composedContains(el, lf.node)){ total += lf.len; if(lf.inLink){ linkLen += lf.len; } }
    }
    if(total <= 0){ continue; }
    let linkDensity = linkLen / total;
    scored.push({el: el, finalScore: entry[1] * (1 - linkDensity), linkDensity: linkDensity, total: total});
  }
  if(scored.length <= 0){ return null; }

  let maxFinal = scored.reduce(function(m, o){ return o.finalScore > m ? o.finalScore : m; }, -Infinity);
  // 「十分に本文らしい」候補に限定する: 最高スコアの半分以上 / リンク密度が低め / ある程度の文量。
  let qualified = scored.filter(function(o){
    return o.finalScore >= 0.5 * maxFinal && o.linkDensity < 0.3 && o.total >= 300;
  });
  if(qualified.length <= 0){
    qualified = [scored.slice().sort(function(a, b){ return b.finalScore - a.finalScore; })[0]];
  }

  // ビューポート上側優先: まだ読み終えていない(下端が現在のスクロール位置より下にある)候補のうち
  // 最も上にあるもの=今まさに読もうとしている記事を選ぶ。フィード(複数記事)で「見ている記事」を当てる。
  let scrollY = window.scrollY;
  function absRect(el){
    try{ let r = el.getBoundingClientRect(); return {top: r.top + scrollY, bottom: r.bottom + scrollY}; }
    catch(e){ return null; }
  }
  let withRect = qualified.map(function(o){ return {o: o, rect: absRect(o.el)}; }).filter(function(x){ return x.rect; });
  if(withRect.length <= 0){
    return qualified.slice().sort(function(a, b){ return b.finalScore - a.finalScore; })[0].el;
  }
  let notPassed = withRect.filter(function(x){ return x.rect.bottom > scrollY; });
  let pool = (notPassed.length > 0) ? notPassed : withRect;
  pool.sort(function(a, b){ return a.rect.top - b.rect.top; }); // 上にあるものを優先
  return pool[0].o.el;
}

// 推定した本文コンテナの先頭の葉に対応する、連結テキスト上の開始 index を返す(無ければ 0)。
function estimateMainContentStartIndex(elementArray){
  try{
    let container = estimateMainContentElement(elementArray);
    if(!container){ return 0; }
    var index = 0;
    for(var i = 0; i < elementArray.length; i++){
      if(composedContains(container, elementArray[i].element)){ return index; }
      index += elementArray[i].text.length;
    }
    return 0;
  }catch(e){
    //console.log("estimateMainContentStartIndex error", e);
    return 0;
  }
}

// この SiteInfo が「本文 XPath 指定の無い汎用フォールバック」(//body や *)かどうか。
// 本文コンテナ推定は、選択もこの種のフォールバックも無いとき=何の手がかりも無いときだけ使う。
function isGenericFallbackSiteInfo(SiteInfo){
  let pe = (SiteInfo && SiteInfo.data) ? SiteInfo.data.pageElement : undefined;
  return pe === "//body" || pe === "*";
}

function runSpeechWithSiteInfo(SiteInfo, voiceSetting, isSpeechSelectionOnly){
  var elementArray = extractElementForPageElementArray(GetPageElementArray(SiteInfo));
  //console.log("SiteInfo", SiteInfo, "elementArray", elementArray);
  let selection = window.getSelection();
  var index = 0;
  var maxLength = -1
  if(selection.rangeCount > 0){
    let speechTarget = SplitElementFromSelection(elementArray, getDeepSelectionRange(selection));
    //console.log("speechTarget", speechTarget);
    if(speechTarget){
      let wholeText = GenerateWholeText(elementArray, 0);
      let speechTargetText = GenerateWholeText(speechTarget.elementArray, 0);
      index = wholeText.length - speechTargetText.length + speechTarget.index;
    }else{
      return false;
    }
    if(isSpeechSelectionOnly){
      maxLength = selection.toString().length
    }
  }else if(isGenericFallbackSiteInfo(SiteInfo)){
    // 範囲選択も無く、本文 XPath の手がかり(SiteInfo)も無い場合だけ、本文らしいブロックを
    // 推定してそこを開始位置にする(先頭のナビ等を飛ばして本文から読み始める)。本文以降は
    // 末尾まで読む。SiteInfo がある(本文位置が分かっている)ページや、両ボタンクリック等で
    // キャレット位置が指定されている場合(rangeCount>0)は従来どおりなので影響しない。
    index = estimateMainContentStartIndex(elementArray);
  }
  if(index >= 0 && elementArray && SpeechWithPageElementArray(elementArray, index, voiceSetting, SiteInfo, maxLength)){
    return true;
  }
  return false;
}

// 発話を開始できたら true、読み上げ対象テキストが見つからなければ false を返す。
function runSpeech(SiteInfoArray, voiceSetting, isSpeechSelectionOnly){
  //console.log("runSpeech calling", SiteInfoArray, voiceSetting);
  for(var i = 0; i < SiteInfoArray.length; i++){
    let SiteInfo = SiteInfoArray[i];
    if(runSpeechWithSiteInfo(SiteInfo, voiceSetting, isSpeechSelectionOnly)){
      return true;
    }
  };
  //console.log("runSpeech no SiteInfo hit", SiteInfoArray);
  let dummySiteInfo = {"data":{"pageElement": "*", "url": "^https?://"}};
  return runSpeechWithSiteInfo(dummySiteInfo, voiceSetting, isSpeechSelectionOnly);
}

chrome.runtime.onMessage.addListener(
  function(message, sender, sendResponse){
    //console.log("onMessage", message, sender, sendResponse);
    switch(message.type){
    case "KickSpeech":
      isStopped = false;
      console.log("KickSpeech", message);
      notifyIfNothingToSpeak(runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      false
      ));
      break;
    case "KickSpeechRepeatMode":
      isRepeat = true;
      isStopped = false;
      notifyIfNothingToSpeak(runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      false
      ));
      break;
    case "KickSpeechOnlySelected":
      isStopped = false;
      console.log("KickSpeechOnlySelected", message);
      notifyIfNothingToSpeak(runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      true
      ));
      break;
    case "StopSpeech":
      isRepeat = false;
      isStopped = true;
      setFabState("idle");
      StopSpeech();
      break;
    case "PauseSpeech":
      isStopped = true;
      PauseSpeech();
      break;
    case "ResumeSpeech":
      isStopped = false;
      ResumeSpeech();
      break;
    case "Speech_OnBoundary":
      let event = message.event; // 何故か message に入っているはずの charIndex が消えているので別口で送っているもので上書きします。
      event.charIndex = message.charIndex
      SpeechOnBoundary(message.event);
      break;
    case "Speech_OnEnd":
      SpeechOnEnd(message.event);
      break;
    case "Speech_StartOnContentScript":
      StartSpeechByContentScript(message.speechText, message.voiceSetting);
      break;
    default:
      break;
    }
    sendResponse();
  }
);

function isValidClickTarget(targetNumber){
  switch(targetNumber){
    case 3: case 5: case 6:
      return true;
    default:
      return false;
  }
}

function loadChromeStorageCache(){
  chrome.storage.local.get([
    "startSpeechClickTarget",
    "stopSpeechClickTarget",
    "isDelayAutoScrollEnabled",
    "fabDisplayMode",
    "touchGestureMode",
    "forceTextSelection",
    "fabPosition"
  ], (localStorage) => {
    chromeStorageCache = localStorage;
    initTouchTriggers(); // 設定が読めたのでフローティングボタン等を初期化
  });
}
loadChromeStorageCache();
chrome.storage.onChanged.addListener((changes, namespace)=>{
  for(const [key, {oldValue, newValue}] of Object.entries(changes)){
    chromeStorageCache[key] = newValue;
  }
  initTouchTriggers(); // オプション変更を即時反映
});

var mouseDownButtonsCache = 0;
document.body.addEventListener('mousedown', ev=>{
  mouseDownButtonsCache = ev.buttons;
  const localStorage = chromeStorageCache;
  const startTarget = Number(localStorage["startSpeechClickTarget"]);
  const stopTarget = Number(localStorage["stopSpeechClickTarget"]);
  if(isValidClickTarget(startTarget) && ev.buttons == startTarget){
    StopSpeech();
    chrome.runtime.sendMessage({"type": "RunStartSpeech"});
  }else if(isValidClickTarget(stopTarget) && ev.buttons == stopTarget){
    chrome.runtime.sendMessage({"type": "RunStopSpeech"});
  }
}, true);

// 右クリックメニューを出さない必要があるなら上書きしちゃいます。
document.body.addEventListener('contextmenu', ev => {
  let localStorage = chromeStorageCache;
  var isHit = 0;
  const startTarget = Number(localStorage["startSpeechClickTarget"]);
  const stopTarget = Number(localStorage["stopSpeechClickTarget"]);
  if(isValidClickTarget(startTarget) && mouseDownButtonsCache == startTarget){
    isHit = mouseDownButtonsCache & 2;
  }else if(isValidClickTarget(stopTarget) && mouseDownButtonsCache == stopTarget){
    isHit = mouseDownButtonsCache & 2;
  }
  if(isHit){
    ev.preventDefault();
  }
});

window.addEventListener("beforeunload", function() {
  if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({"type": "onRemoved"}, ()=>{});
  }
});

// ===========================================================================
// タッチ端末(iOS / iPadOS の Safari、Firefox for Android 等)向けトリガー
//   A: ページ内フローティングボタン(FAB) … タップで開始/停止
//   B: 2本指タップジェスチャ            … タップで開始/停止
// どちらも「指で触る端末か」で既定の有効/無効を切り替える(PC では既定で出さない)。
// 設定キー(chrome.storage.local、値はすべて文字列):
//   fabDisplayMode    : "auto"(既定) | "always" | "selection" | "hidden"
//   touchGestureMode  : "auto"(既定) | "on" | "off"
//   forceTextSelection: "true" | "false"(既定)
// 発話の開始/停止は既存のジェスチャと同じく background へ RunStartSpeech /
// RunStopSpeech を送るだけ。開始位置は background→KickSpeech 経由で
// runSpeech() が window.getSelection() を見て決めるので、選択した位置から読める。
// ===========================================================================

// 粗いポインタ & ホバー不可 = 指で触る端末(iOS/iPadOS/Android 等)。
function isTouchPrimaryDevice(){
  return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

function getStoredSetting(key){
  return chromeStorageCache ? chromeStorageCache[key] : undefined;
}

// "auto" を端末で解決する。FAB は タッチ端末→常に表示 / PC→非表示。
function resolveFabMode(){
  let mode = getStoredSetting("fabDisplayMode");
  if(!mode || mode === "auto"){
    return isTouchPrimaryDevice() ? "always" : "hidden";
  }
  return mode;
}
// 2本指タップは標準 OFF。地図のズームアウトや VoiceOver/TalkBack 等と競合しうるため、
// 明示的に有効化した人だけに使わせる("auto" を選ぶとタッチ端末でのみ有効)。
function resolveTouchGestureEnabled(){
  let mode = getStoredSetting("touchGestureMode");
  if(mode === "on"){ return true; }
  if(mode === "auto"){ return isTouchPrimaryDevice(); }
  return false; // 未設定 / "off" は無効(標準 OFF)
}

var fabState = "idle"; // "idle"(▶) | "preparing"(準備中スピナー) | "speaking"(■)
var fabHostElement = null;
var fabButtonElement = null;
var fabHandleElement = null;
var fabIconSvg = null;
var fabSavedRange = null;
var fabDragState = null;
var fabCustomPositioned = false;

// 現在テキスト選択があるか(空白だけ・折りたたみは無視)。
function hasMeaningfulSelection(){
  let sel = window.getSelection();
  return !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0);
}

// FAB の状態(idle/preparing/speaking)を切り替え、見た目を更新する。
// preparing 中はスピナー(ぐるぐる)を回し、実際に発話が始まったら(onstart 受信で)
// speaking(■)へ。これで「停止ボタンなのに無音」という見かけ上の食い違いを無くす。
var fabPrepareFallbackTimer = null;
function setFabState(state){
  fabState = state;
  updateFabButton();                                   // ボタン生成・表示の更新
  renderFabIcon(state);                                // アイコン(再生/停止/スピナー弧)を描画
  if(fabPrepareFallbackTimer){ clearTimeout(fabPrepareFallbackTimer); fabPrepareFallbackTimer = null; }
  if(state === "preparing"){
    startFabSpinner();                                 // 準備中スピナー(弧を回転)開始
    // 保険: onboundary を返さないボイス/ページでもスピナーが回り続けないよう、
    // 一定時間で「発話中」に切り替える(通常は最初の boundary の方が先に来る)。
    fabPrepareFallbackTimer = setTimeout(function(){
      if(fabState === "preparing"){ setFabState("speaking"); }
    }, 15000);
  }else{
    stopFabSpinner();
  }
}

// アイコンは文字(▶/■)だと環境差が大きい(iOS は ▶ が絵文字化、mac は ■ が極小)ため、
// インライン SVG で自前描画して全プラットフォームで同じ見た目にする。
// SVG は DOM(createElementNS)で組み立てるので CSP の影響も受けない。
var SVG_NS = "http://www.w3.org/2000/svg";
function renderFabIcon(state){
  if(!fabIconSvg){ return; }
  while(fabIconSvg.firstChild){ fabIconSvg.removeChild(fabIconSvg.firstChild); }
  fabIconSvg.style.transform = ""; // スピナー回転をリセット
  if(state === "speaking"){
    let rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "6"); rect.setAttribute("y", "6");
    rect.setAttribute("width", "12"); rect.setAttribute("height", "12");
    rect.setAttribute("rx", "2"); rect.setAttribute("fill", "#fff");
    fabIconSvg.appendChild(rect);
  }else if(state === "preparing"){
    let circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "12"); circle.setAttribute("cy", "12"); circle.setAttribute("r", "8");
    circle.setAttribute("fill", "none"); circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "3"); circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("stroke-dasharray", "13 100"); // 短い弧(これを回転させてスピナーにする)
    fabIconSvg.appendChild(circle);
  }else{ // idle = 再生(右向き三角)
    let tri = document.createElementNS(SVG_NS, "polygon");
    tri.setAttribute("points", "8,5 19,12 8,19");
    tri.setAttribute("fill", "#fff");
    fabIconSvg.appendChild(tri);
  }
}

var fabSpinnerTimer = null;
var fabSpinnerDeg = 0;
function startFabSpinner(){
  fabSpinnerDeg = 0;
  if(fabSpinnerTimer){ return; }
  fabSpinnerTimer = setInterval(function(){
    if(fabState !== "preparing" || !fabIconSvg){ return; }
    fabSpinnerDeg = (fabSpinnerDeg + 30) % 360;
    fabIconSvg.style.transform = "rotate(" + fabSpinnerDeg + "deg)";
  }, 80);
}
function stopFabSpinner(){
  if(fabSpinnerTimer){ clearInterval(fabSpinnerTimer); fabSpinnerTimer = null; }
  if(fabIconSvg){ fabIconSvg.style.transform = ""; }
}

// FAB 本体を(まだ無ければ)生成する。ページ CSS の影響を避けるため Shadow DOM に入れ、
// ボタンのスタイルは CSSOM 経由(= CSP の style-src に弾かれない)で当てる。
// Shadow DOM 内のテキストは light DOM に出ないので、本文抽出(//body)にも混ざらない。
function ensureFabCreated(){
  if(fabHostElement){ return; }
  if(!document.body){ return; }
  fabHostElement = document.createElement("div");
  fabHostElement.id = "tabspeech-fab-host";
  fabHostElement.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647;" +
    "right: env(safe-area-inset-right, 0px); bottom: env(safe-area-inset-bottom, 0px);" +
    "margin: 0 12px 16px 0; display: none;";
  let shadow = fabHostElement.attachShadow({mode: "open"});

  // つまみ と 発話ボタン を横並びにするラッパ。
  let wrap = document.createElement("div");
  wrap.style.cssText = "all: initial; display: flex; align-items: center; gap: 4px;";

  // ドラッグ用つまみ。ここを摘んだ時だけ移動する(発話はしない)ので、
  // 「タップ=発話 / つまみ=移動」が物理的に分離され、誤操作が起きない。
  fabHandleElement = document.createElement("div");
  fabHandleElement.textContent = "⠿";
  fabHandleElement.setAttribute("aria-hidden", "true");
  fabHandleElement.style.cssText =
    "all: initial; display: flex; align-items: center; justify-content: center; box-sizing: border-box;" +
    "width: 22px; height: 36px; border-radius: 6px; cursor: grab; touch-action: none;" +
    "font-family: sans-serif; font-size: 16px; line-height: 1; color: #fff;" +
    "background: rgba(0,0,0,0.4); box-shadow: 0 2px 6px rgba(0,0,0,0.25); opacity: 0.7;" +
    "-webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;";
  fabHandleElement.addEventListener("pointerdown", onFabHandlePointerDown);

  fabButtonElement = document.createElement("button");
  fabButtonElement.type = "button";
  fabButtonElement.style.cssText =
    "all: initial; display: flex; align-items: center; justify-content: center; box-sizing: border-box;" +
    "width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;" +
    "color: #fff; background: rgba(0,0,0,0.55); box-shadow: 0 2px 6px rgba(0,0,0,0.3);" +
    "opacity: 0.85; padding: 0;" +
    "-webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;";
  // 自前描画の SVG アイコン(再生/停止/スピナー)。文字グリフの環境差を回避する。
  fabIconSvg = document.createElementNS(SVG_NS, "svg");
  fabIconSvg.setAttribute("viewBox", "0 0 24 24");
  fabIconSvg.setAttribute("width", "22");
  fabIconSvg.setAttribute("height", "22");
  fabIconSvg.style.display = "block";
  fabButtonElement.appendChild(fabIconSvg);
  renderFabIcon(fabState);

  // タップで選択が解除されるのに備え、押した瞬間の選択範囲を退避しておく。
  let saveSelection = function(){
    fabSavedRange = hasMeaningfulSelection() ? window.getSelection().getRangeAt(0).cloneRange() : null;
  };
  // pointerdown は touch/mouse 共通で選択退避に使う(click は阻害しない)。
  fabButtonElement.addEventListener("pointerdown", function(){ saveSelection(); }, true);
  // mouse では mousedown を抑止して選択・フォーカス移動を防ぐ(click は発火する)。
  fabButtonElement.addEventListener("mousedown", function(ev){ saveSelection(); ev.preventDefault(); }, true);
  fabButtonElement.addEventListener("click", function(ev){
    ev.preventDefault();
    ev.stopPropagation();
    onFabActivated();
  });

  wrap.appendChild(fabHandleElement);
  wrap.appendChild(fabButtonElement);
  shadow.appendChild(wrap);
  document.body.appendChild(fabHostElement);
  restoreFabPosition(); // 前回ドラッグした位置があれば復元
}

// FAB を viewport 内にクランプしつつ left/top で配置する(ドラッグ移動・復元の共通処理)。
function applyFabPosition(left, top){
  if(!fabHostElement){ return; }
  let rect = fabHostElement.getBoundingClientRect();
  let w = rect.width || 80;
  let h = rect.height || 48;
  let maxLeft = Math.max(0, window.innerWidth - w);
  let maxTop = Math.max(0, window.innerHeight - h);
  left = Math.min(Math.max(0, left), maxLeft);
  top = Math.min(Math.max(0, top), maxTop);
  // 既定の right/bottom/margin 配置をやめて left/top 絶対配置に切り替える。
  fabHostElement.style.right = "auto";
  fabHostElement.style.bottom = "auto";
  fabHostElement.style.margin = "0";
  fabHostElement.style.left = left + "px";
  fabHostElement.style.top = top + "px";
  fabCustomPositioned = true;
}

function restoreFabPosition(){
  let raw = getStoredSetting("fabPosition");
  if(!raw){ return; }
  try {
    let p = JSON.parse(raw);
    if(typeof p.left === "number" && typeof p.top === "number"){
      applyFabPosition(p.left, p.top);
    }
  } catch(e){ /* 壊れた値は無視 */ }
}

function onFabHandlePointerDown(ev){
  if(!fabHostElement){ return; }
  ev.preventDefault();
  ev.stopPropagation();
  let rect = fabHostElement.getBoundingClientRect();
  fabDragState = {
    pointerId: ev.pointerId,
    offsetX: ev.clientX - rect.left,
    offsetY: ev.clientY - rect.top,
  };
  fabHandleElement.style.cursor = "grabbing";
  try { fabHandleElement.setPointerCapture(ev.pointerId); } catch(e){}
  fabHandleElement.addEventListener("pointermove", onFabHandlePointerMove);
  fabHandleElement.addEventListener("pointerup", onFabHandlePointerUp);
  fabHandleElement.addEventListener("pointercancel", onFabHandlePointerUp);
}

function onFabHandlePointerMove(ev){
  if(!fabDragState){ return; }
  applyFabPosition(ev.clientX - fabDragState.offsetX, ev.clientY - fabDragState.offsetY);
}

function onFabHandlePointerUp(ev){
  if(!fabDragState){ return; }
  try { fabHandleElement.releasePointerCapture(fabDragState.pointerId); } catch(e){}
  fabHandleElement.removeEventListener("pointermove", onFabHandlePointerMove);
  fabHandleElement.removeEventListener("pointerup", onFabHandlePointerUp);
  fabHandleElement.removeEventListener("pointercancel", onFabHandlePointerUp);
  fabHandleElement.style.cursor = "grab";
  fabDragState = null;
  let rect = fabHostElement.getBoundingClientRect();
  chrome.storage.local.set({ fabPosition: JSON.stringify({left: rect.left, top: rect.top}) });
}

// 画面回転・リサイズで FAB が画面外に出ないよう、独自位置のときは再クランプする。
window.addEventListener("resize", function(){
  if(fabCustomPositioned && fabHostElement){
    let rect = fabHostElement.getBoundingClientRect();
    applyFabPosition(rect.left, rect.top);
  }
});

// 退避した選択範囲を(現在の選択が失われていたら)復元する。
function restoreSavedSelection(){
  if(!fabSavedRange){ return; }
  if(hasMeaningfulSelection()){ return; } // 生きている選択があればそちらを優先
  let sel = window.getSelection();
  sel.removeAllRanges();
  try { sel.addRange(fabSavedRange); } catch(e){ /* 範囲が無効になっていることがある */ }
}

// iOS Safari は「ユーザー操作の中で speechSynthesis.speak() を呼ぶ」ことを要求する。
// FAB/ジェスチャのタップは content script 内のユーザー操作なので、ここで無音の
// ダミー発話を一度流してエンジンを解錠しておく。実際の発話は background 往復後に
// 非同期で届くが、同一ドキュメントで一度解錠されていれば許可される(not-allowed 回避)。
function primeSpeechSynthesis(){
  try {
    let u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.resume();
  } catch(e){ /* 古い環境など */ }
}

function onFabActivated(){
  if(fabState !== "idle"){
    // 準備中 or 発話中はどちらも停止扱い(準備中の取り消しも含む)。
    chrome.runtime.sendMessage({"type": "RunStopSpeech"});
  }else{
    primeSpeechSynthesis(); // iOS: ユーザー操作中に発話エンジンを解錠しておく
    restoreSavedSelection();
    // 押した瞬間に「準備中(スピナー)」へ。本文が多いと発話開始まで時間がかかるので、
    // その間「再生」のままだと「押し損なった?」と再タップしてしまうのを防ぐ。
    // 実際に発話できなかった場合は notifyIfNothingToSpeak() が "idle" に戻す。
    // 万一開始が取れずスピナーのまま固まっても、もう一度押せば RunStopSpeech →
    // StopSpeech 受信で "idle" に戻るので詰まらない(自己回復する)。
    setFabState("preparing");
    chrome.runtime.sendMessage({"type": "RunStartSpeech"});
  }
}

// 表示モードと発話/選択状態に応じて FAB を出し分ける(アイコン自体は renderFabIcon が担当)。
// 発話中はハイライトのために選択が頻繁に書き換わる(selectionchange 連発)ので、
// 値が変わった時だけ DOM を触る。
function updateFabButton(){
  let mode = resolveFabMode();
  if(mode === "hidden"){
    if(fabHostElement && fabHostElement.style.display !== "none"){ fabHostElement.style.display = "none"; }
    return;
  }
  ensureFabCreated();
  if(!fabButtonElement){ return; }
  let active = (fabState !== "idle"); // 準備中 or 発話中
  let visible = (mode === "always") || active || (mode === "selection" && hasMeaningfulSelection());
  let display = visible ? "block" : "none";
  if(fabHostElement.style.display !== display){ fabHostElement.style.display = display; }
  let opacity = active ? "0.95" : "0.85";
  if(fabButtonElement.style.opacity !== opacity){ fabButtonElement.style.opacity = opacity; }
}

// 「選択時のみ表示」モードの時だけ選択変化で出し分ける。
// always/hidden では選択は表示に影響しないので、発話中のハイライトによる
// selectionchange 連発で無駄に DOM を触らないようにする。
document.addEventListener("selectionchange", function(){
  if(resolveFabMode() === "selection"){ updateFabButton(); }
});

// --- B: 2本指タップで開始/停止 ---
var twoFingerState = null;
function initTouchGesture(){
  document.addEventListener("touchstart", function(e){
    if(e.touches.length === 2){
      twoFingerState = {
        startTime: performance.now(),
        moved: false,
        x0: e.touches[0].clientX, y0: e.touches[0].clientY,
        x1: e.touches[1].clientX, y1: e.touches[1].clientY,
      };
    }else{
      twoFingerState = null; // 1本/3本以上が混ざったら不成立
    }
  }, {passive: true, capture: true});
  document.addEventListener("touchmove", function(e){
    if(!twoFingerState || e.touches.length < 2){ return; }
    let d0 = Math.hypot(e.touches[0].clientX - twoFingerState.x0, e.touches[0].clientY - twoFingerState.y0);
    let d1 = Math.hypot(e.touches[1].clientX - twoFingerState.x1, e.touches[1].clientY - twoFingerState.y1);
    if(d0 > 12 || d1 > 12){ twoFingerState.moved = true; } // スクロール/ピンチとみなす
  }, {passive: true, capture: true});
  document.addEventListener("touchend", function(e){
    if(!twoFingerState){ return; }
    if(e.touches.length === 0){ // 全部離れたら判定
      let dt = performance.now() - twoFingerState.startTime;
      if(!twoFingerState.moved && dt < 500 && resolveTouchGestureEnabled()){
        onFabActivated(); // FAB と同じ開始/停止トグル
      }
      twoFingerState = null;
    }
  }, {passive: true, capture: true});
}

// --- 選択を強制的に有効化(選択禁止ページ対策) ---
var forceSelectStyleElement = null;
function applyForceTextSelection(){
  let enabled = getStoredSetting("forceTextSelection") === "true";
  if(enabled && !forceSelectStyleElement){
    forceSelectStyleElement = document.createElement("style");
    forceSelectStyleElement.id = "tabspeech-force-select";
    forceSelectStyleElement.textContent =
      "*, *::before, *::after { -webkit-user-select: text !important; user-select: text !important; }";
    (document.head || document.documentElement).appendChild(forceSelectStyleElement);
  }else if(!enabled && forceSelectStyleElement){
    forceSelectStyleElement.remove();
    forceSelectStyleElement = null;
  }
}

// --- 一時表示トースト(数秒でフェードアウト) ---
// Google Docs のように Canvas で本文を描画していてテキストを取り出せないページなど、
// 「読み上げられるものが無かった」時に静かに無反応で終わらず、軽く知らせる用途。
var toastHostElement = null;
var toastInnerElement = null;
var toastHideTimer = null;
function showTransientToast(messageText){
  if(!document.body){ return; }
  if(!toastHostElement){
    toastHostElement = document.createElement("div");
    toastHostElement.id = "tabspeech-toast-host"; // 本文抽出(Shadow DOM 貫通)から除外するため
    toastHostElement.style.cssText =
      "all: initial; position: fixed; z-index: 2147483647; left: 50%;" +
      "bottom: calc(env(safe-area-inset-bottom, 0px) + 80px); transform: translateX(-50%); display: none;";
    let shadow = toastHostElement.attachShadow({mode: "open"});
    toastInnerElement = document.createElement("div");
    toastInnerElement.style.cssText =
      "all: initial; display: block; box-sizing: border-box; max-width: 80vw;" +
      "padding: 10px 16px; border-radius: 8px; font-family: sans-serif; font-size: 14px; line-height: 1.4;" +
      "color: #fff; background: rgba(0,0,0,0.8); box-shadow: 0 2px 8px rgba(0,0,0,0.4);" +
      "text-align: center; opacity: 0; transition: opacity 0.3s;";
    shadow.appendChild(toastInnerElement);
    document.body.appendChild(toastHostElement);
  }
  toastInnerElement.textContent = messageText;
  toastHostElement.style.display = "block";
  requestAnimationFrame(function(){ toastInnerElement.style.opacity = "0.95"; }); // フェードイン
  if(toastHideTimer){ clearTimeout(toastHideTimer); }
  toastHideTimer = setTimeout(function(){
    toastInnerElement.style.opacity = "0"; // フェードアウト
    setTimeout(function(){ if(toastHostElement){ toastHostElement.style.display = "none"; } }, 350);
  }, 2800);
}

// runSpeech() が何も発話できなかった(=読み上げ対象テキストが無かった)時に知らせる。
function notifyIfNothingToSpeak(didStart){
  if(didStart){ return; }
  setFabState("idle"); // 準備中スピナーにしていた場合は「再生」へ戻す
  let msg = chrome.i18n.getMessage("ContentNoReadableTextMessage");
  showTransientToast(msg || "読み上げられるテキストが見つかりませんでした。");
}

// 設定読み込み後・変更時に呼ばれる初期化(ジェスチャ登録は一度きり)。
var touchGestureInitialized = false;
function initTouchTriggers(){
  if(!touchGestureInitialized){
    initTouchGesture();
    touchGestureInitialized = true;
  }
  updateFabButton();
  applyForceTextSelection();
}

//console.log("TabSpeech contentscript loaded.");

