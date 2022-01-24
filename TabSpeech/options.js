let defaultConvertTableURL = chrome.i18n.getMessage("DefaultConvertTableURL");
let defaultRegexpConvertTableURL = chrome.i18n.getMessage("DefaultRegexpConvertTableURL");

function localizeHtmlPage() {
  document.querySelectorAll("[data-i18n-text]").forEach(element => {
    const key = element.getAttribute("data-i18n-text");
    element.textContent = chrome.i18n.getMessage(key);
  });

  document.querySelectorAll("[data-i18n-value]").forEach(element => {
    const key = element.getAttribute("data-i18n-value");
    element.value = chrome.i18n.getMessage(key);
  });
}

async function getVoiceList(speechSynthesis) {
  return new Promise(resolve =>{
    if(chrome.tts){
      chrome.tts.getVoices((data)=>{
        console.log("voices on chrome.tts", data);
        resolve(data);
      })
    }else{
      let voices = speechSynthesis.getVoices();
      console.log("voices on speechSynthesis", voices);
      resolve(voices);
    }
  });
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
    }else if("voiceName" in voice){
      resultSet.add(voice.voiceName);
    }
  }
  return Array.from(resultSet.values());
}

function searchVoiceFromName(voices, name){
  for(let voice of voices){
    if("name" in voice && voice.name == name){
      return voice;
    }
    if("voiceName" in voice && voice.voiceName == name){
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

function getScrollPositionRatio(){
  return document.getElementById("scrollPositionRatio").value;
}

function getIsAutopagerizeContinueEnabled(){
  return document.getElementById("isAutopagerizeContinueEnabled").checked ? "true" : "false";
}

function getConvertTableURL(){
  return document.getElementById("convertTableURL").value;
}

function getRegexpConvertTableURL(){
  return document.getElementById("regexpConvertTableURL").value;
}

function testOnChromeTTS(voices){
  console.log("test on chrome tts", voices);
  let testText = getTestText();
  let options = {};
  let lang = getLang(voices);
  if(lang){
    options.lang = lang;
  }
  let voice = getVoice(voices);
  if(voice){
    options.voiceName = voice.voiceName;
    if("extensionId" in voice){
      options.extensionId = voice.extensionId;
    }
  }
  options.pitch = Number(getPitch());
  options.rate = Number(getRate());
  options.volume = Number(getVolume());

  console.log(testText, options);

  chrome.tts.speak(testText, options);
}

function testButtonClicked(speechSynthesis, voices){
  if(chrome.tts){
    testOnChromeTTS(voices);
    return;
  }
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
    chrome.storage.local.set({lang: lang});
  }else{
    chrome.storage.local.remove("lang");
  }
  let voice = getVoice(voices);
  if(voice){
    if(voice.voiceName){
      chrome.storage.local.set({voice: voice.voiceName});
      console.log("save: voice", voice.voiceName);
    }else{
      chrome.storage.local.set({voice: voice.name});
      console.log("save: voice", voice.name);
    }
    if(voice.extensionId){
      chrome.storage.local.set({extensionId: voice.extensionId});
      console.log("save: extensionId", voice.extensionId);
    }else{
      chrome.storage.local.remove("extensionId");
      console.log("save: remove extensionId");
    }
  }else{
    chrome.storage.local.remove("voice");
  }
  chrome.storage.local.set({
    "pitch": getPitch(),
    "rate": getRate(),
    "volume": getVolume(),
    "isScrollEnabled": getIsScrollEnabled(),
    "scrollPositionRatio": getScrollPositionRatio(),
    "isAutopagerizeContinueEnabled": getIsAutopagerizeContinueEnabled(),
    "convertTableURL": getConvertTableURL(),
    "regexpConvertTableURL": getRegexpConvertTableURL(),
  });

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
  chrome.storage.local.get([
    "lang",
    "voice",
    "pitch",
    "rate",
    "volume",
    "isScrollEnabled",
    "scrollPositionRatio",
    "isAutopagerizeContinueEnabled",
    "convertTableURL",
    "regexpConvertTableURL",
  ], (localStorage) => {
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
      let rateValue = localStorage.rate;
      let rate = document.getElementById("rate");
      if(rateValue >= 2.0){
        document.getElementById("isRateMaxStrech").checked = true;
        rate.max = 10;
      }
      rate.value = rateValue;
      document.getElementById("rateValue").innerHTML = rateValue;
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
    if("scrollPositionRatio" in localStorage){
      document.getElementById("scrollPositionRatio").value = localStorage.scrollPositionRatio;
    }
    if("isAutopagerizeContinueEnabled" in localStorage){
      let isAutopagerizeContinueEnabled = localStorage.isAutopagerizeContinueEnabled;
      if(isAutopagerizeContinueEnabled == "false"){
        document.getElementById("isAutopagerizeContinueEnabled").checked = false;
      }else{
        document.getElementById("isAutopagerizeContinueEnabled").checked = true;
      }
    }
    if("convertTableURL" in localStorage){
      document.getElementById("convertTableURL").value = localStorage.convertTableURL;
    }else{
      document.getElementById("convertTableURL").value = defaultConvertTableURL;
    }
    if("regexpConvertTableURL" in localStorage){
      document.getElementById("regexpConvertTableURL").value = localStorage.regexpConvertTableURL;
    }else{
      document.getElementById("regexpConvertTableURL").value = defaultRegexpConvertTableURL;
    }
  });
}

function clearSettings(){
  chrome.storage.local.clear();
  location.reload();
}

function createVoiceSelectElement(parentElement, voices, targetLang){
  let voiceNames = getVoiceNames(filterVoiceForLang(voices, targetLang));
  parentElement.innerHTML = '';
  parentElement.appendChild(createSelectElement(voiceNames, "voice", function(element){}));
}

function addConvertColumn(parentElement, identity, from, to){
  let columnBody = document.createElement("div");
  columnBody.innerHTML = '<input type="text" id="from:' + identity + '" value="' + from + '"></input> -> <input type="text" id="to:' + identity + '" value="' + to + '"></input>';
  parentElement.appendChild(columnBody);
}

function initRateValueWatcher(inputIdentity, valueIdentity){
  let input = document.getElementById(inputIdentity);
  let value = document.getElementById(valueIdentity);
  input.addEventListener('input', () => {
    value.innerHTML = input.value;
  });
  input.addEventListener('change', () => {
    value.innerHTML = input.value;
  });
}

function initRateMaxStrechExtension(rateId, valueId, toggleId, warningId){
  let toggle = document.getElementById(toggleId);
  let warning = document.getElementById(warningId);
  let rate = document.getElementById(rateId);
  let value = document.getElementById(valueId);
  toggle.addEventListener('change', () => {
    if(toggle.checked){
      warning.style.display = "block";
      rate.max = 10;
    }else{
      warning.style.display = "none";
      if(rate.value > 2){
        rate.value = 2;
        value.innerHTML = "2";
      }
      rate.max = 2;
    }
  });
}

// localStorage を使っていた場合、そちらから chrome.storage.local に移行します。
function migrateFromLocalStorage(){
  chrome.storage.local.get(["migrateFromLocalStorage"], (data) => {
    if("migrateFromLocalStorage" in data){return;}
    chrome.storage.local.set({
      "lang": localStorage["lang"],
      "voice": localStorage["voice"],
      "pitch": localStorage["pitch"],
      "rate": localStorage["rate"],
      "volume": localStorage["volume"],
      "isScrollEnabled": localStorage["isScrollEnabled"],
      "scrollPositionRatio": localStorage["scrollPositionRatio"],
      "isAutopagerizeContinueEnabled": localStorage["isAutopagerizeContinueEnabled"],
      "convertTableURL": localStorage["convertTableURL"],
      "regexpConvertTableURL": localStorage["regexpConvertTableURL"],
      "migrateFromLocalStorage": true,
    });
  });
}

let speechSynthesis = window.speechSynthesis;
async function init(){
  let voices = await getVoiceList(speechSynthesis);
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
  initRateValueWatcher("rate", "rateValue");
  initRateMaxStrechExtension("rate", "rateValue", "isRateMaxStrech", "isRateMaxStrechWarningText");
  loadSettings(voices);
};

document.getElementById('configureShortcuts').onclick = function(e) {
  chrome.tabs.update({ url: 'chrome://extensions/shortcuts' });
};

const awaitVoices = new Promise(resolve => speechSynthesis.onvoiceschanged = resolve);
awaitVoices.then(()=>{init();});

migrateFromLocalStorage();
localizeHtmlPage();
