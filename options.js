async function renderGroups() {
    const { availableGroups = {} } = await chrome.storage.sync.get('availableGroups');
    const { rules = {} } = await chrome.storage.sync.get('rules');

    const container = document.getElementById('groupList');
    if (!container) return;
    container.innerHTML = ''; // Clear existing content

    const groupEntries = Object.entries(availableGroups);

    if (groupEntries.length === 0) {
        container.textContent = 'No tab groups found.';
        return;
    }

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

        const editButton = document.createElement('button');
        editButton.className = 'group-edit-button';
        editButton.classList.add('opacity-on-hover');
        editButton.textContent = 'Edit';
        editButton.onclick = () => {
            titleInput.readOnly = false; // Make it editable
            titleInput.focus();
            editButton.textContent = 'Save';
            editButton.onclick = () => {
                titleInput.readOnly = true; // Make it read-only again
                editButton.textContent = 'Edit';
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
                    liInput.readOnly = false; // Make it editable
                    liInput.focus();
                    editButton.textContent = 'Save';
                    editButton.onclick = () => {
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

document.addEventListener('DOMContentLoaded', renderGroups);
