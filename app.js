// ===== Constants =====
const STORAGE_KEY = 'practice_records';

// ===== Global State =====
let currentPractice = null;
let currentQuestionIndex = 0;
let hasSubmitted = false;
let lastViewId = 'home';

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

function deleteRecord(id) {
  if (!confirm('确定删除这条练习记录吗？')) return;
  const records = loadRecords().filter(r => r.id !== id);
  saveRecords(records);
  renderHome();
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

// 判题结果: correct(完全正确), partial(部分正确-少选), missing(缺少的选项), extra(多选的选项)
function checkAnswer(question, userAnswer) {
  if (!userAnswer) {
    return { correct: false, partial: false, missing: [], extra: [] };
  }
  if (question.type !== '多选题') {
    const correct = String(question.answer) === String(userAnswer);
    return { correct, partial: false, missing: [], extra: [] };
  }
  const correctSet = new Set(String(question.answer).split(''));
  const userSet = new Set(String(userAnswer).split(''));
  const extra = [...userSet].filter(c => !correctSet.has(c));
  const missing = [...correctSet].filter(c => !userSet.has(c));
  const correct = extra.length === 0 && missing.length === 0;
  const partial = extra.length === 0 && missing.length > 0;
  return { correct, partial, missing, extra };
}

// 获取某条记录的错题列表(支持未完成的练习)
function getWrongList(record) {
  if (record.status === 'finished') {
    return record.wrongList || [];
  }
  // 未完成的练习,实时计算已答错题
  const wrongList = [];
  for (const q of record.questions) {
    const userAns = record.userAnswers[q.id];
    if (userAns && !isCorrect(q, userAns)) {
      wrongList.push(q.id);
    }
  }
  return wrongList;
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
  const wrongIds = getWrongList(sourceRecord);
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
  // 记录上一个视图
  const active = document.querySelector('.view.active');
  if (active) {
    lastViewId = active.id.replace('view-', '');
  }
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
        <div class="history-main" data-id="${record.id}" data-status="${record.status}">
          <div class="history-info">
            <div class="history-date">${record.createdAt}</div>
            <div class="history-detail">${detailText}</div>
          </div>
          <div class="history-score">${scoreText}</div>
        </div>
        <div class="history-actions">
          <button class="btn-action btn-view-wrong" data-id="${record.id}">错题</button>
          ${!isFinished ? `<button class="btn-action btn-continue" data-id="${record.id}">继续</button>` : ''}
          <button class="btn-action btn-delete" data-id="${record.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 点击主区域: 已完成 → 查看错题, 未完成 → 继续练习
  listEl.querySelectorAll('.history-main').forEach(item => {
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

  // 查看错题按钮
  listEl.querySelectorAll('.btn-view-wrong').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const record = getRecordById(btn.dataset.id);
      if (record) showReview(record);
    });
  });

  // 继续按钮(未完成)
  listEl.querySelectorAll('.btn-continue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const record = getRecordById(btn.dataset.id);
      if (record) startPractice(record);
    });
  });

  // 删除按钮
  listEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecord(btn.dataset.id);
    });
  });
}

// ===== Practice View Functions =====
function startPractice(record) {
  currentPractice = record;
  currentQuestionIndex = 0;
  hasSubmitted = false;
  showView('practice');
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  hasSubmitted = false;
  const q = currentPractice.questions[currentQuestionIndex];
  const total = currentPractice.questions.length;

  // Update progress
  document.getElementById('progress-text').textContent = `第 ${currentQuestionIndex + 1} / ${total} 题`;
  document.getElementById('progress-fill').style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;

  // Update question type
  const typeMap = { '单选题': '单选', '多选题': '多选', '判断题': '判断' };
  document.getElementById('question-type').textContent = typeMap[q.type] || q.type;

  // Update question text
  document.getElementById('question-text').textContent = q.title || q.question;

  // Render options based on type
  const optionsList = document.getElementById('options-list');
  const tfButtons = document.getElementById('tf-buttons');

  if (q.type === '判断题') {
    optionsList.classList.add('hidden');
    tfButtons.classList.remove('hidden');
    const tfOpts = Array.isArray(q.options) ? q.options : [{key:'A',text:'正确'},{key:'B',text:'错误'}];
    tfButtons.querySelectorAll('.tf-btn').forEach((btn, i) => {
      btn.classList.remove('disabled', 'correct', 'wrong');
      btn.disabled = false;
      const opt = tfOpts[i];
      if (opt) {
        btn.dataset.value = opt.key;
        btn.textContent = opt.text;
      }
      // Remove old listener and add new one
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => {
        if (hasSubmitted) return;
        handleAnswer(newBtn.dataset.value);
      });
    });
  } else {
    tfButtons.classList.add('hidden');
    optionsList.classList.remove('hidden');
    optionsList.innerHTML = '';
    const options = Array.isArray(q.options)
      ? q.options.reduce((obj, opt) => { obj[opt.key] = opt.text; return obj; }, {})
      : q.options;
    Object.entries(options).forEach(([key, text]) => {
      const div = document.createElement('div');
      div.className = 'option-item';
      div.dataset.value = key;
      div.innerHTML = `<span class="option-key">${key}</span><span class="option-text">${text}</span>`;
      div.addEventListener('click', () => {
        if (hasSubmitted) return;
        if (q.type === '单选题') {
          handleAnswer(key);
        } else if (q.type === '多选题') {
          div.classList.toggle('selected');
        }
      });
      optionsList.appendChild(div);
    });
  }

  // Hide feedback and next button
  document.getElementById('answer-feedback').classList.add('hidden');
  document.getElementById('btn-next').classList.add('hidden');

  // Show submit only for multi-select
  if (q.type === '多选题') {
    document.getElementById('btn-submit').classList.remove('hidden');
  } else {
    document.getElementById('btn-submit').classList.add('hidden');
  }
}

function handleAnswer(answer) {
  if (hasSubmitted) return;
  hasSubmitted = true;

  const q = currentPractice.questions[currentQuestionIndex];
  const result = checkAnswer(q, answer);

  // Save answer
  currentPractice.userAnswers[q.id] = answer;
  saveRecord(currentPractice);

  // Visual feedback
  if (q.type === '判断题') {
    document.getElementById('tf-buttons').querySelectorAll('.tf-btn').forEach(btn => {
      btn.classList.add('disabled');
      btn.disabled = true;
      const val = btn.dataset.value;
      if (val === String(q.answer)) {
        btn.classList.add('correct');
      } else if (val === String(answer) && !result.correct) {
        btn.classList.add('wrong');
      }
    });
  } else {
    const correctAnswer = String(q.answer);
    document.querySelectorAll('.option-item').forEach(item => {
      item.classList.add('disabled');
      const val = item.dataset.value;
      if (correctAnswer.includes(val)) {
        item.classList.add('correct');
      } else if (String(answer).includes(val)) {
        item.classList.add('wrong');
      }
    });
  }

  // Show feedback
  const feedbackEl = document.getElementById('answer-feedback');
  const feedbackText = document.getElementById('feedback-text');
  const correctAnswerEl = document.getElementById('correct-answer');

  feedbackEl.classList.remove('hidden');
  if (result.correct) {
    feedbackText.textContent = '✅ 回答正确';
    feedbackText.className = 'feedback-text correct';
    correctAnswerEl.textContent = '';
  } else if (result.partial) {
    feedbackText.textContent = '⚠️ 部分正确';
    feedbackText.className = 'feedback-text partial';
    correctAnswerEl.textContent = `正确答案: ${q.answer}（缺少: ${result.missing.join('、')}）`;
  } else {
    feedbackText.textContent = '❌ 回答错误';
    feedbackText.className = 'feedback-text wrong';
    correctAnswerEl.textContent = `正确答案: ${q.answer}`;
  }

  // Show next button
  const btnNext = document.getElementById('btn-next');
  btnNext.classList.remove('hidden');
  if (currentQuestionIndex >= currentPractice.questions.length - 1) {
    btnNext.textContent = '查看结果';
  } else {
    btnNext.textContent = '下一题';
  }

  // Hide submit button
  document.getElementById('btn-submit').classList.add('hidden');
}

function finishPractice() {
  const wrongList = [];
  currentPractice.questions.forEach(q => {
    const userAns = currentPractice.userAnswers[q.id];
    if (!isCorrect(q, userAns)) {
      wrongList.push(q.id);
    }
  });

  currentPractice.wrongList = wrongList;
  currentPractice.wrongCount = wrongList.length;
  currentPractice.status = 'finished';
  currentPractice.finishedAt = nowString();
  saveRecord(currentPractice);
  showResult(currentPractice);
}

function showResult(record) {
  showView('result');

  const total = record.totalCount;
  const wrong = record.wrongCount;
  const correct = total - wrong;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-correct').textContent = correct;
  document.getElementById('stat-wrong').textContent = wrong;
  document.getElementById('stat-rate').textContent = `${rate}%`;

  const btnReview = document.getElementById('btn-review');
  if (wrong > 0) {
    btnReview.classList.remove('hidden');
    btnReview.onclick = () => showReview(record);
  } else {
    btnReview.classList.add('hidden');
  }
}

function showReview(record) {
  showView('review');

  // 动态设置返回按钮目标
  const backBtn = document.querySelector('#view-review .btn-back');
  if (backBtn) {
    backBtn.dataset.target = `view-${lastViewId}`;
  }

  const wrongIds = getWrongList(record);
  document.getElementById('wrong-count-title').textContent = `共 ${wrongIds.length} 道错题`;

  const wrongListEl = document.getElementById('wrong-list');
  if (wrongIds.length === 0) {
    wrongListEl.innerHTML = '<p class="empty-tip">暂无错题</p>';
    document.getElementById('btn-retry-wrong').classList.add('hidden');
    return;
  }

  wrongListEl.innerHTML = record.questions
    .filter(q => wrongIds.includes(q.id))
    .map(q => {
      const userAns = record.userAnswers[q.id] || '未作答';
      const result = checkAnswer(q, userAns);
      const partialHint = result.partial ? `（缺少: ${result.missing.join('、')}）` : '';
      return `
        <div class="wrong-item">
          <div class="wrong-question">${q.title || q.question}</div>
          <div class="wrong-answer user-answer">你的答案: ${userAns}${partialHint}</div>
          <div class="wrong-answer correct-answer-text">正确答案: ${q.answer}</div>
        </div>
      `;
    }).join('');

  document.getElementById('btn-retry-wrong').classList.remove('hidden');
  document.getElementById('btn-retry-wrong').onclick = () => {
    const reviewPractice = createReviewPractice(record);
    saveRecord(reviewPractice);
    startPractice(reviewPractice);
  };
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
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SW registered'))
      .catch(err => console.log('SW registration failed:', err));
  }

  // New practice button
  const btnNewPractice = document.getElementById('btn-new-practice');
  if (btnNewPractice) {
    btnNewPractice.addEventListener('click', () => {
      showView('new-practice');
      updateNewPracticeUI();
    });
  }

  // Back buttons — support any data-target
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) {
        const viewId = target.replace('view-', '');
        showView(viewId);
        if (viewId === 'home') {
          renderHome();
        }
      }
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

  // Start practice button
  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      const types = getSelectedTypes();
      if (types.length === 0) {
        alert('请至少选择一种题型');
        return;
      }
      const countInput = document.getElementById('count-input');
      const shuffleToggle = document.getElementById('shuffle-toggle');
      const config = {
        types,
        count: parseInt(countInput.value, 10),
        random: shuffleToggle.checked
      };
      const record = createPractice(config);
      saveRecord(record);
      startPractice(record);
    });
  }

  // Submit button (multi-select only)
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const selected = Array.from(document.querySelectorAll('.option-item.selected'))
        .map(el => el.dataset.value)
        .sort()
        .join('');
      if (!selected) {
        alert('请至少选择一个选项');
        return;
      }
      handleAnswer(selected);
    });
  }

  // Next button
  const btnNext = document.getElementById('btn-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (currentQuestionIndex >= currentPractice.questions.length - 1) {
        finishPractice();
      } else {
        currentQuestionIndex++;
        renderCurrentQuestion();
      }
    });
  }

  // Home button on result page
  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      showView('home');
      renderHome();
    });
  }

  // Initialize
  renderHome();
});
