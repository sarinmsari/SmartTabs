chrome.runtime.onInstalled.addListener(() => {
  console.log("✅ Smart Auto Tab Grouper installed");
});

chrome.tabs.onCreated.addListener((tab) => {
  console.log("🆕 New tab opened:", tab);
});

const defaultRules = {
  "facebook.com": { group: "Social", color: "blue" },
  "twitter.com": { group: "Social", color: "blue" },
  "youtube.com": { group: "Entertainment", color: "red" },
  "github.com": { group: "Work", color: "green" }
};

chrome.storage.sync.set({ rules: defaultRules });


chrome.action.onClicked.addListener(() => {
  groupTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "groupTabs") {
    groupTabs();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && !tab.incognito) {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');

        chrome.storage.sync.get('rules', (data) => {
            const rule = data.rules?.[domain];
            if (rule) {
                groupTabs(tab, rule.group, rule.color || 'grey');
            }
        });
    }
});


const groupMap = {}; // { 'Social': groupId, ... }


function groupTabs(tab, groupTitle, groupColor = "grey") {
    if (!groupTitle) return;

    if (groupMap[groupTitle]) {
        chrome.tabs.group({
            groupId: groupMap[groupTitle],
            tabIds: [tab.id]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error adding tab to existing group:', chrome.runtime.lastError.message);
            }
        });
    } else {
        chrome.tabs.group({ tabIds: [tab.id] }, (groupId) => {
            if (chrome.runtime.lastError || groupId === chrome.tabs.TAB_ID_NONE) {
                console.error('Error creating group:', chrome.runtime.lastError?.message || 'Unknown error');
                return;
            }

            chrome.tabGroups.update(groupId, {
                title: groupTitle,
                color: groupColor
            }, () => {
                if (chrome.runtime.lastError) {
                console.error('Error updating group:', chrome.runtime.lastError.message);
                return;
                }

                groupMap[groupTitle] = groupId;
            });
        });
    }
}



