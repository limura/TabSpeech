function SendMessageToCurrentTab(message){
  chrome.tabs.query({currentWindow: true, active: true}, tabArray => {
    chrome.tabs.sendMessage(tabArray[0].id, message);
  });
}
function SendMessageToBackground(message){
  chrome.runtime.sendMessage(message);
}

var SendMessage = SendMessageToBackground;

function SpeechButtonClicked(){
  SendMessage({"type": "RunStartSpeech"});
}
function StopButtonClicked(){
  SendMessage({"type": "RunStopSpeech"});
}
function PauseButtonClicked(){
  SendMessage({"type": "RunPauseSpeech"});
}
function ResumeButtonClicked(){
  SendMessage({"type": "RunResumeSpeech"});
}
function RepeatModeSpeechButtonClicked(){
  SendMessage({"type": "KickSpeechRepeatMode"});
}
function OpenOptionsPageButtonClicked(){
  chrome.runtime.openOptionsPage();
}

document.getElementById("SpeechButton").onclick = SpeechButtonClicked;
document.getElementById("StopButton").onclick = StopButtonClicked;
document.getElementById("PauseButton").onclick = PauseButtonClicked;
document.getElementById("ResumeButton").onclick = ResumeButtonClicked;
document.getElementById("RepeatModeSpeechButton").onclick = RepeatModeSpeechButtonClicked;
document.getElementById("OpenOptionsPage").onclick = OpenOptionsPageButtonClicked;
