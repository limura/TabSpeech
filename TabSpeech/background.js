let expireMillisecond = 100 * 60 * 60 * 1;
let kotosekaiSiteInfoURL = "http://wedata.net/databases/%E3%81%93%E3%81%A8%E3%81%9B%E3%81%8B%E3%81%84Web%E3%83%9A%E3%83%BC%E3%82%B8%E8%AA%AD%E3%81%BF%E8%BE%BC%E3%81%BF%E7%94%A8%E6%83%85%E5%A0%B1/items.json";
let autopagerizeSiteInfoURL = "http://wedata.net/databases/AutoPagerize/items.json";
let defaultConvertTableURL = "http://wedata.net/databases/TTS%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items.json";
let defaultRegexpConvertTableURL = "http://wedata.net/databases/TTS%20Regulaer%20Expression%20Convert%20Table%20for%20Apple%20TTS%20Engine%20(jp)/items.json";

var siteInfo = [];
var siteInfoFetchMillisecond = 0;
var convertTableFetchMillisecond = 0;
var convertTable = [];
var regexpConvertTable = [];

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
    });
  });
}

async function UpdateSiteInfoAsync(){
  let siteInfoKotosekai = await FetchSiteInfo(kotosekaiSiteInfoURL);
  let siteInfoAutopagerize = await FetchSiteInfo(autopagerizeSiteInfoURL);
  siteInfoFetchMillisecond = (new Date()).getTime();
  siteInfo = [].concat(siteInfoKotosekai);
  siteInfo = siteInfo.concat(siteInfoAutopagerize);
  //console.log("loaded.", siteInfoKotosekai, siteInfoAutopagerize, siteInfo);
}
function UpdateSiteInfo(){
  UpdateSiteInfoAsync();
}
UpdateSiteInfo();

async function UpdateConvertTablesAsync(){
  let convertTableURL = localStorage["convertTableURL"];
  if(!convertTableURL){
    convertTableURL = defaultConvertTableURL;
  }
  let regexpConvertTableURL = localStorage["regexpConvertTableURL"];
  if(!regexpConvertTableURL){
    regexpConvertTableURL = defaultRegexpConvertTableURL;
  }
  let convertTableTmp = await FetchJson(convertTableURL);
  let regexpConvertTableTmp = await FetchJson(regexpConvertTableURL);
  convertTableFetchMillisecond = (new Date()).getTime();
  if(convertTableTmp){ convertTable = convertTableTmp; }
  if(regexpConvertTableTmp){ regexpConvertTable = regexpConvertTableTmp; }
}
function UpdateConvertTable(){
  UpdateConvertTablesAsync();
}
UpdateConvertTable();

function GetSiteInfo(){
  let thisDate = new Date();
  let expireMs = thisDate.getTime() - expireMillisecond;
  let currentSiteInfo = siteInfo;
  if(siteInfoFetchMillisecond < expireMs){
    UpdateSiteInfo();
  }
  return currentSiteInfo;
}

function GetConvertTables(){
  let thisDate = new Date();
  let expireMs = thisDate.getTime() - expireMillisecond;
  let currentConvertTable = convertTable;
  let currentRegexpConvertTable = regexpConvertTable;
  if(convertTableFetchMillisecond < expireMs){
    UpdateConvertTable();
  }
  return [currentConvertTable, currentRegexpConvertTable];
}

function SearchSiteInfo(url){
  var result = [];
  let siteInfo = GetSiteInfo();
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
  status = "speech";
}
function StatusEndSpeech(){
  status = "stop";
}

function RunStartSpeech(tabId, url, kickType){
  let siteInfoArray = SearchSiteInfo(url);
  let convertTables = GetConvertTables();
  //console.log("RunStartSpeech", localStorage["lang"], localStorage, tabId);
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
  });
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
  if(status == "speech"){
    RunStopSpeech(tabId);
    return;
  }
  RunStartSpeech(tabId, url, "KickSpeech");
}

chrome.pageAction.onClicked.addListener(function(tab){KickSpeech(tab.id, tab.url);});

function enableActionButton(tabId){
  chrome.pageAction.show(tabId);
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

/*
chrome.contextMenus.create({
    title: chrome.i18n.getMessage("RightClickMenu_StartSpeechHere_Title"),
    contexts: ["selection"],
    type: "normal",
    onclick: function (info) {
	StartSpeech();
    }
}); */
chrome.contextMenus.create({
    title: chrome.i18n.getMessage("RightClickMenu_SpeechSelected_Title"),
    contexts: ["selection"],
    type: "normal",
    onclick: function (info) {
	StartSpeechOnlySelected();
    }
});
 
