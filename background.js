const groupMap = {}; // { 'Social': groupId, ... }
const groupActivityMap = {}; // { groupId: lastActiveTimestamp }
let currentActiveGroupId = null;
let currentActiveTabId = null;
const IDLE_TIME_MS = 2 * 1000 * 60; // 2 minutes
const INTERVAL_TIME_MS = 1000 * 60; // 1 minutes

// on extension initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Smart Auto Tab Grouper installed");
    
    // Initialize storage with empty rules and available groups
    /* chrome.storage.sync.set({ rules: {} });
    chrome.storage.sync.set({ availableGroups: {} }); */
});

// track when user switches tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        let newTab;
        try {
            newTab = await chrome.tabs.get(tabId);
        } catch (err) {
            // Tab might have been closed before we could get it
            console.warn(`Tab with id ${tabId} is not accessible`, err);
            return;
        }

        // If a previous tab was active, mark its group as inactive
        if (currentActiveTabId !== null && currentActiveTabId !== tabId) {
            try {
                const previousTab = await chrome.tabs.get(currentActiveTabId);
                if (previousTab.groupId !== -1 && previousTab.groupId !== newTab.groupId) {
                    groupActivityMap[previousTab.groupId] = Date.now(); // now it goes idle
                }
            } catch (err) {
                // Previous tab might have been closed — ignore safely
                console.warn(`Previous tab ${currentActiveTabId} is not accessible`, err);
            }
        }

        currentActiveGroupId = newTab.groupId !== -1 ? newTab.groupId : null;
        currentActiveTabId = tabId;
        startGroupMonitorInterval();
    } catch (err) {
        console.error('Unexpected error in onActivated handler:', err);
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

    const existingGroupId = groupMap[groupTitle];

    if (existingGroupId !== undefined) {
        // First check if the group still exists
        chrome.tabGroups.get(existingGroupId, (group) => {
            if (chrome.runtime.lastError || !group) {
                // Group doesn't exist anymore, create a new one
                createNewGroup(tab, groupTitle, groupColor);
            } else {
                // Group exists, add tab to it
                chrome.tabs.group({
                    groupId: existingGroupId,
                    tabIds: [tab.id]
                }, () => {
                    if (!chrome.runtime.lastError) {
                        groupActivityMap[existingGroupId] = Date.now();
                    } else {
                        console.error('Error adding tab to group:', chrome.runtime.lastError.message);
                    }
                });
            }
        });
    } else {
        // Group not in map, create a new one
        createNewGroup(tab, groupTitle, groupColor);
    }
}

function createNewGroup(tab, groupTitle, groupColor) {
    chrome.tabs.group({ tabIds: [tab.id] }, (newGroupId) => {
        if (chrome.runtime.lastError) {
            console.error('Error creating new group:', chrome.runtime.lastError.message);
            return;
        }

        chrome.tabGroups.update(newGroupId, {
            title: groupTitle,
            color: groupColor
        }, () => {
            if (!chrome.runtime.lastError) {
                groupMap[groupTitle] = newGroupId;
                groupActivityMap[newGroupId] = Date.now();

                // Add group to available groups in storage
                chrome.storage.sync.get('availableGroups', (data) => {
                    const availableGroups = data.availableGroups || {};
                    availableGroups[groupTitle] = { color: groupColor, groupId: newGroupId };
                    chrome.storage.sync.set({ availableGroups });
                    console.log(availableGroups);
                });
            } else {
                console.error('Error updating group:', chrome.runtime.lastError.message);
            }
        });
    });
}

// Triggers grouping based on stored rules
function autoGroupTabs() {
  chrome.storage.sync.get('rules', (data) => {
    const rules = data.rules || {};
    console.log('Auto grouping tabs with rules:', rules);

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