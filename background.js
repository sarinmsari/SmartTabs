const groupMap = {}; // { 'Social': groupId, ... }
const groupActivityMap = {}; // { groupId: lastActiveTimestamp }
let currentActiveGroupId = null;
let currentActiveTabId = null;
let IDLE_TIME_MS;
const INTERVAL_TIME_MS = 1000 * 1; // 1 seconds

// on extension initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Smart Auto Tab Grouper installed");
    chrome.storage.sync.get('settings', (data) => {
        if (!data.settings) {
            // Initialize default settings if not present
            const defaultSettings = {
                autoGroup: true,
                autoCollapse: true,
                autoCollapseTime: 30, // in seconds
            }
            chrome.storage.sync.set({ settings: defaultSettings }, () => {
                IDLE_TIME_MS = defaultSettings.autoCollapseTime * 1000; // convert to milliseconds
                console.log("Default settings initialized:", defaultSettings);
            });
        } else {
            IDLE_TIME_MS = data.settings.autoCollapseTime * 1000; // convert to milliseconds
            console.log("Settings already initialized:", data.settings);
        }
    });
    
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
        if (currentActiveTabId && currentActiveTabId !== tabId) {
            try {
                const previousTab = await chrome.tabs.get(currentActiveTabId);
                if (previousTab && previousTab.groupId !== -1 && previousTab.groupId !== newTab.groupId) {
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

        if (groupIds && groupIds.length === 0 || (groupIds.length === 1 && parseInt(groupIds[0]) === currentActiveGroupId)) {
            clearInterval(intervalId);
            intervalId = null;
            return;
        }

        for (const groupId of groupIds) {
            if (!groupId || !groupActivityMap[groupId]) continue; // skip if no activity recorded
            if (parseInt(groupId) === currentActiveGroupId) {
                continue; // skip collapsing the active group
            }

            const lastActivity = groupActivityMap[groupId];
            const inactiveTime = now - lastActivity;

            // Example: collapse group after 60s of inactivity
            if (inactiveTime > IDLE_TIME_MS) {
                const parsedGroupId = parseInt(groupId);

                chrome.tabGroups.get(parsedGroupId, (group) => {
                    if (chrome.runtime.lastError || !group) {
                        console.warn(`Group ${groupId} no longer exists.`);
                        delete groupActivityMap[groupId];
                        if (currentActiveGroupId == groupId) {
                            currentActiveGroupId = null;
                        }
                        return;
                    }

                    chrome.tabGroups.update(parseInt(groupId), { collapsed: true }, () => {
                        if (chrome.runtime.lastError) {
                            console.error(`Error collapsing group ${groupId}:`, chrome.runtime.lastError.message);
                        } else {
                            console.log(`Group ${groupId} auto-collapsed due to inactivity.`);
                            delete groupActivityMap[groupId];
                        }

                        if (currentActiveGroupId == groupId) {
                            currentActiveGroupId = null;
                        }
                    });
                });

                groupId && delete groupActivityMap[groupId];

                if (currentActiveGroupId == groupId) {
                    currentActiveGroupId = null;
                }
            }
        }
    }, INTERVAL_TIME_MS);
}

// Handle group update events
chrome.tabGroups.onUpdated.addListener((changeInfo) => {
    if (!changeInfo || typeof changeInfo.id === 'undefined') return;

    const groupId = changeInfo.id;
    if (!groupId || !groupActivityMap[groupId]) return;

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

// Handle group removal
chrome.tabGroups.onRemoved.addListener((groupId) => {
    if (!groupId || !groupActivityMap[groupId]) return;
    // Cleanup stale entries
    delete groupActivityMap[groupId];

    for (const title in groupMap) {
        if (groupMap[title] === groupId) {
            delete groupMap[title];
        }
    }

    chrome.storage.sync.get('availableGroups', (data) => {
        const availableGroups = data.availableGroups || {};
        for (const title in availableGroups) {
            if (availableGroups[title].groupId === groupId) {
                delete availableGroups[title];
            }
        }
        chrome.storage.sync.set({ availableGroups });
    });
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
    if (!groupTitle || !tab.id) return;

    const existingGroupId = groupMap[groupTitle];

    if (existingGroupId) {
        // First check if the group still exists
        chrome.tabGroups.get(existingGroupId, (group) => {
            if (chrome.runtime.lastError || !group) {
                console.warn("Group doesn't exist or was removed:", chrome.runtime.lastError?.message);
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
                        createNewGroup(tab, groupTitle, groupColor);
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
    if (!groupTitle || !tab || !tab.id) return;

     // First get the window info
    chrome.windows.get(tab.windowId, (win) => {
        if (chrome.runtime.lastError || win?.type !== 'normal') {
            console.warn('Tab is in a non-normal window:', win?.type);
            return; // Don't proceed with grouping
        }

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
                    });
                } else {
                    console.error('Error updating group:', chrome.runtime.lastError.message);
                }
            });
        });
    });
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