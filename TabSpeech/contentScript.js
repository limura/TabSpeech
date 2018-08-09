var isRepeat = false;
let speechSynthesis = window.speechSynthesis;
function getVoiceList() {
  let voices = speechSynthesis.getVoices();
  return voices;
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

function CreateVoiceSetting(lang, voice, pitch, rate, volume){
  return {
    "lang": lang,
    "voice": voice,
    "pitch": pitch,
    "rate": rate,
    "volume": volume,
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

function GetNextLink(SiteInfo){
  if("data" in SiteInfo && "nextLink" in SiteInfo.data){
    return document.evaluate(SiteInfo.data.pageElement, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  }
  return undefined;
}

function HighlightSpeechSentence(element, index){
  //element.parentNode.scrollIntoView(true); // TEXT_NODE には scrollIntoView が無いっぽい(´・ω・`)
  let range = new Range();
  //range.selectNodeContents(element); // selectNodeContents() では子要素が無いと駄目
  range.selectNode(element);
  if(index > 0){
    range.setStart(element, index);
  }
  let selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function RemoveHighlightSpeechSentence(){
  chrome.runtime.sendMessage({"type": "EndSpeech"});
  let selection = window.getSelection();
}

function StartSpeechEventHandle(element, event){
  chrome.runtime.sendMessage({"type": "StartSpeech"});
  HighlightSpeechSentence(element);
}

function EndSpeechEventHandle(element, event){
  chrome.runtime.sendMessage({"type": "EndSpeech"});
  RemoveHighlightSpeechSentence();
}

function BoundarySpeechEventHandle(element, event){
  
}

function isNotSpeechElement(element){
  if(element instanceof HTMLElement){
    switch(element.tagName){
    case "SCRIPT":
    case "STYLE":
      return true;
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

function extractElementForPageElementArray(pageElementArray){
  var elementArray = [];
  for(var i = 0; i < pageElementArray.snapshotLength; i++){
    let element = pageElementArray.snapshotItem(i);
    elementArray = elementArray.concat(extractElement(element));
  }
  return elementArray;
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
      return {"element": element, "text": text, "index": index}
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
    if(elementRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
      elementRange.compareBoundaryPoints(Range.START_TO_END, range) >= 0){
      isHit = true;
      resultArray.push(data);

      // TODO: ちゃんとやるなら range.startContainer が
      // element と同じかどうかを確認して、startOffset を使う必要がある
      index = range.startOffset;
      if(text.length < index){
        index = 0;
      }
    }
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
    //console.log("text += ", data["text"], index);
    text += data["text"].slice(index);
    index = 0;
  });
  return text;
}

function checkRepeat(elementArray, nextLink, index, voiceSetting){
  if(isRepeat){
    SpeechWithPageElementArray(elementArray, nextLink, index, voiceSetting);
  }
}

function SpeechWithPageElementArray(elementArray, nextLink, index, voiceSetting){
  StopSpeech();
  let text = GenerateWholeText(elementArray, index);
  if(text.length <= 0){
    //console.log("no text found");
    return false;
  }
  let utterance = new SpeechSynthesisUtterance(text);
  utterance.onboundary = function(event){
    //console.log("SpeechSynthesisUtterance Event onBoundary", event.charIndex, event);
    let elementData = SearchElementFromIndex(elementArray, event.charIndex);
    if(elementData){
      HighlightSpeechSentence(elementData.element, elementData.index);
    }
    BoundarySpeechEventHandle(elementArray, event);
  };
  utterance.onstart = function(event){
    //console.log("SpeechSynthesisUtterance Event onStart", event);
    chrome.runtime.sendMessage({"type": "StartSpeech"});
  };
  utterance.onend = function(event){
    //console.log("SpeechSynthesisUtterance Event onEnd", event);
    RemoveHighlightSpeechSentence();
    chrome.runtime.sendMessage({"type": "EndSpeech"});
    checkRepeat(elementArray, nextLink, index, voiceSetting);
  };
  utterance.onerror = function(event){console.log("SpeechSynthesisUtterance Event onError", event);};
  utterance.onmark = function(event){console.log("SpeechSynthesisUtterance Event onMark", event);};
  utterance.onpause = function(event){console.log("SpeechSynthesisUtterance Event onPause", event);};
  utterance.onresume = function(event){console.log("SpeechSynthesisUtterance Event onResume", event);};
  ApplyVoiceSetting(utterance, voiceSetting);
  //console.log("speech", text);
  speechSynthesis.speak(utterance);
  return true;
}

function runSpeechWithSiteInfo(SiteInfo, voiceSetting){
  var elementArray = extractElementForPageElementArray(GetPageElementArray(SiteInfo));
  let nextLink = GetNextLink(SiteInfo);
  //console.log("SiteInfo", SiteInfo, "elementArray", elementArray);
  let selection = window.getSelection();
  var index = -1;
  if(selection.rangeCount > 0){
    let speechTarget = SplitElementFromSelection(elementArray, selection.getRangeAt(0));
    //console.log("speechTarget", speechTarget);
    if(speechTarget){
      elementArray = speechTarget.elementArray;
      index = speechTarget.index;
    }
  }else{
    index = 0;
  }
  if(index >= 0 && elementArray && SpeechWithPageElementArray(elementArray, nextLink, index, voiceSetting)){
    return true;
  }
  return false;
}

function runSpeech(SiteInfoArray, voiceSetting){
  //console.log("runSpeech calling", SiteInfoArray, voiceSetting);
  for(var i = 0; i < SiteInfoArray.length; i++){
    let SiteInfo = SiteInfoArray[i];
    if(runSpeechWithSiteInfo(SiteInfo, voiceSetting)){
      return;
    }
    /*
    var elementArray = extractElementForPageElementArray(GetPageElementArray(SiteInfo));
    let nextLink = GetNextLink(SiteInfo);
    //console.log("SiteInfo", SiteInfo, "elementArray", elementArray);
    let selection = window.getSelection();
    var index = 0;
    if(selection.rangeCount > 0){
      let speechTarget = SplitElementFromSelection(elementArray, selection.getRangeAt(0));
      //console.log("speechTarget", speechTarget);
      if(speechTarget){
        elementArray = speechTarget.elementArray;
        index = speechTarget.index;
      }
    }
    if(elementArray && SpeechWithPageElementArray(elementArray, nextLink, index, voiceSetting)){
      return;
    }
    */
  };
  //console.log("runSpeech no SiteInfo hit", SiteInfoArray);
  let dummySiteInfo = {"data":{"pageElement": "*", "url": "^https?://"}};
  runSpeechWithSiteInfo(dummySiteInfo, voiceSetting);
}

chrome.runtime.onMessage.addListener(
  function(message, sender, sendResponse){
    //console.log("onMessage", message, sender, sendResponse);
    switch(message.type){
    case "KickSpeech":
      //console.log("KickSpeech", message);
      runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSetting(message.lang, message.voice, message.pitch, message.rate, message.volume)
      );
      break;
    case "KickSpeechRepeatMode":
      isRepeat = true;
      runSpeech(
        message.SiteInfoArray.concat([{"data":{"pageElement": "//body", "nextLink": "", "url": ".*"}}]),
        CreateVoiceSetting(message.lang, message.voice, message.pitch, message.rate, message.volume)
      );
      break;
    case "StopSpeech":
      isRepeat = false;
      StopSpeech();
      break;
    case "PauseSpeech":
      PauseSpeech();
      break;
    case "ResumeSpeech":
      ResumeSpeech();
      break;
    default:
      break;
    }
  }
);

//console.log("TabSpeech contentscript loaded.");
