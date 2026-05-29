/**
 * MathEarning - Math question UI (server validates answers)
 */

const MathEngine = {
  currentQuestionId: null,
  isSubmitting: false,

  async loadNextQuestion() {
    const expressionEl = document.getElementById('math-expression');
    const feedbackEl = document.getElementById('math-feedback');
    const inputEl = document.getElementById('math-answer');
    const submitBtn = document.getElementById('math-submit');
    if (!expressionEl) return;

    expressionEl.innerHTML = '<span class="loader"></span>';
    feedbackEl.textContent = '';
    feedbackEl.className = 'math-feedback';
    inputEl.value = '';
    inputEl.disabled = true;
    submitBtn.disabled = true;

    try {
      const data = await Api.getQuestion();
      this.currentQuestionId = data.question.id;
      expressionEl.textContent = data.question.expression + ' = ?';
      inputEl.disabled = false;
      submitBtn.disabled = false;
      inputEl.focus();
    } catch (err) {
      expressionEl.textContent = 'Could not load question';
      feedbackEl.textContent = err.message;
      feedbackEl.className = 'math-feedback wrong';
      Utils.toast(err.message, 'error');
      setTimeout(() => this.loadNextQuestion(), 2000);
    }
  },

  async submitAnswer() {
    if (this.isSubmitting || !this.currentQuestionId) return;

    const inputEl = document.getElementById('math-answer');
    const feedbackEl = document.getElementById('math-feedback');
    const earnBadge = document.getElementById('earn-badge');
    const answer = inputEl.value.trim();

    if (!answer) {
      Utils.toast('Please enter an answer', 'error');
      return;
    }

    this.isSubmitting = true;
    document.getElementById('math-submit').disabled = true;
    inputEl.disabled = true;

    try {
      const result = await Api.submitAnswer(this.currentQuestionId, answer);

      if (result.correct) {
        feedbackEl.textContent = '✓ Correct!';
        feedbackEl.className = 'math-feedback correct';
        if (earnBadge) {
          earnBadge.textContent = `+${Utils.formatMoney(result.earned)}`;
          earnBadge.classList.remove('hidden');
        }
        document.querySelector('.math-area')?.classList.add('correct-pulse');
        setTimeout(() => document.querySelector('.math-area')?.classList.remove('correct-pulse'), 400);
        Utils.playCorrectSound();
        Utils.toast(`Correct! Earned ${Utils.formatMoney(result.earned)}`, 'success');
      } else {
        feedbackEl.textContent = '✗ Wrong answer';
        feedbackEl.className = 'math-feedback wrong';
        if (earnBadge) earnBadge.classList.add('hidden');
      }

      this.currentQuestionId = null;
      setTimeout(() => {
        this.isSubmitting = false;
        if (earnBadge) earnBadge.classList.add('hidden');
        this.loadNextQuestion();
      }, 600);
    } catch (err) {
      feedbackEl.textContent = err.message;
      feedbackEl.className = 'math-feedback wrong';
      this.isSubmitting = false;
      this.currentQuestionId = null;
      inputEl.disabled = false;
      document.getElementById('math-submit').disabled = false;
      Utils.toast(err.message, 'error');
      setTimeout(() => this.loadNextQuestion(), 1500);
    }
  },

  init() {
    document.getElementById('math-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAnswer();
    });
    this.loadNextQuestion();
  }
};
