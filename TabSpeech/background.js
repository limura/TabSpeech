let expireMillisecond = 100 * 60 * 60 * 1;
let kotosekaiSiteInfoURL = "http://wedata.net/databases/%E3%81%93%E3%81%A8%E3%81%9B%E3%81%8B%E3%81%84Web%E3%83%9A%E3%83%BC%E3%82%B8%E8%AA%AD%E3%81%BF%E8%BE%BC%E3%81%BF%E7%94%A8%E6%83%85%E5%A0%B1/items_all.json";
let autopagerizeSiteInfoURL = "http://wedata.net/databases/AutoPagerize/items_all.json";

var siteInfo = [];
var siteInfoFetchMillisecond = 0;

function FetchSiteInfo(url){
  fetch(url)
  .then(function(response){
    return response.json();
  }).then(function(json){
    siteInfo = siteInfo.concat(json);
    siteInfoFetchMillisecond = (new Date()).getTime();
  });
}

async function UpdateSiteInfo(){
  siteInfo = [];
  await FetchSiteInfo(kotosekaiSiteInfoURL);
  await FetchSiteInfo(autopagerizeSiteInfoURL);
  siteInfoFetchMillisecond = (new Date()).getTime();
}
UpdateSiteInfo();

function GetSiteInfo(){
  let thisDate = new Date();
  let expireMs = thisDate.getTime() - expireMillisecond;
  let currentSiteInfo = siteInfo;
  if(siteInfoFetchMillisecond < expireMs){
    UpdateSiteInfo();
  }
  return currentSiteInfo;
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
  return result;
}

var status = "stop";
function StatusStartSpeech(){
  status = "speech";
}
function StatusEndSpeech(){
  status = "stop";
}

function RunStartSpeech(tabId, url){
  let siteInfoArray = SearchSiteInfo(url);
  console.log("RunStartSpeech", localStorage["lang"], localStorage);
  chrome.tabs.sendMessage(tabId, {
    "type": "KickSpeech",
    "SiteInfoArray": siteInfoArray,
    "lang": localStorage["lang"],
    "voice": localStorage["voice"],
    "pitch": localStorage["pitch"],
    "rate": localStorage["rate"],
    "volume": localStorage["volume"]
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
  RunStartSpeech(tabId, url);
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
    RunStartSpeech(tab.id, tab.url);
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
    default:
      break;
    }
  }
);

