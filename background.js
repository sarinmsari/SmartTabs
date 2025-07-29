const groupMap = {}; // { 'Social': groupId, ... }
const groupActivityMap = {}; // { groupId: lastActiveTimestamp }
let currentActiveGroupId = null;
let currentActiveTabId = null;
const IDLE_TIME_MS = 2 * 1000 * 60; // 2 minutes
const INTERVAL_TIME_MS = 1000 * 60; // 1 minutes

// on extension initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Smart Auto Tab Grouper installed");
    /* const defaultRules = {
        "facebook.com": { group: "Social", color: "blue" },
        "twitter.com": { group: "Social", color: "blue" },
        "youtube.com": { group: "Entertainment", color: "red" },
        "github.com": { group: "Work", color: "green" }
    };

    chrome.storage.sync.get('rules', (result) => {
        if (!result.rules) {
            chrome.storage.sync.set({ rules: defaultRules });
        }
    }); */
});

// track when user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const newTab = await chrome.tabs.get(tabId);

        // If a previous tab was active, mark its group as inactive
        if (currentActiveTabId !== null && currentActiveTabId !== tabId) {
            const previousTab = await chrome.tabs.get(currentActiveTabId);
            if (previousTab.groupId !== -1 && previousTab.groupId !== newTab.groupId) {
                groupActivityMap[previousTab.groupId] = Date.now(); // now it goes idle
            }
        }

        currentActiveGroupId = newTab.groupId !== -1 ? newTab.groupId : null;
        currentActiveTabId = tabId;
        startGroupMonitorInterval();
    } catch (err) {
        console.error('Failed to get tab info:', err);
    }
});

// periodic check to collapse inactive groups
let intervalId = null;

function startGroupMonitorInterval() {
    if (intervalId !== null) return; // already running

    intervalId = setInterval(() => {
        const now = Date.now();

        const groupIds = Object.keys(groupActivityMap);

        if (groupIds.length === 0 || (groupIds.length === 1 && parseInt(groupIds[0]) === currentActiveGroupId)) {
            clearInterval(intervalId);
            intervalId = null;
            return;
        }

        for (const groupId of groupIds) {
            if (parseInt(groupId) === currentActiveGroupId) {
                continue; // skip collapsing the active group
            }

            const lastActivity = groupActivityMap[groupId];
            const inactiveTime = now - lastActivity;

            // Example: collapse group after 60s of inactivity
            if (inactiveTime > IDLE_TIME_MS) {
                chrome.tabGroups.update(parseInt(groupId), { collapsed: true }, () => {
                    console.log(`Group ${groupId} auto-collapsed due to inactivity.`);
                });
                delete groupActivityMap[groupId];

                if (currentActiveGroupId == groupId) {
                    currentActiveGroupId = null;
                }
            }
        }
    }, INTERVAL_TIME_MS);
}

chrome.tabGroups.onUpdated.addListener((changeInfo) => {
    if (!changeInfo || typeof changeInfo.id === 'undefined') return;

    const groupId = changeInfo.id;

    if ('collapsed' in changeInfo) {
        if (changeInfo.collapsed === false) { // on group expansion
            currentActiveGroupId = groupId;
            groupActivityMap[groupId] = Date.now();
            startGroupMonitorInterval();
        } else if (changeInfo.collapsed === true) { // on group collapse
            delete groupActivityMap[groupId];
            if (currentActiveGroupId === groupId) {
                currentActiveGroupId = null;
            }
        }
    }
});

/* __ BASICS __ */
// Group tab when updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url && !tab.incognito) {
        const url = new URL(tab.url);
        const domain = url.hostname.replace(/^www\./, '');

        chrome.storage.sync.get('rules', (data) => {
        const rule = data.rules?.[domain];
            if (rule) {
                groupTabs(tab, rule.group, rule.color);
            }
        });
    }
});

// Group tabs based on title + color
function groupTabs(tab, groupTitle, groupColor = "grey") {
    if (!groupTitle) return;

    if (groupMap[groupTitle]) {
        chrome.tabs.group({
            groupId: groupMap[groupTitle],
            tabIds: [tab.id]
        }, () => {
            if (!chrome.runtime.lastError) {
                groupActivityMap[groupMap[groupTitle]] = Date.now();
            } else {
                console.error('Error adding tab to group:', chrome.runtime.lastError.message);
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
                if (!chrome.runtime.lastError) {
                    groupMap[groupTitle] = groupId;
                    groupActivityMap[groupId] = Date.now();
                    startGroupMonitorInterval();
                } else {
                    console.error('Error updating group:', chrome.runtime.lastError.message);
                }
            });
        });
    }
}


// Triggers grouping based on stored rules
function autoGroupTabs() {
  chrome.storage.sync.get('rules', (data) => {
    const rules = data.rules || {};

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        const url = new URL(tab.url || '');
        const domain = url.hostname.replace('www.', '');

        const rule = rules[domain];
        if (rule) {
          const groupTitle = rule.group;
          const groupColor = rule.color || 'grey';
          groupTabs(tab, groupTitle, groupColor);
        }
      });
    });
  });
}

// Optional manual trigger from popup
chrome.action.onClicked.addListener(() => {
    autoGroupTabs();
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "groupTabs") {
        autoGroupTabs();
    }
});
/* __ ../ BASICS __ */