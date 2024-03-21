let speechSynthesis = window.speechSynthesis;

function getVoiceList() {
    let voices = speechSynthesis.getVoices();
    return voices;
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
 

function StopSpeech() {
    speechSynthesis.cancel();
}

function StartSpeech(tabId, speechText, voiceSetting){
    StopSpeech();
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
    speechSynthesis.speak(utterance);
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("onMessage", request);
    switch (request.type) {
        case "StartSpeech":
            StartSpeech(request.tabId, request.speechText, request.voiceSetting);
            break;
        case "StopSpeech":
            StopSpeech();
            break;
        default:
            break;
    }
});
  
