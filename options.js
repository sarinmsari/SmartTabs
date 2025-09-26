const groupColors = [
  {key:"grey",code:"#D3D3D3"},
  {key:"blue", code:"#4A90E2"},
  {key:"red", code:"#E0564A"},
  {key:"yellow", code:"#E1AA46"},
  {key:"green", code:"#6CC164"},
  {key:"pink", code:"#E65FA2"},
  {key:"purple", code:"#A55CD7"},
  {key:"cyan", code:"#03DAC5"},
  {key:"orange", code:"#E67C3C"}
];

const getSettings = (callback) => {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || {};
    callback(settings);
  });
};

const initializeSettings = async() => {
    console.log("Initializing settings...");
    getSettings((settings) => {
        console.log("Current settings:", JSON.stringify(settings, null, 2));
        if (!settings || Object.keys(settings).length === 0) {
            // Initialize default settings if not present
            const defaultSettings = {
                autoGroup: true,
                autoCollapse: false,
                autoCollapseTime: 60, // in seconds
            }
            chrome.storage.sync.set({ settings: defaultSettings }, () => {
                console.log("Default settings initialized:", defaultSettings);
            });
        }else{
            const autocollapseToggle = document.getElementById('autocollapseToggle');
            autocollapseToggle.checked = settings.autoCollapse || false;
        }
    });
};

async function renderGroups() {
    const { availableGroups = {} } = await chrome.storage.sync.get('availableGroups');
    const { rules = {} } = await chrome.storage.sync.get('rules');

    const container = document.getElementById('groupList');
    if (!container) return;
    container.innerHTML = ''; // Clear existing content

    const groupEntries = Object.entries(availableGroups);

    if (groupEntries.length === 0) {
        const noGroupElem = document.createElement('div');
        noGroupElem.className = 'noGroupElem'
        noGroupElem.textContent = 'No tab groups found!';
        container.appendChild(noGroupElem);
        return;
    }

    const colours = ["grey", "red", "blue", "green", "yellow", "purple", "orange"];

    groupEntries.forEach(([groupTitle, groupData]) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group';

        // Group header
        const titleDivWrapper = document.createElement('div');
        titleDivWrapper.className = 'group-wrapper';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'group-title-wrapper';

        const titleInput = document.createElement('input');
        titleInput.className = 'group-title';
        titleInput.style.backgroundColor = groupData.colorCode || 'grey'; // Use group's color
        titleInput.readOnly = true; // Make it read-only
        titleInput.value = `${groupTitle}`;

        const colourDropdown = document.createElement('select');
        colourDropdown.className = 'group-color-dropdown';
        colourDropdown.style.backgroundColor = groupData.colorCode || '#D3D3D3'; // Default color
        colourDropdown.innerHTML = groupColors.map(
            ({ key, code }) => `
                <option value="${code}" style="background-color: ${code};"
                    ${groupData.colorCode === code ? "selected" : ""}>
                    ${key.charAt(0).toUpperCase() + key.slice(1)}
                </option>
            `
        ).join("");

        colourDropdown.value = groupData.colorCode || "#D3D3D3";
        colourDropdown.onchange = () => {
            const newColorCode = colourDropdown.value;
            const newColor = colourDropdown.options[colourDropdown.selectedIndex].text.toLocaleLowerCase();
            titleInput.style.backgroundColor = newColorCode;
            colourDropdown.style.backgroundColor = newColorCode;

            // Update the group color in rules
            for (const [domain, rule] of Object.entries(rules)) {
                if (rule.group === groupTitle) {
                    const updatedRule = { ...rule, color: newColor };
                    rules[domain] = updatedRule;
                }
            }
            chrome.storage.sync.set({ rules }, () => {
                console.log(`Rules updated with new color for group ${groupTitle}`);
            });

            //update the color in availableGroups
            chrome.storage.sync.get('availableGroups', (data) => {
                const updatedGroups = data.availableGroups || {};
                if (updatedGroups[groupTitle]) {
                    const groupDataCopy = {
                        ...updatedGroups[groupTitle],
                        colorCode: newColorCode,
                        color: newColor
                    };
                    updatedGroups[groupTitle] = groupDataCopy;

                    chrome.storage.sync.set({ availableGroups: updatedGroups }, () => {
                        console.log(`Group color updated: ${groupTitle} to ${newColor}`);
                    });
                }
            });

            // Update the color of all tabs in this group
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.groupId === groupData.groupId) {
                        chrome.tabGroups.update(tab.groupId, { color: newColor });
                    }
                });
            });
        };

        const editButton = document.createElement('button');
        editButton.className = 'group-edit-button';
        editButton.classList.add('opacity-on-hover');
        editButton.textContent = 'Edit title';
        editButton.onclick = () => {
            if (editButton.textContent.toLowerCase() === 'edit title') {
                titleInput.readOnly = false; // Make it editable
                titleInput.focus();
                editButton.textContent = 'Save';
            }else{
                titleInput.readOnly = true; // Make it read-only again
                editButton.textContent = 'Edit title';
                // Save the updated group title
                const updatedGroupTitle = titleInput.value.trim();
                if (updatedGroupTitle) {
                    // Update the group in storage
                    chrome.storage.sync.get('availableGroups', (data) => {
                        const updatedGroups = data.availableGroups || {};
                        if (updatedGroups[groupTitle]) {
                            // Clone the group data and set colorCode before assigning
                            const groupDataCopy = { ...updatedGroups[groupTitle], colorCode: groupData.colorCode };
                            updatedGroups[updatedGroupTitle] = groupDataCopy;
                            if (updatedGroupTitle !== groupTitle) {
                                delete updatedGroups[groupTitle];
                            }
                            chrome.storage.sync.set({ availableGroups: updatedGroups }, function () {
                                console.log(`Group updated: ${groupTitle} to ${updatedGroupTitle}`);
                                titleInput.value = updatedGroupTitle; // Update the displayed value
                            });
                            // Update the rules associated with this group
                            chrome.storage.sync.get('rules', (data) => {
                                const updatedRules = data.rules || {};
                                for (const domain in updatedRules) {
                                    if (updatedRules[domain].group === groupTitle) {
                                        updatedRules[domain].group = updatedGroupTitle; // Update the group name
                                    }
                                }
                                chrome.storage.sync.set({ rules: updatedRules }, function () {
                                    console.log(`All domains in group ${groupTitle} updated to ${updatedGroupTitle}.`);
                                });
                            });
                        }
                    });
                } else {
                    alert('Group title cannot be empty.');
                }
            };
        };
        titleDiv.appendChild(colourDropdown);
        titleDiv.appendChild(titleInput);
        titleDiv.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'group-delete-button';
        deleteButton.classList.add('opacity-on-hover');
        deleteButton.onclick = () => {
            if (!confirm(`Are you sure you want to delete the group "${groupTitle}"?`)) {
                return;
            }
            // Remove the group from storage
            chrome.storage.sync.get('availableGroups', (data) => {
                const updatedGroups = data.availableGroups || {};
                if (updatedGroups[groupTitle]) {
                    delete updatedGroups[groupTitle];
                    chrome.storage.sync.set({ availableGroups: updatedGroups }, function () {
                        console.log(`Group deleted: ${groupTitle}`);
                        groupDiv.remove(); // Remove the group from the UI
                    });
                    chrome.storage.sync.get('rules', (data) => {
                        const updatedRules = data.rules || {};
                        // Remove all rules associated with this group
                        for (const domain in updatedRules) {
                            if (updatedRules[domain].group === groupTitle) {
                                delete updatedRules[domain];
                            }
                        }
                        chrome.storage.sync.set({ rules: updatedRules }, function () {
                            console.log(`All domains in group ${groupTitle} deleted.`);
                        });
                    });
                }
            });

            // Update the color of all tabs in this group
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.groupId === groupData.groupId) {
                        chrome.tabs.ungroup(tab.id);
                    }
                });
            });

        };
        
        titleDivWrapper.appendChild(titleDiv);
        titleDivWrapper.appendChild(deleteButton);
        groupDiv.appendChild(titleDivWrapper);

        // List of domains for this group
        const domainList = document.createElement('div');
        domainList.className = 'domain-list';

        let hasDomains = false;

        for (const [domain, rule] of Object.entries(rules)) {
            if (rule.group === groupTitle) {
                const liWrapper = document.createElement('div');

                const li = document.createElement('div');
                li.className = 'domain-item-wrapper';

                const liInput = document.createElement('input');
                liInput.className = 'domain-item';
                liInput.value = domain;
                liInput.readOnly = true; // Make it read-only

                const editButton = document.createElement('button');
                editButton.textContent = 'Edit';
                editButton.className = 'domain-edit-button';
                editButton.classList.add('underline-on-hover');
                editButton.onclick = () => {
                    if (editButton.textContent.toLowerCase() === 'edit') {
                        liInput.readOnly = false; // Make it editable
                        liInput.focus();
                        editButton.textContent = 'Save';
                    }else{
                        liInput.readOnly = true; // Make it read-only again
                        editButton.textContent = 'Edit';
                        // Save the updated domain
                        const updatedDomain = liInput.value.trim();
                        if (updatedDomain) {
                            // Update the rule in storage
                            chrome.storage.sync.get('rules', (data) => {
                                const updatedRules = data.rules || {};
                                if (updatedRules[domain]) {
                                    const ruleCopy = { ...updatedRules[domain], group: groupTitle }; // Ensure group remains the same
                                    updatedRules[updatedDomain] = ruleCopy;
                                    if (updatedDomain !== domain) {
                                        delete updatedRules[domain];
                                    }
                                    chrome.storage.sync.set({ rules: updatedRules }, function () {
                                        console.log(`Domain updated: ${domain} to ${updatedDomain}`);
                                        liInput.value = updatedDomain; // Update the displayed value
                                    });
                                }
                            });
                        } else {
                            alert('Domain cannot be empty.');
                        }
                    };
                };
                li.appendChild(liInput);
                li.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'x';
                deleteButton.className = 'domain-delete-button';
                deleteButton.classList.add('opacity-on-hover');
                deleteButton.onclick = () => {
                    // Remove the domain from storage
                    if (!confirm(`Are you sure you want to delete the domain "${domain}"?`)) {
                        return;
                    }
                    chrome.storage.sync.get('rules', (data) => {
                        const updatedRules = data.rules || {};
                        if (updatedRules[domain]) {
                            delete updatedRules[domain];
                            chrome.storage.sync.set({ rules: updatedRules }, function () {
                                console.log(`Domain deleted: ${domain}`);
                                liWrapper.remove(); // Remove the list item from the UI
                            });
                        }
                    });

                    // Update the color of all tabs in this group
                    chrome.tabs.query({}, (tabs) => {
                        tabs.forEach((tab) => {
                            try {
                                const url = new URL(tab.url || "");
                                if (url.hostname === domain) {
                                    chrome.tabs.ungroup(tab.id, () => {
                                        if (chrome.runtime.lastError) {
                                            console.error(chrome.runtime.lastError);
                                        } else {
                                            console.log(`Ungrouped tab ${tab.id} with domain ${domain}`);
                                        }
                                    });
                                }
                            } catch (e) {
                                // Ignore tabs without valid URLs (like chrome:// or about:blank)
                            }
                        });
                    });
                };
                liWrapper.className = 'domain-item-wrapper';
                liWrapper.appendChild(deleteButton);
                liWrapper.appendChild(li);
                domainList.appendChild(liWrapper);
                hasDomains = true;
            }
        }

        if (!hasDomains) {
            const liInput = document.createElement('liInput');
            liInput.textContent = '(No matching domains)';
            domainList.appendChild(liInput);
        }

        groupDiv.appendChild(domainList);
        container.appendChild(groupDiv);
    });
}

document.addEventListener('DOMContentLoaded', async() => {
    initializeSettings();
    renderGroups();
    
    const autocollapseToggle = document.getElementById('autocollapseToggle');
    autocollapseToggle.onchange = () => {
        getSettings((settings) => {
            const newSettings = { ...settings, autoCollapse: autocollapseToggle.checked };
            chrome.storage.sync.set({ settings: newSettings }, () => {
                console.log('Auto-collapse setting updated:', newSettings.autoCollapse);
            });
        });
    };
});
