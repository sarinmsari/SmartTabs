const rulesContainer = document.getElementById('rulesContainer');
const groupColors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

function createRuleRow(domain = '', group = '', color = 'grey') {
  const div = document.createElement('div');
  div.className = 'rule-row';

  const domainInput = document.createElement('input');
  domainInput.placeholder = "domain.com";
  domainInput.value = domain;

  const groupInput = document.createElement('input');
  groupInput.placeholder = "Group Name";
  groupInput.value = group;

  const colorSelect = document.createElement('select');
  groupColors.forEach(c => {
    const option = document.createElement('option');
    option.value = c;
    option.innerText = c;
    if (c === color) option.selected = true;
    colorSelect.appendChild(option);
  });

  div.appendChild(domainInput);
  div.appendChild(groupInput);
  div.appendChild(colorSelect);
  rulesContainer.appendChild(div);
}

function loadRules() {
  chrome.storage.sync.get('rules', (data) => {
    rulesContainer.innerHTML = '';
    const rules = data.rules || {};

    for (const domain in rules) {
      const value = rules[domain];
      const group = typeof value === 'object' ? value.group : value;
      const color = typeof value === 'object' ? value.color : 'grey';
      createRuleRow(domain, group, color);
    }
  });
}

document.getElementById('addRule').addEventListener('click', () => {
  createRuleRow();
});

document.getElementById('saveRules').addEventListener('click', () => {
  const rows = rulesContainer.querySelectorAll('.rule-row');
  const newRules = {};

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const select = row.querySelector('select');
    const domain = inputs[0].value.trim();
    const group = inputs[1].value.trim();
    const color = select.value;

    if (domain && group) {
      newRules[domain] = { group, color };
    }
  });

  chrome.storage.sync.set({ rules: newRules }, () => {
    alert('✅ Rules saved!');
  });
});

document.getElementById('groupNow').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: "groupTabs" });
});

loadRules();
