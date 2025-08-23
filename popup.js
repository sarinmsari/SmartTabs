//const rulesContainer = document.getElementById('rulesContainer');
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

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

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
    const groupColor = document.querySelector(`#groupSelect option[value="${group}"]`).getAttribute('data-color') || 'grey';
    document.getElementById('groupColorSelect').value = groupColor;
    document.getElementsByClassName('create-group-wrapper')[0].style.opacity = '0';
    updateInputBorders(groupColor);
  }
});

document.getElementById('groupColorSelect').addEventListener('change', (event) => {
  const selectedColor = event.target.value;
  const colorCode = groupColors.find(c => c.key === selectedColor)?.code || '#9E9E9E'; // Default to grey if not found
  updateInputBorders(colorCode);
});

function updateInputBorders(color) {
  const domainInputElem = document.getElementById('domainInput');
  if (domainInputElem) domainInputElem.style.borderColor = color;

  const groupSelectElem = document.getElementById('groupSelect');
  if (groupSelectElem) groupSelectElem.style.borderColor = color;

  const groupColorSelectElem = document.getElementById('groupColorSelect');
  if (groupColorSelectElem) groupColorSelectElem.style.borderColor = color;

  const newGroupInputElem = document.getElementById('newGroupInput');
  if (newGroupInputElem) newGroupInputElem.style.borderColor = color;
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

  if (domain && group) {
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
  } else {
    alert('Please enter a valid domain and select a group.');
  }
});