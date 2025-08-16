const groupColors = [
  {ket:"grey",code:"#D3D3D3"},
  {ket:"blue", code:"#4A90E2"},
  {ket:"red", code:"#E0564A"},
  {ket:"yellow", code:"#E1AA46"},
  {ket:"green", code:"#6CC164"},
  {ket:"pink", code:"#E65FA2"},
  {ket:"purple", code:"#A55CD7"},
  {ket:"cyan", code:"#03DAC5"},
  {ket:"orange", code:"#E67C3C"}
];

const groupMap = {}; // { 'Social': groupId, ... }
const groupActivityMap = {}; // { groupId: lastActiveTimestamp }
let currentActiveGroupId = null;
let currentActiveTabId = null;
let IDLE_TIME_MS;
const INTERVAL_TIME_MS = 1000 * 1; // 1 seconds

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings?.newValue) {
        IDLE_TIME_MS = changes.settings.newValue.autoCollapseTime * 1000;
        console.log("Updated IDLE_TIME_MS to", IDLE_TIME_MS);
    }
});

chrome.runtime.onStartup?.addListener(() => {
    rebuildGroupMap();
});

function rebuildGroupMap() {
    chrome.tabGroups.query({}, (groups) => {
        groups.forEach((group) => {
            if (group.title) {
                groupMap[group.title] = group.id;
            }
        });
        console.log("Group map rebuilt:", groupMap);
    });
}


// on extension initialization
chrome.runtime.onInstalled.addListener(() => {
    console.log("✅ Smart Auto Tab Grouper installed");
    chrome.alarms.create('autoCollapseCheck', {
        periodInMinutes: 1  // Fires every 1 minute
    });

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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoCollapseCheck') {
    startGroupMonitorInterval();
    console.log('Auto-collapse check triggered!');
  }
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
    if (!(changeInfo || changeInfo.id)) return;

    const groupId = changeInfo.id;

    if ('collapsed' in changeInfo) {
        if (changeInfo.collapsed === false) { // on group expansion
            groupActivityMap[groupId] = Date.now();
            startGroupMonitorInterval();
        } else { // on group collapse
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

function ensureGroupByTitle(title, color, callback) {
    if (!title) return;

    chrome.tabGroups.query({}, (groups) => {
        for (const group of groups) {
            if (group.title === title) {
                groupMap[title] = group.id;
                callback(group.id);
                return;
            }
        }

        // Not found: create a new group
        callback(null);
    });
}

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
    if (!groupTitle || !tab?.id) return;

    ensureGroupByTitle(groupTitle, groupColor, (existingGroupId) => {
        if (existingGroupId) {
            if (tab.groupId === existingGroupId) return;

            chrome.tabs.group({ groupId: existingGroupId, tabIds: [tab.id] }, () => {
                if (!chrome.runtime.lastError) {
                    groupActivityMap[existingGroupId] = Date.now();
                } else {
                    console.warn("Failed to group tab into existing group:", chrome.runtime.lastError.message);
                }
            });
        } else {
            createNewGroup(tab, groupTitle, groupColor);
        }
    });
}

function createNewGroup(tab, groupTitle, groupColor = "grey") {
    chrome.tabs.group({ tabIds: [tab.id] }, (newGroupId) => {
        if (chrome.runtime.lastError || !newGroupId) {
            console.error("Failed to create group:", chrome.runtime.lastError?.message);
            return;
        }

        // Find the color code from groupColors array
        const colorObj = groupColors.find(c => c.ket === groupColor || c.code === groupColor);
        const colorCode = colorObj ? colorObj.code : "#D3D3D3"; // fallback to grey

        chrome.tabGroups.update(newGroupId, {
            title: groupTitle,
            color: groupColor
        }, () => {
            if (chrome.runtime.lastError) {
            console.warn("Failed to set group color/title:", chrome.runtime.lastError.message);
            return;
            }

            groupMap[groupTitle] = newGroupId;
            groupActivityMap[newGroupId] = Date.now();

            // Persist group with color code
            chrome.storage.sync.get('availableGroups', (data) => {
            const availableGroups = data.availableGroups || {};
            availableGroups[groupTitle] = { groupId: newGroupId, color: groupColor, colorCode };
            chrome.storage.sync.set({ availableGroups });
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