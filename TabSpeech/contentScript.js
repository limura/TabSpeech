var isRepeat = false;
var isStopped = true;
let speechSynthesis = window.speechSynthesis;
var chromeStorageCache = undefined;

function getVoiceList() {
  let voices = speechSynthesis.getVoices();
  return voices;
}

function StartSpeechByContentScript(speechText, voiceSetting){
    //console.log("[TabSpeech] StartSpeechByContentScript: speak on content script. length=", (speechText||"").length, "voices=", window.speechSynthesis.getVoices().length);
    StopSpeech();
    let utterance = new SpeechSynthesisUtterance(speechText);
    utterance.onboundary = function(event){
        SpeechOnBoundary(event);
    };
    utterance.onstart = function(event){
      //chrome.runtime.sendMessage({"type": "StartSpeech", "event": event, "tabId": tabId });
    };
    utterance.onend = function(event){
        SpeechOnEnd(event);
    };
    utterance.onerror = function(event){console.log("SpeechSynthesisUtterance Event onError", event);};
    utterance.onmark = function(event){console.log("SpeechSynthesisUtterance Event onMark", event);};
    utterance.onpause = function(event){console.log("SpeechSynthesisUtterance Event onPause", event);};
    utterance.onresume = function(event){console.log("SpeechSynthesisUtterance Event onResume", event);};
    ApplyVoiceSetting(utterance, voiceSetting);
    //currentSpeechTabId = tabId;
    speechSynthesis.speak(utterance);
}

function StartSpeech(text, voiceSetting) {
    autoScrollActive = true;
    setFabSpeaking(true); // 全ての発話開始(初回・繰り返し・追記継続・Safari直接)がここを通る
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
  return CreateVoiceSetting(message.lang, message.voice, message.pitch, message.rate, message.volume, message.isScrollEnabled, message.isAutopagerizeContinueEnabled, message.convertTable, message.regexpConvertTable, message.scrollPositionRatio);
}

function CreateVoiceSetting(lang, voice, pitch, rate, volume, isScrollEnabled, isAutopagerizeContinueEnabled, convertTable, regexpConvertTable, scrollPositionRatio){
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
  };
}

function ApplyVoiceSetting(utterance, voiceSetting){
  if(voiceSetting.lang){
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

function ScrollToElement(element, index, margin) {
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
  if(!document.contains(element)) { return; }
  //element.parentNode.scrollIntoView(true); // TEXT_NODE には scrollIntoView が無いっぽい(´・ω・`)
  let range = new Range();
  //range.selectNodeContents(element); // selectNodeContents() では子要素が無いと駄目
  range.selectNode(element);
  if(element && index > 0){
    range.setStart(element, index);
  }
  if(endElement && endIndex > 0 && document.contains(endElement)){
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

function extractElement(element){
  if(isNotSpeechElement(element)){
    return [];
  }
  if(element.childNodes.length <= 0){
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
  for(var i = 0; i < element.childNodes.length; i++){
    let childNode = element.childNodes[i];
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

// elementArray から range で示された範囲を先頭とする elementArray と、その先頭の index を返す
// 返されるのは {"elementArray": , "index": } の形式で、発見できなかった場合は undefined が返る
function SplitElementFromSelection(elementArray, range){
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
    let START_TO_START = elementRange.compareBoundaryPoints(Range.START_TO_START, range)
    let START_TO_END = elementRange.compareBoundaryPoints(Range.START_TO_END, range)
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
    prevSTART_TO_START = elementRange.compareBoundaryPoints(Range.START_TO_START, range)
    prevSTART_TO_END = elementRange.compareBoundaryPoints(Range.START_TO_END, range)
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

let speechEventHandlerHolder = {};
function SpeechOnBoundary(event){
  if(speechEventHandlerHolder.onboundary){
    speechEventHandlerHolder.onboundary(event);
  }
}
function SpeechOnEnd(event){
  // 一旦「停止」状態にする。onend が繰り返し/追記継続する場合は
  // 内部で再び StartSpeech() が呼ばれて setFabSpeaking(true) に戻る。
  setFabSpeaking(false);
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
        ScrollToElement(elementData.element, elementData.index, GetScrollRatio(voiceSetting));
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

function runSpeechWithSiteInfo(SiteInfo, voiceSetting, isSpeechSelectionOnly){
  var elementArray = extractElementForPageElementArray(GetPageElementArray(SiteInfo));
  //console.log("SiteInfo", SiteInfo, "elementArray", elementArray);
  let selection = window.getSelection();
  var index = 0;
  var maxLength = -1
  if(selection.rangeCount > 0){
    let speechTarget = SplitElementFromSelection(elementArray, selection.getRangeAt(0));
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
  }
  if(index >= 0 && elementArray && SpeechWithPageElementArray(elementArray, index, voiceSetting, SiteInfo, maxLength)){
    return true;
  }
  return false;
}

function runSpeech(SiteInfoArray, voiceSetting, isSpeechSelectionOnly){
  //console.log("runSpeech calling", SiteInfoArray, voiceSetting);
  for(var i = 0; i < SiteInfoArray.length; i++){
    let SiteInfo = SiteInfoArray[i];
    if(runSpeechWithSiteInfo(SiteInfo, voiceSetting, isSpeechSelectionOnly)){
      return;
    }
  };
  //console.log("runSpeech no SiteInfo hit", SiteInfoArray);
  let dummySiteInfo = {"data":{"pageElement": "*", "url": "^https?://"}};
  runSpeechWithSiteInfo(dummySiteInfo, voiceSetting, isSpeechSelectionOnly);
}

chrome.runtime.onMessage.addListener(
  function(message, sender, sendResponse){
    //console.log("onMessage", message, sender, sendResponse);
    switch(message.type){
    case "KickSpeech":
      isStopped = false;
      console.log("KickSpeech", message);
      runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      false
      );
      break;
    case "KickSpeechRepeatMode":
      isRepeat = true;
      isStopped = false;
      runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      false
      );
      break;
    case "KickSpeechOnlySelected":
      isStopped = false;
      console.log("KickSpeechOnlySelected", message);
      runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSettingFromMessage(message),
	      true
      );
      break;
    case "StopSpeech":
      isRepeat = false;
      isStopped = true;
      setFabSpeaking(false);
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
    "forceTextSelection"
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
// 2本指タップは タッチ端末→既定 ON / PC→既定 OFF。
function resolveTouchGestureEnabled(){
  let mode = getStoredSetting("touchGestureMode");
  if(!mode || mode === "auto"){
    return isTouchPrimaryDevice();
  }
  return mode === "on";
}

var fabIsSpeaking = false;
var fabHostElement = null;
var fabButtonElement = null;
var fabSavedRange = null;

// 現在テキスト選択があるか(空白だけ・折りたたみは無視)。
function hasMeaningfulSelection(){
  let sel = window.getSelection();
  return !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0);
}

// 発話状態が変わったら FAB の見た目(▶/■)と表示を更新する。
function setFabSpeaking(isSpeaking){
  fabIsSpeaking = isSpeaking;
  updateFabButton();
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
  fabButtonElement = document.createElement("button");
  fabButtonElement.type = "button";
  fabButtonElement.textContent = "▶"; // ▶
  fabButtonElement.style.cssText =
    "all: initial; display: block; box-sizing: border-box;" +
    "width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer;" +
    "font-family: sans-serif; font-size: 22px; line-height: 48px; text-align: center;" +
    "color: #fff; background: rgba(0,0,0,0.55); box-shadow: 0 2px 6px rgba(0,0,0,0.3);" +
    "opacity: 0.85; padding: 0;" +
    "-webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;";

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

  shadow.appendChild(fabButtonElement);
  document.body.appendChild(fabHostElement);
}

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
  if(fabIsSpeaking){
    chrome.runtime.sendMessage({"type": "RunStopSpeech"});
  }else{
    primeSpeechSynthesis(); // iOS: ユーザー操作中に発話エンジンを解錠しておく
    restoreSavedSelection();
    chrome.runtime.sendMessage({"type": "RunStartSpeech"});
  }
}

// 表示モードと発話/選択状態に応じて FAB を出し分ける。
// 発話中はハイライトのために選択が頻繁に書き換わる(selectionchange 連発)ので、
// 値が変わった時だけ DOM を触る。さもないとクリック中に文字ノードが差し替わって
// 中央のタップが取りこぼされる。
function updateFabButton(){
  let mode = resolveFabMode();
  if(mode === "hidden"){
    if(fabHostElement && fabHostElement.style.display !== "none"){ fabHostElement.style.display = "none"; }
    return;
  }
  ensureFabCreated();
  if(!fabButtonElement){ return; }
  let visible = (mode === "always") || fabIsSpeaking || (mode === "selection" && hasMeaningfulSelection());
  let display = visible ? "block" : "none";
  if(fabHostElement.style.display !== display){ fabHostElement.style.display = display; }
  let label = fabIsSpeaking ? "■" : "▶"; // ■ / ▶
  if(fabButtonElement.textContent !== label){ fabButtonElement.textContent = label; }
  let opacity = fabIsSpeaking ? "0.95" : "0.85";
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

