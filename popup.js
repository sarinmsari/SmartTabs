//const rulesContainer = document.getElementById('rulesContainer');
const groupColors = [
  {ket:"grey",code:"#9E9E9E"},
  {ket:"blue", code:"#2196F3"},
  {ket:"red", code:"#F44336"},
  {ket:"yellow", code:"#FFEB3B"},
  {ket:"green", code:"#4CAF50"},
  {ket:"pink", code:"#E91E63"},
  {ket:"purple", code:"#9C27B0"},
  {ket:"cyan", code:"#00BCD4"},
  {ket:"orange", code:"#FF9800"}
];

document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const url = new URL(tabs[0].url);
      document.getElementById('domainInput').value = url.hostname.replace(/^www\./, '');
    }
  });

  const groupSelect = document.getElementById('groupSelect');

  chrome.storage.sync.get('availableGroups', (data) => {
    const groupsObj = data.availableGroups || {};

    if (Object.keys(groupsObj).length === 0) {
      document.getElementsByClassName('group-select-wrapper')[0].style.display = 'none';
      return;
    }
    
    // Remove any old options (except the first one: "Create new group")
    while (groupSelect.options.length > 1) {
      groupSelect.remove(1);
    }
    // Add new options from availableGroups (keys as group names)
    Object.entries(groupsObj).forEach(([groupName, groupData]) => {
      const option = document.createElement('option');
      option.value = groupName;
      option.textContent = groupName;
      option.setAttribute('data-color', groupData.color || 'grey');
      option.setAttribute('data-groupid', groupData.groupId || '');
      groupSelect.appendChild(option);
    });
  });
});

document.getElementById('groupSelect').addEventListener('change', (event) => {
  const selectedValue = event.target.value;
  if (selectedValue === 'create-group') {
    document.getElementsByClassName('create-group-wrapper')[0].style.opacity = '1';
    document.getElementById('groupColorSelect').value = 'grey'; // Default color
    updateInputBorders('#9E9E9E'); // Default border color
    document.getElementById('newGroupInput').value = ''; // Clear new group input
  } else {
    // Get assigned color for selected group
    const group = selectedValue;
    const colorCode = document.querySelector(`#groupSelect option[value="${group}"]`).getAttribute('data-color') || 'grey';
    document.getElementsByClassName('create-group-wrapper')[0].style.opacity = '0';
    updateInputBorders(colorCode);
  }
});

document.getElementById('groupColorSelect').addEventListener('change', (event) => {
  const selectedColor = event.target.value;
  const colorCode = groupColors.find(c => c.ket === selectedColor)?.code || '#9E9E9E'; // Default to grey if not found
  updateInputBorders(colorCode);
});

function updateInputBorders(colorCode) {
  const domainInputElem = document.getElementById('domainInput');
  if (domainInputElem) domainInputElem.style.borderColor = colorCode;

  const groupSelectElem = document.getElementById('groupSelect');
  if (groupSelectElem) groupSelectElem.style.borderColor = colorCode;

  const groupColorSelectElem = document.getElementById('groupColorSelect');
  if (groupColorSelectElem) groupColorSelectElem.style.borderColor = colorCode;

  const newGroupInputElem = document.getElementById('newGroupInput');
  if (newGroupInputElem) newGroupInputElem.style.borderColor = colorCode;
}

function groupTabs() {
  // Close the popup and perform grouping
  chrome.runtime.sendMessage({ action: "groupTabs" });
  window.close();
}

document.getElementById('save-rule-btn').addEventListener('click', () => {
  const domain = document.getElementById('domainInput').value.trim();
  const group = document.getElementById('groupSelect').value;
  const color = document.getElementById('groupColorSelect').value;
  const newGroupName = document.getElementById('newGroupInput').value.trim();

  if (domain && group && group !== 'create-group') {
    const rule = { group: newGroupName || group, color };
    chrome.storage.sync.get('rules', (data) => {
      const rules = data.rules || {};
      rules[domain] = rule;
      chrome.storage.sync.set({ rules }, () => {
        console.log('✅ Rule saved!');
        //loadRules();
        groupTabs();
      });
    });
  } else if (domain && group === 'create-group') {
    if (newGroupName) {
      const rule = { group: newGroupName, color };
      chrome.storage.sync.get('rules', (data) => {
        const rules = data.rules || {};
        rules[domain] = rule;
        chrome.storage.sync.set({ rules }, () => {
          console.log('✅ Rule saved!');
          //loadRules();
          groupTabs();
        });
      });
    } else {
      alert('Please enter a group name.');
    }
  } else {
    alert('Please enter a valid domain and select a group.');
  }
});