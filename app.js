// ===== Constants =====
const STORAGE_KEY = 'practice_records';

// ===== Storage Layer =====
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('loadRecords failed:', e);
    return [];
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('saveRecords failed:', e);
  }
}

function saveRecord(record) {
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  saveRecords(records);
}

function getRecordById(id) {
  return loadRecords().find(r => r.id === id) || null;
}

// ===== Utility Functions =====
function nowString() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortAnswer(ans) {
  return String(ans).split('').sort().join('');
}

function isCorrect(question, userAnswer) {
  if (!userAnswer) return false;
  if (question.type === '多选题') {
    return sortAnswer(question.answer) === sortAnswer(userAnswer);
  }
  return String(question.answer) === String(userAnswer);
}

// ===== Practice Builder =====
function buildPractice(allQuestions, config) {
  const { types, count, random } = config;
  let filtered = allQuestions.filter(q => types.includes(q.type));
  if (random) {
    filtered = shuffleArray(filtered);
  }
  return filtered.slice(0, count);
}

function createPractice(config) {
  const questions = buildPractice(QUESTIONS, config);
  return {
    id: String(Date.now()),
    createdAt: nowString(),
    finishedAt: null,
    status: 'in_progress',
    config: { ...config },
    source: 'new',
    sourcePracticeId: null,
    questions,
    userAnswers: {},
    wrongList: [],
    totalCount: questions.length,
    wrongCount: 0
  };
}

function createReviewPractice(sourceRecord) {
  const wrongIds = sourceRecord.wrongList || [];
  const questions = sourceRecord.questions.filter(q => wrongIds.includes(q.id));
  return {
    id: String(Date.now()),
    createdAt: nowString(),
    finishedAt: null,
    status: 'in_progress',
    config: { ...sourceRecord.config },
    source: 'review',
    sourcePracticeId: sourceRecord.id,
    questions,
    userAnswers: {},
    wrongList: [],
    totalCount: questions.length,
    wrongCount: 0
  };
}

// ===== View Switching =====
function showView(viewId) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) {
    target.classList.add('active');
  }
  window.scrollTo(0, 0);
}

// ===== Home View Rendering =====
function renderHome() {
  const records = loadRecords();
  const listEl = document.getElementById('history-list');

  if (!records.length) {
    listEl.innerHTML = '<p class="empty-tip">暂无练习记录</p>';
    return;
  }

  const sorted = records.slice().sort((a, b) => {
    const ta = new Date(a.createdAt.replace(/-/g, '/')).getTime();
    const tb = new Date(b.createdAt.replace(/-/g, '/')).getTime();
    return tb - ta;
  });

  listEl.innerHTML = sorted.map(record => {
    const isFinished = record.status === 'finished';
    const answeredCount = Object.keys(record.userAnswers || {}).length;
    const detailText = isFinished
      ? `${record.totalCount}题 · 错${record.wrongCount}题`
      : `${record.totalCount}题 · (未完成 · 已答 ${answeredCount}/${record.totalCount})`;
    const scoreText = isFinished
      ? `${Math.round(((record.totalCount - record.wrongCount) / record.totalCount) * 100)}%`
      : '进行中';

    return `
      <div class="history-item" data-id="${record.id}" data-status="${record.status}">
        <div class="history-info">
          <div class="history-date">${record.createdAt}</div>
          <div class="history-detail">${detailText}</div>
        </div>
        <div class="history-score">${scoreText}</div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const status = item.dataset.status;
      const record = getRecordById(id);
      if (!record) return;
      if (status === 'finished') {
        showReview(record);
      } else {
        startPractice(record);
      }
    });
  });
}

// ===== Placeholders for functions implemented in next task =====
function startPractice(record) {
  // TODO: implemented in next task
  console.log('startPractice', record);
}

function showReview(record) {
  // TODO: implemented in next task
  console.log('showReview', record);
}

function showResult(record) {
  // TODO: implemented in next task
  console.log('showResult', record);
}

// ===== New Practice Page UI Helpers =====
function updateNewPracticeUI() {
  const typeCounts = {};
  QUESTIONS.forEach(q => {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
  });

  const badges = document.querySelectorAll('#type-group .count-badge');
  const typeOrder = ['单选题', '多选题', '判断题'];
  badges.forEach((badge, i) => {
    const type = typeOrder[i];
    if (type) {
      badge.textContent = typeCounts[type] || 0;
    }
  });
}

function getSelectedTypes() {
  const checkboxes = document.querySelectorAll('#type-group input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function getMaxCount() {
  const types = getSelectedTypes();
  if (!types.length) return 0;
  return QUESTIONS.filter(q => types.includes(q.type)).length;
}

function updateMaxCount() {
  const max = getMaxCount();
  const slider = document.getElementById('count-slider');
  const input = document.getElementById('count-input');
  const hint = document.getElementById('max-count');

  if (slider) slider.max = max;
  if (input) input.max = max;
  if (hint) hint.textContent = max;

  // Clamp current value if it exceeds new max
  if (slider && parseInt(slider.value, 10) > max) {
    slider.value = max;
  }
  if (input && parseInt(input.value, 10) > max) {
    input.value = max;
  }
}

// ===== Event Bindings =====
document.addEventListener('DOMContentLoaded', () => {
  // New practice button
  const btnNewPractice = document.getElementById('btn-new-practice');
  if (btnNewPractice) {
    btnNewPractice.addEventListener('click', () => {
      showView('new-practice');
      updateNewPracticeUI();
    });
  }

  // Back buttons to home
  document.querySelectorAll('.btn-back[data-target="view-home"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showView('home');
      renderHome();
    });
  });

  // Type checkbox changes
  document.querySelectorAll('#type-group input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateMaxCount);
  });

  // Slider and number input linkage
  const countSlider = document.getElementById('count-slider');
  const countInput = document.getElementById('count-input');

  if (countSlider && countInput) {
    countSlider.addEventListener('input', () => {
      countInput.value = countSlider.value;
    });
    countInput.addEventListener('input', () => {
      let val = parseInt(countInput.value, 10);
      const max = parseInt(countSlider.max, 10) || getMaxCount();
      if (isNaN(val) || val < 1) val = 1;
      if (val > max) val = max;
      countSlider.value = val;
    });
  }

  // Initialize
  renderHome();
});
