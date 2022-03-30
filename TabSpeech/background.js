let expireMillisecond = 100 * 60 * 60 * 1;
let kotosekaiSiteInfoURL = "http://wedata.net/databases/%E3%81%93%E3%81%A8%E3%81%9B%E3%81%8B%E3%81%84Web%E3%83%9A%E3%83%BC%E3%82%B8%E8%AA%AD%E3%81%BF%E8%BE%BC%E3%81%BF%E7%94%A8%E6%83%85%E5%A0%B1/items.json";
let autopagerizeSiteInfoURL = "http://wedata.net/databases/AutoPagerize/items.json";
let defaultConvertTableURL = "http://wedata.net/databases/TTS%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items.json";
let defaultRegexpConvertTableURL = "http://wedata.net/databases/TTS%20Regulaer%20Expression%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items.json";

function storageGetPromise(storage, targetArray){
  return new Promise(resolve => {
    storage.get(targetArray, function(items){
      resolve(items);
    });
  });
}
function storageGetPromiseOne(storage, target){
  return new Promise(resolve => {
    storage.get([target], function(items){
      if(target in items){
        resolve(items[target]);
      }else{
        resolve(undefined);
      }
    });
  });
}
function storageSetPromise(storage, keyValue){
  return new Promise(resolve => {
    storage.set(keyValue, function(values){
      resolve(values);
    });
  });
}

function siteInfoSortFunc(a, b){
  var aLen = 0;
  var bLen = 0;
  if('data' in a && 'url' in a.data){
    aLen = ("" + a.data.url).length;
  }
  if('data' in b && 'url' in b.data){
    bLen = ("" + b.data.url).length;
  }
  return bLen - aLen;
}

function FetchJson(url){
  return new Promise(resolve => {
    fetch(url)
    .then(function(response){
      resolve(response.json());
    });
  });
}

function FetchSiteInfo(url){
  return new Promise(resolve => {
    fetch(url)
    .then(function(response){
      return response.json();
    }).then(function(json){
      json.sort(siteInfoSortFunc);
      resolve(json);
    }).catch(function(err){console.log("FetchSiteInfo error", err);});
  });
}

function GetFromStorage(key){
  return new Promise(resolve => {
    chrome.storage.local.get([key], (data) => {
      if(key in data){
        resolve(data[key]);
      }else{
        resolve(undefined);
      }
    });
  });
}

async function UpdateSiteInfoAsync(){
  let siteInfoKotosekai = await FetchSiteInfo(kotosekaiSiteInfoURL);
  let siteInfoAutopagerize = await FetchSiteInfo(autopagerizeSiteInfoURL);
  siteInfoFetchMillisecond = (new Date()).getTime();
  var siteInfo = [].concat(siteInfoKotosekai);
  siteInfo = siteInfo.concat(siteInfoAutopagerize);
  chrome.storage.local.set({
    'siteInfo': siteInfo,
    'siteInfoFetchMillisecond': siteInfoFetchMillisecond,
  });
  //console.log("loaded.", siteInfoKotosekai, siteInfoAutopagerize, siteInfo);
}
function UpdateSiteInfo(){
  UpdateSiteInfoAsync();
}
UpdateSiteInfo();

async function UpdateConvertTablesAsync(){
  let convertTableURL = await GetFromStorage("convertTableURL");
  if(!convertTableURL){
    convertTableURL = defaultConvertTableURL;
  }
  let regexpConvertTableURL = await GetFromStorage("regexpConvertTableURL");
  if(!regexpConvertTableURL){
    regexpConvertTableURL = defaultRegexpConvertTableURL;
  }
  let convertTableTmp = await FetchJson(convertTableURL);
  let regexpConvertTableTmp = await FetchJson(regexpConvertTableURL);
  let convertTableFetchMillisecond = (new Date()).getTime();
  chrome.storage.local.set({
    convertTableFetchMillisecond: convertTableFetchMillisecond
  });
  if(convertTableTmp){
    chrome.storage.local.set({
      convertTable: convertTableTmp
    });
  }
  if(regexpConvertTableTmp){
    chrome.storage.local.set({
      regexpConvertTable: regexpConvertTableTmp
    });
  }
}
function UpdateConvertTable(){
  UpdateConvertTablesAsync();
}
UpdateConvertTable();

async function GetSiteInfo(){
  let thisDate = new Date();
  let expireMs = thisDate.getTime() - expireMillisecond;
  let currentSiteInfo = await storageGetPromiseOne(chrome.storage.local, "siteInfo");
  chrome.storage.local.get(["siteInfoFetchMillisecond"], ({siteInfoFetchMillisecond}) => {
    if(siteInfoFetchMillisecond < expireMs){
      UpdateSiteInfo();
    }
  });
  return currentSiteInfo;
}

async function GetConvertTables(){
  let thisDate = new Date();
  let expireMs = thisDate.getTime() - expireMillisecond;
  let currentConvertTable = await storageGetPromiseOne(chrome.storage.local, "convertTable");;
  let currentRegexpConvertTable = await storageGetPromiseOne(chrome.storage.local, "regexpConvertTable");
  let convertTableFetchMillisecond = await storageGetPromiseOne(chrome.storage.local, "convertTableFetchMillisecond"); 
  if(convertTableFetchMillisecond < expireMs){
    UpdateConvertTable();
  }
  return [currentConvertTable, currentRegexpConvertTable];
}

function SearchSiteInfo(url, siteInfo){
  var result = [];
  siteInfo.forEach(function(info){
    if("data" in info){
      let data = info["data"];
      if("url" in data){
        let urlRegExpPattern = data["url"];
        let regex = new RegExp(urlRegExpPattern);
        if(regex.test(url)){
          result.push(info);
        }
      }
    }
  });
  console.log(url, result);
  return result;
}

var status = "stop";
function StatusStartSpeech(){
  //status = "speech";
}
function StatusEndSpeech(){
  //status = "stop";
}

async function RunStartSpeech(tabId, url, kickType){
  let siteInfo = await GetSiteInfo();
  let siteInfoArray = SearchSiteInfo(url, siteInfo);
  let convertTables = await GetConvertTables();
  chrome.storage.local.get([
    "lang", "voice", "pitch", "rate", "volume"
    , "isScrollEnabled", "isAutopagerizeContinueEnabled", "scrollPositionRatio"
    , "extensionId"
  ], (localStorage) => {
    chrome.tabs.sendMessage(tabId, {
      "type": kickType,
      "SiteInfoArray": siteInfoArray,
      "lang": localStorage["lang"],
      "voice": localStorage["voice"],
      "pitch": localStorage["pitch"],
      "rate": localStorage["rate"],
      "volume": localStorage["volume"],
      "isScrollEnabled": localStorage["isScrollEnabled"],
      "isAutopagerizeContinueEnabled": localStorage["isAutopagerizeContinueEnabled"],
      "convertTable": convertTables[0],
      "regexpConvertTable": convertTables[1],
      "scrollPositionRatio": localStorage["scrollPositionRatio"],
      "extensionId": localStorage["extensionId"],
    });
  })
  StatusStartSpeech();
}

function RunStopSpeech(tabId){
  chrome.tabs.sendMessage(tabId, {"type": "StopSpeech"});
  StatusEndSpeech();
}

function RunPauseSpeech(tabId){
  chrome.tabs.sendMessage(tabId, {"type": "PauseSpeech"});
}

function RunResumeSpeech(tabId){
  chrome.tabs.sendMessage(tabId, {"type": "ResumeSpeech"});
}

function KickSpeech(tabId, url){
  /* TODO: status がいらなそうなので外して試します。いらないなら後で消します。
  if(status == "speech"){
    RunStopSpeech(tabId);
    return;
  }
  */
  RunStartSpeech(tabId, url, "KickSpeech");
}

chrome.action.onClicked.addListener(function(tab){KickSpeech(tab.id, tab.url);});

function enableActionButton(tabId){
  chrome.action.enable(tabId);
}

chrome.tabs.onUpdated.addListener(function(tabId){
  chrome.tabs.get(tabId, function(tab){
    enableActionButton(tabId);
  });
});

function RunInCurrentTab(func){
  if(!func){
    return;
  }
  chrome.tabs.query({
    currentWindow: true,
    active: true
  }, function(tabArray){
    if(tabArray.length > 0){
      func(tabArray[0]);
    }
  });
}

function StartSpeech(){
  RunInCurrentTab(function(tab){
    RunStartSpeech(tab.id, tab.url, "KickSpeech");
  });
}
function StopSpeech(){
  RunInCurrentTab(function(tab){
    RunStopSpeech(tab.id);
  });
}
function PauseSpeech(){
  RunInCurrentTab(function(tab){
    RunPauseSpeech(tab.id);
  });
}
function ResumeSpeech(){
  RunInCurrentTab(function(tab){
    RunResumeSpeech(tab.id);
  });
}
function StartSpeechRepeatMode(){
  RunInCurrentTab(function(tab){
    RunStartSpeech(tab.id, tab.url, "KickSpeechRepeatMode");
  });
}
function StartSpeechOnlySelected(){
  RunInCurrentTab(function(tab){
    RunStartSpeech(tab.id, tab.url, "KickSpeechOnlySelected");
  });
}

// ServiceWorker 側で発話(window.speechSynthesis ではなく chrome.tts で発話)します。
// これは window.speechSynthesis(contentScript側)で発話しようとすると、
// そのタブでキー入力等があった後でないと 'not-allowed' で発話が失敗するため、仕方なく
// ServiceWorker 側で動かすようにしたものです。
// そのため、発話の開始時に contentScript 側から ServiceWorker側 を呼び出し、
// ServiceWorker はその設定で発話と発話周りのイベントハンドルだけを行い、
// 発生したイベントは contentScript に投げ返すような形で実装しています。
function RunSpeechOnServiceWorker(tabId, request){
  let speechText = request.speechText;
  let options = {};
  let setting = request.voiceSetting;
  let lang = setting.lang;
  if(lang){
    options.lang = lang;
  }
  options.voiceName = setting.voice;
  options.pitch = Number(setting.pitch);
  options.rate = Number(setting.rate);
  options.volume = Number(setting.volume);
  options.extensionId = setting.extensionId;

  //options.desiredEventTypes = ["word", "start", "end", "error", "sentence", "marker", "interrupted", "cancelled", "pause", "resume"];
  options.onEvent = (event) => {
    //console.log("chrome.tts onevent", event);
    switch(event.type) {
      case "start":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnStart",
          event: event,
        });
        break;
      case "end":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnEnd",
          event: event,
        });
        break;
      case "word":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnBoundary",
          event: event,
        });
        break;
      case "sentence":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnBoundary",
          event: event,
        });
        break;
      case "marker":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnBoundary",
          event: event,
        });
        break;
      case "interrupted":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnEnd",
          event: event,
        });
        break;
      case "cancelled":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnEnd",
          event: event,
        });
        break;
      case "error":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnEnd",
          event: event,
        });
        break;
      case "pause":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnEnd",
          event: event,
        });
        break;
      case "resume":
        chrome.tabs.sendMessage(tabId, {
          type: "SpeechOnServiceWorker_OnStart",
          event: event,
        });
        break;
      }
  };
  chrome.storage.local.set({currentSpeechTabId: tabId});
  //console.log("chrome.tts speak", speechText, options);
  chrome.tts.speak(speechText, options);
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse){
    switch(request.type){
    case "StartSpeech":
      StatusStartSpeech();
      break;
    case "EndSpeech":
      StatusEndSpeech();
      break;

    case "RunStartSpeech":
      StartSpeech();
      break;
    case "RunStopSpeech":
      StopSpeech();
      break;
    case "RunPauseSpeech":
      PauseSpeech();
      break;
    case "RunResumeSpeech":
      ResumeSpeech();
      break;
    case "KickSpeechRepeatMode":
      StartSpeechRepeatMode();
      break;
    case "SpeechOnServiceWorker":
      //console.log("Speech on ServiceWorker", sender, request);
      RunSpeechOnServiceWorker(sender.tab.id, request);
      break;
    case "StopChromeTTS":
      chrome.storage.local.get(["currentSpeechTabId"], (data)=>{
        if(sender.tab.id == data.currentSpeechTabId){
          chrome.tts.stop();
        }
      });
      break;
    default:
      break;
    }
  }
);

chrome.commands.onCommand.addListener(function(command) {
  switch(command){
  case "start-speech":
    StartSpeech();
    break;
  case "stop-speech":
    StopSpeech();
    break;
  case "pause-speech":
    PauseSpeech();
    break;
  case "resume-speech":
    ResumeSpeech();
    break;
  }
});


// service worker が起動して一回だけ動かくやーつ
self.addEventListener('install', ev => {
  const rightClickMenuId_OnlySelection = "TabSpeech_ContextMenu_StartSpeechOnlySelected";
  const rightClickMenuId_StartSpeech = "TabSpeech_ContextMenu_StartSpeech";

  chrome.contextMenus.onClicked.addListener((info,tab) => {
    console.log("chrome.contextMenus.onClicked", info, tab, "chrome.i18n.getMessage", chrome.i18n.getMessage);
    switch(info.menuItemId){
      case rightClickMenuId_OnlySelection:
        StartSpeechOnlySelected();
        break;
      case rightClickMenuId_StartSpeech:
        StartSpeech();
        break;
      default:
        console.log("unknown menuItemId", info.menuItemId, info);
        break;
    }
  });

  chrome.storage.local.get(["migrateFromLocalStorage"], (data) => {
    if(!("migrateFromLocalStorage" in data)) {
      chrome.runtime.openOptionsPage();
    }
  });

  chrome.contextMenus.create({
    id: rightClickMenuId_OnlySelection,
    title: chrome.i18n.getMessage("RightClickMenu_SpeechSelected_Title"),
    contexts: ["selection"],
    type: "normal",
  }, () => chrome.runtime.lastError);

  chrome.contextMenus.create({
    id: rightClickMenuId_StartSpeech,
    title: chrome.i18n.getMessage("RightClickMenu_StartSpeechHere_Title"),
    contexts: ["page"],
    type: "normal",
  }, () => chrome.runtime.lastError);
  
});
 
