// ===== Constants =====
const STORAGE_KEY = 'practice_records';

// ===== Global State =====
let currentPractice = null;
let currentQuestionIndex = 0;
let hasSubmitted = false;
let lastViewId = 'home';
let currentBankId = null;
let isWrongPractice = false;  // 是否处于错题练习模式（在原记录上练习错题）
let wrongPracticeSnapshot = [];  // 销项练习开始时的错题快照，练习过程中不变

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

// ===== Data Migration =====
function migrateRecords() {
  const records = loadRecords();
  let dirty = false;
  for (const r of records) {
    // 旧记录没有 bankId，自动归到中级工程师
    if (!r.bankId) {
      r.bankId = 'mid-engineer';
      dirty = true;
    }
    // 初始化错题练习相关字段
    if (!r.eliminatedWrongIds) {
      r.eliminatedWrongIds = [];
      dirty = true;
    }
    if (!r.wrongPractice) {
      r.wrongPractice = { mode: null, currentIndex: 0, answers: {} };
      dirty = true;
    }
  }
  if (dirty) saveRecords(records);
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

function getCurrentBank() {
  return BANKS.find(b => b.id === currentBankId) || null;
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

// 将答案字母转为带选项文本的展示字符串
function formatAnswerDetail(question, answer) {
  if (!answer || answer === '未作答') return '未作答';
  if (question.type === '判断题') return answer;

  const optionMap = {};
  if (Array.isArray(question.options)) {
    question.options.forEach(opt => { optionMap[opt.key] = opt.text; });
  }

  return String(answer).split('').map(ch => {
    const text = optionMap[ch];
    return text ? `${ch}. ${text}` : ch;
  }).join('  ');
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

// 获取未销项的错题列表（排除已销项的）
function getRemainingWrongList(record) {
  const wrongIds = getWrongList(record);
  const eliminated = record.eliminatedWrongIds || [];
  return wrongIds.filter(id => !eliminated.includes(id));
}

// ===== Practice Builder =====
function buildPractice(bank, config) {
  const { types, count, random, chapters } = config;
  let filtered = bank.questions.filter(q => types.includes(q.type));
  if (bank.hasChapters && chapters && chapters.length > 0) {
    filtered = filtered.filter(q => chapters.includes(q.chapter));
  }
  if (random) {
    filtered = shuffleArray(filtered);
  }
  return filtered.slice(0, count);
}

function createPractice(config) {
  const bank = getCurrentBank();
  const questions = buildPractice(bank, config);
  return {
    id: String(Date.now()),
    bankId: currentBankId,
    createdAt: nowString(),
    finishedAt: null,
    status: 'in_progress',
    config: { ...config },
    source: 'new',
    sourcePracticeId: null,
    questions,
    userAnswers: {},
    wrongList: [],
    eliminatedWrongIds: [],
    wrongPractice: { mode: null, currentIndex: 0, answers: {} },
    totalCount: questions.length,
    wrongCount: 0
  };
}

// ===== Bank List View =====
function renderBankList() {
  const listEl = document.getElementById('bank-list');
  if (!BANKS || !BANKS.length) {
    listEl.innerHTML = '<p class="empty-tip">暂无题库</p>';
    return;
  }
  listEl.innerHTML = BANKS.map(b => `
    <div class="bank-item" data-id="${b.id}">
      <div class="bank-info">
        <div class="bank-name">📚 ${b.name}</div>
        <div class="bank-count">${b.questions.length} 题</div>
      </div>
      <div class="bank-arrow">›</div>
    </div>
  `).join('');
  listEl.querySelectorAll('.bank-item').forEach(el => {
    el.addEventListener('click', () => enterBank(el.dataset.id));
  });
}

function enterBank(bankId) {
  currentBankId = bankId;
  showView('home');
  renderHome();
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
  const bank = getCurrentBank();
  if (bank) {
    document.getElementById('home-title').textContent = bank.name;
  }
  const records = loadRecords().filter(r => r.bankId === currentBankId);
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
    const progressText = isFinished ? '已完成' : `已答 ${answeredCount}/${record.totalCount}`;
    const acc = calcAccuracy(record);
    const accuracyText = acc !== null ? `正确率 ${acc}%` : '未开始';

    return `
      <div class="history-item" data-id="${record.id}" data-status="${record.status}">
        <div class="history-main" data-id="${record.id}" data-status="${record.status}">
          <div class="history-info">
            <div class="history-date">${record.createdAt}</div>
            <div class="history-detail">${record.totalCount}题 · ${progressText}</div>
          </div>
          <div class="history-stats">
            <div class="history-stat-row">${progressText}</div>
            <div class="history-stat-row ${acc !== null && acc >= 80 ? 'stat-high' : acc !== null && acc >= 60 ? 'stat-mid' : acc !== null ? 'stat-low' : ''}">${accuracyText}</div>
          </div>
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

// ===== Accuracy Helpers =====

// 计算主练习的正确率
function calcAccuracy(record) {
  const answered = Object.keys(record.userAnswers || {});
  if (!answered.length) return null;
  let correct = 0;
  for (const q of record.questions) {
    if (record.userAnswers[q.id] && isCorrect(q, record.userAnswers[q.id])) {
      correct++;
    }
  }
  return Math.round((correct / answered.length) * 100);
}

// 计算销项练习的正确率（基于 wrongPractice.answers）
function calcWrongPracticeAccuracy(record) {
  const answers = record.wrongPractice ? record.wrongPractice.answers : {};
  const answeredIds = Object.keys(answers);
  if (!answeredIds.length) return null;
  let correct = 0;
  for (const qid of answeredIds) {
    const q = record.questions.find(question => question.id === Number(qid) || question.id === qid);
    if (q && isCorrect(q, answers[qid])) {
      correct++;
    }
  }
  return Math.round((correct / answeredIds.length) * 100);
}

function updateAccuracyDisplay(accuracy) {
  const el = document.getElementById('accuracy-bar');
  if (!el) return;
  if (accuracy === null) {
    el.textContent = '正确率: --';
    el.className = 'accuracy-bar';
    return;
  }
  el.textContent = `正确率: ${accuracy}%`;
  el.className = 'accuracy-bar';
  if (accuracy >= 80) el.classList.add('accuracy-high');
  else if (accuracy >= 60) el.classList.add('accuracy-mid');
  else el.classList.add('accuracy-low');
}

// ===== Practice View Functions =====

// 开始主练习（未完成练习继续）
function startPractice(record) {
  currentPractice = record;
  isWrongPractice = false;
  // 找到第一个未答题目，实现"继续"功能
  const answeredIds = new Set(Object.keys(record.userAnswers || {}).map(String));
  currentQuestionIndex = record.questions.findIndex(q => !answeredIds.has(String(q.id)));
  if (currentQuestionIndex < 0) currentQuestionIndex = 0;
  hasSubmitted = false;
  showView('practice');
  renderCurrentQuestion();
}

// 开始错题练习（在原记录上练习错题，不创建新记录）
function startWrongPractice(record, mode) {
  currentPractice = record;
  isWrongPractice = true;

  // 设置错题练习模式
  record.wrongPractice.mode = mode;

  // 获取未销项的错题列表
  const remainingWrongIds = getRemainingWrongList(record);

  // 如果所有错题都已销项，提示用户
  if (remainingWrongIds.length === 0) {
    alert('所有错题已销项，无需练习');
    return;
  }

  // 快照当前未销项的错题列表，练习过程中不再变化
  // 这样做对的题被标记为已销项后，进度条和总题数不会跳动
  wrongPracticeSnapshot = [...remainingWrongIds];

  // 从上次进度继续（但如果上次已完成，从头开始）
  let startIndex = record.wrongPractice.currentIndex || 0;
  if (startIndex >= wrongPracticeSnapshot.length) {
    startIndex = 0;  // 已完成一轮，从头开始
  }
  currentQuestionIndex = startIndex;
  hasSubmitted = false;

  showView('practice');
  renderCurrentQuestion();
}

// 重置错题练习进度和销项状态（重新开始）
function resetWrongPractice(record) {
  record.wrongPractice.currentIndex = 0;     // 重置进度到第一题
  record.wrongPractice.answers = {};         // 清空答题记录
  record.eliminatedWrongIds = [];            // 清空已销项标记，恢复删除线和徽章
  saveRecord(record);
}

function renderCurrentQuestion() {
  hasSubmitted = false;

  let q, total;
  if (isWrongPractice) {
    // 错题练习模式：从快照中取题（练习开始时固定，不会因销项而变化）
    total = wrongPracticeSnapshot.length;
    if (currentQuestionIndex >= total) {
      // 所有错题已答完，结束错题练习
      finishWrongPractice();
      return;
    }
    const qid = wrongPracticeSnapshot[currentQuestionIndex];
    q = currentPractice.questions.find(question => question.id === qid);
  } else {
    // 主练习模式：从全部题目中取题
    q = currentPractice.questions[currentQuestionIndex];
    total = currentPractice.questions.length;
  }

  // Update progress
  document.getElementById('progress-text').textContent = `第 ${currentQuestionIndex + 1} / ${total} 题`;
  document.getElementById('progress-fill').style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;

  // Update accuracy
  // 销项模式显示销项练习的正确率，主练习显示主练习的正确率
  if (isWrongPractice) {
    updateAccuracyDisplay(calcWrongPracticeAccuracy(currentPractice));
  } else {
    updateAccuracyDisplay(calcAccuracy(currentPractice));
  }

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

  let q;
  if (isWrongPractice) {
    // 错题练习模式：从快照中取题
    const qid = wrongPracticeSnapshot[currentQuestionIndex];
    q = currentPractice.questions.find(question => question.id === qid);
    // 答案存入 wrongPractice.answers
    currentPractice.wrongPractice.answers[qid] = answer;
  } else {
    // 主练习模式
    q = currentPractice.questions[currentQuestionIndex];
    currentPractice.userAnswers[q.id] = answer;
  }

  const result = checkAnswer(q, answer);

  // Save answer
  if (isWrongPractice) {
    // 更新错题练习进度
    currentPractice.wrongPractice.currentIndex = currentQuestionIndex + 1;

    // 销项模式：做对的题即时标记为已销项（做一道显示一道）
    if (currentPractice.wrongPractice.mode === 'eliminate' && result.correct) {
      const qid = wrongPracticeSnapshot[currentQuestionIndex];
      if (qid && !currentPractice.eliminatedWrongIds.includes(qid)) {
        currentPractice.eliminatedWrongIds.push(qid);
      }
    }
  }
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

  // Update accuracy after answering
  // 销项模式显示销项练习的正确率，主练习显示主练习的正确率
  if (isWrongPractice) {
    updateAccuracyDisplay(calcWrongPracticeAccuracy(currentPractice));
  } else {
    updateAccuracyDisplay(calcAccuracy(currentPractice));
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

  // 判断是否是最后一题
  let total;
  if (isWrongPractice) {
    total = wrongPracticeSnapshot.length;  // 用快照长度，不会因销项而变化
  } else {
    total = currentPractice.questions.length;
  }

  if (currentQuestionIndex >= total - 1) {
    btnNext.textContent = '查看结果';
  } else {
    btnNext.textContent = '下一题';
  }

  // Hide submit button
  document.getElementById('btn-submit').classList.add('hidden');
}

// 完成主练习
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

// 完成错题练习（在原记录上，不创建新记录）
function finishWrongPractice() {
  const mode = currentPractice.wrongPractice.mode;

  // 销项模式：把做对的题加入 eliminatedWrongIds（仅标记，不移除 wrongList）
  if (mode === 'eliminate') {
    const remainingWrongIds = getRemainingWrongList(currentPractice);
    remainingWrongIds.forEach(qid => {
      const q = currentPractice.questions.find(question => question.id === qid);
      const userAns = currentPractice.wrongPractice.answers[qid];
      if (isCorrect(q, userAns)) {
        // 做对了，标记为已销项
        if (!currentPractice.eliminatedWrongIds.includes(qid)) {
          currentPractice.eliminatedWrongIds.push(qid);
        }
      }
    });
    // 注意：wrongList 保持不变，已销项的题目通过 eliminatedWrongIds 标记
  }

  // 保存记录
  saveRecord(currentPractice);

  // 重置错题练习模式，但保留进度（下次可以继续）
  // 注意：currentIndex 和 answers 保留，方便用户查看本次练习的情况
  currentPractice.wrongPractice.mode = null;
  saveRecord(currentPractice);

  // 重置全局状态
  isWrongPractice = false;

  // 回到错题回顾页面
  showReview(currentPractice);
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
  const remainingWrongIds = getRemainingWrongList(record);
  const eliminatedCount = record.eliminatedWrongIds ? record.eliminatedWrongIds.length : 0;

  document.getElementById('wrong-count-title').textContent =
    `共 ${wrongIds.length} 道错题 · 已销项 ${eliminatedCount} 道`;

  const wrongListEl = document.getElementById('wrong-list');
  const btnEliminate = document.getElementById('btn-eliminate-wrong');
  const btnRestart = document.getElementById('btn-restart-wrong');

  if (wrongIds.length === 0) {
    wrongListEl.innerHTML = '<p class="empty-tip">暂无错题</p>';
    if (btnEliminate) btnEliminate.classList.add('hidden');
    if (btnRestart) btnRestart.classList.add('hidden');
    return;
  }

  // 渲染错题列表，已销项的显示删除线
  wrongListEl.innerHTML = record.questions
    .filter(q => wrongIds.includes(q.id))
    .map(q => {
      const userAns = record.userAnswers[q.id] || '未作答';
      const result = checkAnswer(q, userAns);
      const partialHint = result.partial ? `（缺少: ${result.missing.join('、')}）` : '';
      const userAnsDetail = formatAnswerDetail(q, userAns);
      const correctAnsDetail = formatAnswerDetail(q, q.answer);
      const isEliminated = record.eliminatedWrongIds && record.eliminatedWrongIds.includes(q.id);
      const eliminatedClass = isEliminated ? ' eliminated' : '';
      const eliminatedBadge = isEliminated ? '<span class="eliminated-badge">已销项</span>' : '';
      return `
        <div class="wrong-item${eliminatedClass}">
          <div class="wrong-question">${eliminatedBadge}${q.title || q.question}</div>
          <div class="wrong-answer user-answer">你的答案: ${userAnsDetail}${partialHint}</div>
          <div class="wrong-answer correct-answer-text">正确答案: ${correctAnsDetail}</div>
        </div>
      `;
    }).join('');

  // 销项练习：在原记录上练习错题，做对的题会被标记为已销项（不创建新记录）
  if (btnEliminate) {
    if (remainingWrongIds.length > 0) {
      btnEliminate.classList.remove('hidden');
      btnEliminate.onclick = () => {
        startWrongPractice(record, 'eliminate');
      };
    } else {
      btnEliminate.classList.add('hidden');
    }
  }

  // 重新开始：重置错题练习进度
  if (btnRestart) {
    btnRestart.classList.remove('hidden');
    btnRestart.onclick = () => {
      if (confirm('确定要重置错题练习进度吗？')) {
        resetWrongPractice(record);
        alert('错题练习进度已重置');
        showReview(record);
      }
    };
  }
}

// ===== New Practice Page UI Helpers =====
function updateNewPracticeUI() {
  const bank = getCurrentBank();
  const questions = bank ? bank.questions : [];
  const typeCounts = {};
  questions.forEach(q => {
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

  updateChapterUI();
}

function updateChapterUI() {
  const bank = getCurrentBank();
  const wrapper = document.getElementById('chapter-group-wrapper');
  const group = document.getElementById('chapter-group');

  if (!bank || !bank.hasChapters) {
    wrapper.style.display = 'none';
    group.innerHTML = '';
    return;
  }

  wrapper.style.display = '';
  group.innerHTML = bank.chapters.map((ch) => `
    <label class="checkbox-item">
      <input type="checkbox" value="${ch}" checked>
      <span class="checkbox-box"></span>
      <span class="checkbox-text">${ch}</span>
    </label>
  `).join('');

  group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateMaxCount);
  });
}

function getSelectedChapters() {
  const checkboxes = document.querySelectorAll('#chapter-group input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function getSelectedTypes() {
  const checkboxes = document.querySelectorAll('#type-group input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function getMaxCount() {
  const types = getSelectedTypes();
  if (!types.length) return 0;
  const bank = getCurrentBank();
  if (!bank) return 0;
  let filtered = bank.questions.filter(q => types.includes(q.type));
  if (bank.hasChapters) {
    const chapters = getSelectedChapters();
    if (chapters.length === 0) return 0;
    filtered = filtered.filter(q => chapters.includes(q.chapter));
  }
  return filtered.length;
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
      updateChapterUI();
      updateMaxCount();
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
        if (viewId === 'bank-list') {
          currentBankId = null;
          renderBankList();
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
      const bank = getCurrentBank();
      let chapters = null;
      if (bank && bank.hasChapters) {
        chapters = getSelectedChapters();
        if (chapters.length === 0) {
          alert('请至少选择一个章节');
          return;
        }
      }
      const countInput = document.getElementById('count-input');
      const shuffleToggle = document.getElementById('shuffle-toggle');
      const config = {
        types,
        count: parseInt(countInput.value, 10),
        random: shuffleToggle.checked,
        chapters
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
      if (isWrongPractice) {
        // 错题练习模式：用快照长度判断是否完成
        if (currentQuestionIndex >= wrongPracticeSnapshot.length - 1) {
          finishWrongPractice();
        } else {
          currentQuestionIndex++;
          renderCurrentQuestion();
        }
      } else {
        // 主练习模式
        if (currentQuestionIndex >= currentPractice.questions.length - 1) {
          finishPractice();
        } else {
          currentQuestionIndex++;
          renderCurrentQuestion();
        }
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
  migrateRecords();
  renderBankList();
});
