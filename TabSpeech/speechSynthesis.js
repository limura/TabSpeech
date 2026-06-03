let speechSynthesis = window.speechSynthesis;

function getVoiceList() {
    let voices = speechSynthesis.getVoices();
    return voices;
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
 

function StopSpeech() {
    speechSynthesis.cancel();
}

function PauseSpeech() {
    speechSynthesis.pause();
}

function ResumeSpeech() {
    speechSynthesis.resume();
}

var currentSpeechTabId = undefined;
function OnRemovedEventHandler(tabId) {
    if(currentSpeechTabId == tabId) {
        StopSpeech();
        currentSpeechTabId = undefined;
    }
}

// getVoices() は offscreen 生成直後など初回に空のことがある。空のまま speak すると
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

function StartSpeech(tabId, speechText, voiceSetting){
    StopSpeech();
    speakWhenVoicesReady(function(){
      let utterance = new SpeechSynthesisUtterance(speechText);
      utterance.onboundary = function(event){
          chrome.runtime.sendMessage({"type": "OnBoundary", "event": event, "tabId": tabId, "charIndex": event.charIndex});
      };
      utterance.onstart = function(event){
        //chrome.runtime.sendMessage({"type": "StartSpeech", "event": event, "tabId": tabId });
      };
      utterance.onend = function(event){
        chrome.runtime.sendMessage({"type": "EndSpeech", "event": event, "tabId": tabId });
      };
      utterance.onerror = function(event){console.log("SpeechSynthesisUtterance Event onError", event);};
      utterance.onmark = function(event){console.log("SpeechSynthesisUtterance Event onMark", event);};
      utterance.onpause = function(event){console.log("SpeechSynthesisUtterance Event onPause", event);};
      utterance.onresume = function(event){console.log("SpeechSynthesisUtterance Event onResume", event);};
      ApplyVoiceSetting(utterance, voiceSetting);
      currentSpeechTabId = tabId;
      speechSynthesis.speak(utterance);
    });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // offscreen 宛て(target: 'offscreen')のメッセージだけを処理する。
    // content script → background の StartSpeech 等も runtime ブロードキャストでここに届くため、
    // それらを誤って処理して二重発話しないように弾く。
    if (request.target !== 'offscreen') {
        return;
    }
    console.log("onMessage", request);
    switch (request.type) {
        // 停止は background が offscreen ドキュメントごと閉じて行うため、ここに StopSpeech は無い。
        case "StartSpeech":
            StartSpeech(request.tabId, request.speechText, request.voiceSetting);
            break;
        case "PauseSpeech":
            PauseSpeech();
            break;
        case "ResumeSpeech":
            ResumeSpeech();
            break;
        case "TabClosed":
            OnRemovedEventHandler(request.tabId);
            break;
        default:
            break;
    }
    sendResponse();
});
  
