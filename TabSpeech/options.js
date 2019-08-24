function getVoiceList(speechSynthesis) {
  let voices = speechSynthesis.getVoices();
  return voices;
}

function getVoiceLangueges(voices) {
  var langSet = new Set();
  for(let voice of voices){
    if("lang" in voice){
      langSet.add(voice.lang);
    }
  }
  return Array.from(langSet.values());
}

function filterVoiceForLang(voices, lang) {
  var result = [];
  for(let voice of voices){
    if("lang" in voice && voice.lang == lang){
      result.push(voice);
    }
  }
  return result;
}

function getVoiceNames(voices) {
  var resultSet = new Set();
  for(let voice of voices){
    if("name" in voice){
      resultSet.add(voice.name);
    }
  }
  return Array.from(resultSet.values());
}

function searchVoiceFromName(voices, name){
  for(let voice of voices){
    if("name" in voice && voice.name == name){
      return voice;
    }
  }
  return undefined;
}

function createSelectElement(nameArray, selectorId, onChangeFunction){
  let selectElement = document.createElement("select");
  selectElement.id = selectorId;
  for(let name of nameArray){
    let optionElement = document.createElement("option");
    optionElement.value = name;
    optionElement.innerHTML = name;
    selectElement.appendChild(optionElement);
  }
  selectElement.onchange = function(){
    onChangeFunction(selectElement);
  };
  return selectElement;
}

function getLang(voices){
  let lang = document.getElementById("lang").value;
  if(lang == "DEFAULT"){
    return undefined;
  }
  return lang;
}

function getVoice(voices){
  let lang = document.getElementById("lang").value;
  if(lang == "DEFAULT"){
    return undefined;
  }
  let voiceName = document.getElementById("voice").value;
  return searchVoiceFromName(voices, voiceName);
}

function getPitch(){
  return document.getElementById("pitch").value;
}

function getRate(){
  return document.getElementById("rate").value;
}

function getVolume(){
  return document.getElementById("volume").value;
}

function getTestText(){
  let text = document.getElementById("testText").value;
  if(!text){
    return "メロスは激怒した。必ず、かのじゃちぼうぎゃくの王を除かなければならぬと決意した。";
  }
  return text;
}

function getIsScrollEnabled(){
  return document.getElementById("isScrollEnabled").checked ? "true" : "false";
}

function testButtonClicked(speechSynthesis, voices){
  speechSynthesis.cancel();
  let testText = getTestText();
  let utterance = new SpeechSynthesisUtterance(testText);
  let lang = getLang(voices);
  if(lang){
    utterance.lang = lang;
  }
  let voice = getVoice(voices);
  if(voice){
    utterance.voice = voice;
  }
  utterance.pitch = getPitch();
  utterance.rate = getRate();
  utterance.volume = getVolume();

  console.log(testText,
    "lang", lang,
    "voice", voice,
    "pitch", utterance.pitch,
    "rate", utterance.pitch,
    "volume", utterance.pitch);

  speechSynthesis.speak(utterance);
}

function saveButtonClicked(voices, savedInformationElement){
  let lang = getLang(voices);
  if(lang){
    localStorage["lang"] = lang;
  }else{
    delete localStorage.lang;
  }
  let voice = getVoice(voices);
  if(voice){
    localStorage["voice"] = voice.name;
  }else{
    delete localStorage.voice;
  }
  localStorage["pitch"] = getPitch();
  localStorage["rate"] = getRate();
  localStorage["volume"] = getVolume();
  localStorage["isScrollEnabled"] = getIsScrollEnabled();

console.log("saved localStorage", localStorage);

  savedInformationElement.innerHTML = "saved!";
  setTimeout(function(){
    savedInformationElement.innerHTML = "";
  }, 1000);
}

function selectSelected(selectElement, targetValue){
  for(var i = 0; i < selectElement.options.length; i++){
    let option = selectElement.options[i];
    let value = option.value;
    if(value == targetValue){
      option.selected = true;
      return;
    }
  }
}

function loadSettings(voices){
  if("lang" in localStorage){
    let lang = localStorage.lang;
    selectSelected(document.getElementById("langSelector").childNodes[0], lang);
    let voiceSelectorElement = document.getElementById("voiceSelector");
    createVoiceSelectElement(voiceSelectorElement, voices, lang);
  }
  if("voice" in localStorage){
    selectSelected(document.getElementById("voiceSelector").childNodes[0], localStorage.voice);
  }
  if("pitch" in localStorage){
    document.getElementById("pitch").value = localStorage.pitch;
  }
  if("rate" in localStorage){
    document.getElementById("rate").value = localStorage.rate;
  }
  if("volume" in localStorage){
    document.getElementById("volume").value = localStorage.volume;
  }
  if("isScrollEnabled" in localStorage){
    let isScrollEnabled = localStorage.isScrollEnabled;
    if(isScrollEnabled == "false"){
      document.getElementById("isScrollEnabled").checked = false;
    }else{
      document.getElementById("isScrollEnabled").checked = true;
    }
  }
}

function clearSettings(){
  delete localStorage.removeItem("lang");
  delete localStorage.removeItem("voice");
  delete localStorage.removeItem("pitch");
  delete localStorage.removeItem("rate");
  delete localStorage.removeItem("volume");
  delete localStorage.ramogeItem("isScrollEnabled");
  location.reload();
}

function createVoiceSelectElement(parentElement, voices, targetLang){
  let voiceNames = getVoiceNames(filterVoiceForLang(voices, targetLang));
  parentElement.innerHTML = '';
  parentElement.appendChild(createSelectElement(voiceNames, "voice", function(element){}));
}

let speechSynthesis = window.speechSynthesis;
function init(){
  let voices = getVoiceList(speechSynthesis);
  let languageNameArray = ["DEFAULT"].concat(getVoiceLangueges(voices));
  let langElement = document.getElementById("langSelector");
  langElement.innerHTML = '';
  langElement.appendChild(createSelectElement(languageNameArray, "lang", function(element){
    let index = element.selectedIndex;
    let lang = element.options[index].value;
    let voiceSelectorElement = document.getElementById("voiceSelector");
    createVoiceSelectElement(voiceSelectorElement, voices, lang);
  }));

  document.getElementById("voiceSelectorTest").onclick = function(){
    testButtonClicked(speechSynthesis, voices);
  };
  let savedInformationElement = document.getElementById("savedInfomation");
  document.getElementById("save").onclick = function(){
    saveButtonClicked(voices, savedInformationElement);
  };
  document.getElementById("voiceSettingReset").onclick = clearSettings;
  loadSettings(voices);
};

document.getElementById('configureShortcuts').onclick = function(e) {
  chrome.tabs.update({ url: 'chrome://extensions/shortcuts' });
};

const awaitVoices = new Promise(resolve => speechSynthesis.onvoiceschanged = resolve);
awaitVoices.then(()=>{init();});

