// options.ts — options page behaviour

declare const browser: any;
declare const __DEBUG__: boolean;

// --- Module-scope helpers (no closure dependencies) ---

function validateGoal(text: string): { ok: boolean; reason?: string } {
    if (!text || text.length < 20) return { ok: false, reason: 'Too short; be more specific (>= 20 chars).' };
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 6) return { ok: false, reason: 'Too few words; include more detail (who/what/how).' };
    const verbs = ['learn', 'use', 'apply', 'understand', 'build', 'solve', 'practice'];
    const low = text.toLowerCase();
    if (!verbs.some(v => low.includes(v)) && !/^i (want|would like)/i.test(low)) {
        return { ok: false, reason: 'Include an action verb (e.g., "I want to learn", "use", "apply").' };
    }
    return { ok: true };
}

function createToast(text: string, type: 'success' | 'error' = 'success') {
    const t = document.createElement('div');
    t.textContent = text;
    Object.assign(t.style, {
        position: 'fixed', right: '16px', bottom: '16px', padding: '10px 14px',
        borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', zIndex: '99999',
        color: '#fff', fontSize: '13px', background: type === 'success' ? '#2e7d32' : '#b00020',
    });
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 0.35s ease';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 400);
    }, 2000);
}

function showValidationMsg(msg: string) {
    let d = document.getElementById('goalValidationDialog');
    if (!d) {
        d = document.createElement('div');
        d.id = 'goalValidationDialog';
        Object.assign(d.style, {
            position: 'relative', marginTop: '8px', padding: '8px', borderRadius: '6px',
            background: 'rgba(200,40,40,0.08)', border: '1px solid rgba(200,40,40,0.2)', color: '#700',
        });
        const container = document.querySelector('.container');
        container?.insertBefore(d, container.firstChild?.nextSibling || null);
    }
    d.textContent = msg;
    d.style.opacity = '1';
    d.style.transition = '';
    const el = d;
    setTimeout(() => {
        el.style.transition = 'opacity 0.35s ease';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 400);
    }, 3000);
}

function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

async function submitQuizAnswers(questions: any[], answers: any[]) {
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.answer_choices?.length) {
            if (answers[i] != null && q.answer_choices[answers[i]]?.isCorrect) correct++;
        } else if (answers[i] && String(answers[i]).trim()) {
            correct++;
        }
    }

    const quizArea = document.getElementById('quizArea');
    if (quizArea) { quizArea.style.display = 'none'; quizArea.innerHTML = ''; }

    const score = Math.round((correct / questions.length) * 100);
    if (score >= 60) {
        const s = await browser.runtime.sendMessage({ type: 'getSettings' });
        s.blockingEnabled = false;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: s });
        createToast('Quiz passed — blocking disabled');
        location.reload();
    } else {
        alert(`Quiz failed — score ${score}%. Need >= 60%.`);
    }
}

function renderQuizCarousel(container: HTMLElement, questions: any[]) {
    container.innerHTML = '';
    let idx = 0;
    const answers: any[] = new Array(questions.length).fill(null);

    const qBox = document.createElement('div');
    Object.assign(qBox.style, { border: '1px solid #ddd', padding: '12px', borderRadius: '8px', background: '#fff' });
    container.appendChild(qBox);

    const nav = document.createElement('div');
    nav.style.marginTop = '8px';
    container.appendChild(nav);

    function render() {
        qBox.innerHTML = '';
        const q = questions[idx];

        const header = document.createElement('div');
        header.textContent = `Question ${idx + 1} of ${questions.length}`;
        header.style.fontWeight = '600';
        header.style.marginBottom = '8px';
        qBox.appendChild(header);

        const qText = document.createElement('div');
        qText.textContent = q.question;
        qText.style.marginBottom = '10px';
        qBox.appendChild(qText);

        const choicesDiv = document.createElement('div');
        if (q.answer_choices?.length) {
            q.answer_choices.forEach((c: any, ci: number) => {
                const label = document.createElement('label');
                label.style.display = 'block';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = `q${idx}`;
                input.checked = answers[idx] === ci;
                input.addEventListener('change', () => { answers[idx] = ci; });
                label.appendChild(input);
                label.appendChild(document.createTextNode(' ' + c.choice));
                choicesDiv.appendChild(label);
            });
        } else {
            const ta = document.createElement('input');
            ta.type = 'text';
            ta.value = answers[idx] || '';
            ta.addEventListener('input', () => { answers[idx] = ta.value; });
            choicesDiv.appendChild(ta);
        }
        qBox.appendChild(choicesDiv);

        nav.innerHTML = '';
        const prev = document.createElement('button');
        prev.textContent = 'Previous';
        prev.disabled = idx === 0;
        prev.addEventListener('click', () => { idx--; render(); });
        nav.appendChild(prev);

        const next = document.createElement('button');
        next.textContent = idx === questions.length - 1 ? 'Submit' : 'Next';
        next.style.marginLeft = '8px';
        next.addEventListener('click', async () => {
            if (idx === questions.length - 1) {
                await submitQuizAnswers(questions, answers);
            } else {
                idx++;
                render();
            }
        });
        nav.appendChild(next);
    }

    render();
}

// --- Page init ---

document.addEventListener('DOMContentLoaded', async () => {
    const newGoalInput = document.getElementById('newGoalInput') as HTMLInputElement | null;
    const addGoalBtn = document.getElementById('addGoalBtn') as HTMLButtonElement | null;
    const goalsList = document.getElementById('goalsList');
    const goalAnalysisLoading = document.getElementById('goalAnalysisLoading');
    const funLimitHours = document.getElementById('funLimitHours') as HTMLInputElement | null;
    const funLimitMinutes = document.getElementById('funLimitMinutes') as HTMLInputElement | null;
    const funLimitSeconds = document.getElementById('funLimitSeconds') as HTMLInputElement | null;
    const funLimitHint = document.getElementById('funLimitHint');
    const genQuizBtn = document.getElementById('genQuizBtn') as HTMLButtonElement | null;
    const quizArea = document.getElementById('quizArea');
    const blockShortsCheckbox = document.getElementById('blockShortsCheckbox') as HTMLInputElement | null;
    const blockingStatus = document.getElementById('blockingStatus');
    const blockingToggleBtn = document.getElementById('blockingToggleBtn') as HTMLButtonElement | null;
    const funUsageDisplay = document.getElementById('funUsageDisplay');

    let settings = await browser.runtime.sendMessage({ type: 'getSettings' });

    // Migrate old single-goal to goals array
    if (settings && typeof settings.goal === 'string' && !Array.isArray(settings.goals)) {
        settings.goals = [];
        if (settings.goal.trim()) settings.goals.push(settings.goal.trim());
        delete settings.goal;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
    }

    // Display fun limit split into h / m / s
    {
        const totalMin = settings.funLimitMinutes || 30;
        const totalSec = Math.round(totalMin * 60);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (funLimitHours) funLimitHours.value = String(h);
        if (funLimitMinutes) funLimitMinutes.value = String(m);
        if (funLimitSeconds) funLimitSeconds.value = String(s);
    }
    if (blockShortsCheckbox) blockShortsCheckbox.checked = settings.blockShorts ?? true;
    if (blockingStatus) blockingStatus.textContent = settings.blockingEnabled ? 'Blocking is currently enabled.' : 'Blocking is currently disabled.';
    if (blockingToggleBtn) blockingToggleBtn.textContent = settings.blockingEnabled ? 'Disable blocking' : 'Enable blocking';
    renderGoals(settings.goals || []);

    // --- Fun time usage display ---

    async function updateFunUsage() {
        if (!funUsageDisplay) return;
        try {
            const { usedSeconds, limitSeconds } = await browser.runtime.sendMessage({ type: 'getRemainingFun' });
            const pct = limitSeconds > 0 ? Math.min((usedSeconds / limitSeconds) * 100, 100) : 0;
            const overLimit = limitSeconds > 0 && usedSeconds >= limitSeconds;

            funUsageDisplay.className = 'fun-usage-display' + (overLimit ? ' over-limit' : '');
            funUsageDisplay.innerHTML =
                `<strong>YouTube today:</strong> ${formatTime(usedSeconds)} used of ${formatTime(limitSeconds)}` +
                (limitSeconds > 0
                    ? `<div class="fun-usage-bar"><div class="fun-usage-bar-fill" style="width:${pct}%"></div></div>`
                    : '');
        } catch {
            funUsageDisplay.textContent = 'Could not load usage data.';
        }
    }

    updateFunUsage();
    setInterval(updateFunUsage, 15_000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) updateFunUsage();
    });

    // --- Event listeners ---

    function showFunLimitError(msg: string) {
        if (!funLimitHint) return;
        funLimitHint.className = 'fun-limit-hint error';
        funLimitHint.style.display = 'block';
        funLimitHint.style.opacity = '1';
        funLimitHint.style.transition = '';
        funLimitHint.textContent = msg;
        setTimeout(() => {
            funLimitHint.style.transition = 'opacity 0.35s ease';
            funLimitHint.style.opacity = '0';
            setTimeout(() => { funLimitHint.style.display = 'none'; }, 400);
        }, 3000);
    }

    function clampInput(input: HTMLInputElement | null, min: number, max: number) {
        if (!input) return;
        input.addEventListener('input', () => {
            if (funLimitHint) funLimitHint.style.display = 'none';
            const v = Number(input.value);
            if (v < min) input.value = String(min);
            if (v > max) input.value = String(max);
        });
    }

    clampInput(funLimitHours, 0, 24);
    clampInput(funLimitMinutes, 0, 59);
    clampInput(funLimitSeconds, 0, 59);

    async function saveFunLimit() {
        const h = Math.floor(Number(funLimitHours?.value) || 0);
        const m = Math.floor(Number(funLimitMinutes?.value) || 0);
        const s = Math.floor(Number(funLimitSeconds?.value) || 0);

        if (h < 0 || m < 0 || s < 0) { showFunLimitError('Values cannot be negative.'); return; }

        const totalSec = h * 3600 + m * 60 + s;
        if (totalSec > 24 * 3600) { showFunLimitError('Total cannot exceed 24 hours.'); return; }

        const minutes = totalSec / 60;

        // Once-per-day restriction (bypassed in debug builds)
        const today = new Date().toISOString().slice(0, 10);
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        if (!__DEBUG__ && settings.lastFunLimitChangeDate === today) {
            createToast('You can only change the fun time limit once per day.', 'error');
            // Restore saved values
            const savedSec = Math.round((settings.funLimitMinutes ?? 30) * 60);
            if (funLimitHours) funLimitHours.value = String(Math.floor(savedSec / 3600));
            if (funLimitMinutes) funLimitMinutes.value = String(Math.floor((savedSec % 3600) / 60));
            if (funLimitSeconds) funLimitSeconds.value = String(savedSec % 60);
            return;
        }

        settings.funLimitMinutes = minutes;
        settings.lastFunLimitChangeDate = today;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        createToast(`Fun time limit set to ${formatTime(totalSec)} per day`);
        updateFunUsage();
    }

    const funLimitInputs = [funLimitHours, funLimitMinutes, funLimitSeconds];
    for (const input of funLimitInputs) {
        input?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); saveFunLimit(); }
        });
    }

    newGoalInput?.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); await handleAddGoal(); }
    });

    addGoalBtn?.addEventListener('click', () => handleAddGoal());

    blockShortsCheckbox?.addEventListener('change', async () => {
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        settings.blockShorts = blockShortsCheckbox.checked;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        createToast(blockShortsCheckbox.checked ? 'YouTube Shorts blocked' : 'YouTube Shorts allowed');
    });

    blockingToggleBtn?.addEventListener('click', async () => {
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        settings.blockingEnabled = !settings.blockingEnabled;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        if (blockingStatus) blockingStatus.textContent = settings.blockingEnabled ? 'Blocking is currently enabled.' : 'Blocking is currently disabled.';
        if (blockingToggleBtn) blockingToggleBtn.textContent = settings.blockingEnabled ? 'Disable blocking' : 'Enable blocking';
        createToast(settings.blockingEnabled ? 'Blocking enabled' : 'Blocking disabled');
    });

    genQuizBtn?.addEventListener('click', async () => {
        if (!quizArea) return;
        quizArea.style.display = 'block';
        quizArea.innerHTML = '<div>Generating quiz…</div>';
        const quiz = await browser.runtime.sendMessage({ type: 'generateQuiz' });
        if (!Array.isArray(quiz) || quiz.length === 0) {
            quizArea.innerHTML = '<div>Could not generate quiz (no API key or parse error). Try again later.</div>';
            return;
        }
        renderQuizCarousel(quizArea, quiz.slice(0, 5));
    });

    // --- Goal management ---

    async function handleAddGoal() {
        const val = (newGoalInput?.value || '').trim();
        if (!val) return;

        // show loading indicator above goals while analysis runs
        if (goalAnalysisLoading) { goalAnalysisLoading.style.display = 'block'; }
        if (addGoalBtn) { addGoalBtn.disabled = true; addGoalBtn.textContent = 'Validating…'; }

        try {
            const resp = await browser.runtime.sendMessage({ type: 'validateGoalNemotron', goal: val });
            if (!resp?.ok) {
                const v = validateGoal(val);
                if (!v.ok) { showValidationMsg(v.reason!); return; }
            } else if (resp.result === 'N') {
                showValidationMsg(resp.reason || 'Goal does not appear sufficiently educational or descriptive.');
                return;
            }

            settings = await browser.runtime.sendMessage({ type: 'getSettings' });
            settings.goals = settings.goals || [];
            settings.goals.push(val);
            await browser.runtime.sendMessage({ type: 'saveSettings', settings });
            renderGoals(settings.goals);
            if (newGoalInput) newGoalInput.value = '';
            createToast('Goal added');
        } finally {
            // hide loading/analysis popup once done
            if (goalAnalysisLoading) { goalAnalysisLoading.style.display = 'none'; }
            if (addGoalBtn) { addGoalBtn.disabled = false; addGoalBtn.textContent = 'Add Goal'; }
        }
    }

    function renderGoals(goals: string[]) {
        if (!goalsList) return;
        goalsList.innerHTML = '';
        if (!goals.length) {
            const empty = document.createElement('div');
            empty.className = 'no-goals-msg';
            empty.textContent = 'No goals yet. Add a specific goal above.';
            goalsList.appendChild(empty);
            return;
        }
        goals.forEach((g, i) => {
            const row = document.createElement('div');
            row.className = 'goal-row';

            const text = document.createElement('div');
            text.style.flex = '1';
            text.textContent = g;
            row.appendChild(text);

            const makeBtn = (label: string, handler: () => void, ml = '6px', disabled = false) => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.style.marginLeft = ml;
                btn.disabled = disabled;
                btn.addEventListener('click', handler);
                row.appendChild(btn);
            };

            makeBtn('↑', () => moveGoal(i, i - 1), '8px', i === 0);
            makeBtn('↓', () => moveGoal(i, i + 1), '6px', i === goals.length - 1);
            makeBtn('Edit', () => editGoal(i), '8px');
            makeBtn('Delete', () => deleteGoal(i));

            goalsList.appendChild(row);
        });
    }

    async function refreshAndRender(settingsObj: any) {
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsObj });
        renderGoals(settingsObj.goals);
    }

    async function moveGoal(from: number, to: number) {
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        settings.goals = settings.goals || [];
        if (to < 0 || to >= settings.goals.length) return;
        const [item] = settings.goals.splice(from, 1);
        settings.goals.splice(to, 0, item);
        await refreshAndRender(settings);
    }

    async function editGoal(index: number) {
        const s = await browser.runtime.sendMessage({ type: 'getSettings' });
        const current = s.goals?.[index];
        const updated = prompt('Edit goal (make it specific):', current);
        if (updated === null) return;
        const val = updated.trim();

        if (goalAnalysisLoading) { goalAnalysisLoading.style.display = 'block'; }
        try {
            const resp = await browser.runtime.sendMessage({ type: 'validateGoalNemotron', goal: val });
            if (!resp?.ok) {
                const v = validateGoal(val);
                if (!v.ok) { showValidationMsg(v.reason!); return; }
            } else if (resp.result === 'N') {
                showValidationMsg(resp.reason || 'Goal not educational enough.');
                return;
            }

            s.goals[index] = val;
            await refreshAndRender(s);
            createToast('Goal updated');
        } finally {
            if (goalAnalysisLoading) { goalAnalysisLoading.style.display = 'none'; }
        }
    }

    async function deleteGoal(index: number) {
        if (!confirm('Delete this goal?')) return;
        const s = await browser.runtime.sendMessage({ type: 'getSettings' });
        s.goals?.splice(index, 1);
        await refreshAndRender(s);
        createToast('Goal deleted');
    }
});
