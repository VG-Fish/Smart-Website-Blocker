// options.ts — options page behaviour (converted to TypeScript)

declare const browser: any;

document.addEventListener('DOMContentLoaded', async () => {
    const newGoalInput = document.getElementById('newGoalInput') as HTMLInputElement | null;
    const addGoalBtn = document.getElementById('addGoalBtn') as HTMLButtonElement | null;
    const goalsList = document.getElementById('goalsList') as HTMLElement | null;
    const educationalChk = document.getElementById('educationalChk') as HTMLInputElement | null;
    const funLimit = document.getElementById('funLimit') as HTMLInputElement | null;
    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement | null;
    const genQuizBtn = document.getElementById('genQuizBtn') as HTMLButtonElement | null;
    const clearKeysBtn = document.getElementById('clearKeysBtn') as HTMLButtonElement | null;
    const quizArea = document.getElementById('quizArea') as HTMLElement | null;

    const settings = await browser.runtime.sendMessage({ type: 'getSettings' });
    // migrate old single-goal to goals array if needed
    if (settings && typeof settings.goal === 'string' && !Array.isArray(settings.goals)) {
        settings.goals = settings.goals || [];
        if (settings.goal && settings.goal.trim()) settings.goals.push(settings.goal.trim());
        delete settings.goal;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
    }
    if (educationalChk) educationalChk.checked = !!settings.isEducationalGoal;
    if (funLimit) funLimit.value = settings.funLimitMinutes || 30;
    renderGoals(settings.goals || []);

    saveBtn?.addEventListener('click', async () => {
        // Save existing settings (goals already saved via operations); just persist flags and limits
        settings.isEducationalGoal = educationalChk?.checked;
        settings.funLimitMinutes = Number(funLimit?.value) || 0;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        alert('Saved');
    });

    genQuizBtn?.addEventListener('click', async () => {
        if (!quizArea) return;
        quizArea.style.display = 'block';
        quizArea.innerHTML = '<div>Generating quiz…</div>';
        const quiz = await browser.runtime.sendMessage({ type: 'generateQuiz' });
        renderQuiz(quizArea, quiz);
    });

    clearKeysBtn?.addEventListener('click', async () => {
        const s = await browser.runtime.sendMessage({ type: 'getSettings' });
        let changed = false;
        ['openrouterApiKey', 'openrouterUrl'].forEach(k => {
            if (s && Object.prototype.hasOwnProperty.call(s, k)) {
                delete s[k];
                changed = true;
            }
        });
        if (changed) {
            await browser.runtime.sendMessage({ type: 'saveSettings', settings: s });
            alert('Cleared stored API keys from settings. If you used .env, it remains unchanged.');
            location.reload();
        } else {
            alert('No stored API keys found in settings.');
        }
    });

    function renderQuiz(el: HTMLElement, quiz: any) {
        if (!quiz || !quiz.questions || quiz.questions.length === 0) {
            el.innerHTML = '<div>Could not generate quiz (no API key or error). Try saving your API key first or use fallback).</div>';
            return;
        }
        el.innerHTML = '';
        const form = document.createElement('form');
        form.id = 'quizForm';
        quiz.questions.slice(0, 5).forEach((q: any, i: number) => {
            const div = document.createElement('div');
            div.className = 'quiz-q';
            const label = document.createElement('label');
            label.textContent = `${i + 1}. ${q.q}`;
            div.appendChild(label);
            if (q.type === 'mc' && Array.isArray(q.options)) {
                q.options.forEach((opt: string) => {
                    const r = document.createElement('div');
                    r.innerHTML = `<label><input type="radio" name="q${i}" value="${opt}" /> ${opt}</label>`;
                    div.appendChild(r);
                });
            } else {
                const ta = document.createElement('input');
                ta.type = 'text';
                ta.name = `q${i}`;
                div.appendChild(ta);
            }
            form.appendChild(div);
        });

        const timer = document.createElement('div');
        timer.id = 'quizTimer';
        timer.textContent = 'Time left: 5:00';
        el.appendChild(timer);
        const submit = document.createElement('button');
        submit.textContent = 'Submit Quiz';
        submit.type = 'button';
        submit.addEventListener('click', () => submitQuiz(form, quiz));
        el.appendChild(form);
        el.appendChild(submit);

        // start 5-minute countdown
        let remaining = 5 * 60;
        const interval = setInterval(() => {
            remaining -= 1;
            const m = Math.floor(remaining / 60).toString().padStart(1, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            timer.textContent = `Time left: ${m}:${s}`;
            if (remaining <= 0) {
                clearInterval(interval);
                alert('Time is up — quiz failed');
            }
        }, 1000);
    }

    async function submitQuiz(form: HTMLFormElement, quiz: any) {
        const formData = new FormData(form);
        let answered = 0;
        for (let i = 0; i < Math.min(5, quiz.questions.length); i++) {
            const val = formData.get(`q${i}`);
            if (val && val.toString().trim().length > 0) answered++;
        }
        const score = (answered / Math.min(5, quiz.questions.length)) * 100;
        if (score >= 60) {
            const s = await browser.runtime.sendMessage({ type: 'getSettings' });
            s.blockingEnabled = false;
            await browser.runtime.sendMessage({ type: 'saveSettings', settings: s });
            alert('Quiz passed — blocking disabled. You can re-enable in settings.');
            location.reload();
        } else {
            alert(`Quiz failed — score ${Math.round(score)}%. Need >= 60%.`);
        }
    }

    // Goals UI
    function renderGoals(goals: string[]) {
        if (!goalsList) return;
        goalsList.innerHTML = '';
        if (!goals || goals.length === 0) {
            goalsList.innerHTML = '<div style="color:#666">No goals yet. Add a specific goal above.</div>';
            return;
        }
        goals.forEach((g, i) => {
            const row = document.createElement('div');
            row.className = 'goal-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '6px';

            const text = document.createElement('div');
            text.style.flex = '1';
            text.textContent = g;

            const edit = document.createElement('button');
            edit.textContent = 'Edit';
            edit.style.marginLeft = '8px';
            edit.addEventListener('click', () => editGoal(i));

            const del = document.createElement('button');
            del.textContent = 'Delete';
            del.style.marginLeft = '6px';
            del.addEventListener('click', () => deleteGoal(i));

            row.appendChild(text);
            row.appendChild(edit);
            row.appendChild(del);
            goalsList.appendChild(row);
        });
    }

    async function addGoal() {
        const val = (newGoalInput?.value || '').trim();
        const settingsNow = await browser.runtime.sendMessage({ type: 'getSettings' });
        const goals = settingsNow.goals || [];
        const validation = validateGoal(val);
        if (!validation.ok) {
            alert(`Goal not specific enough: ${validation.reason}`);
            return;
        }
        goals.push(val);
        settingsNow.goals = goals;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsNow });
        if (newGoalInput) newGoalInput.value = '';
        renderGoals(goals);
    }

    async function editGoal(index: number) {
        const settingsNow = await browser.runtime.sendMessage({ type: 'getSettings' });
        const goals = settingsNow.goals || [];
        const current = goals[index];
        const updated = prompt('Edit goal (make it specific):', current);
        if (updated === null) return; // cancelled
        const val = updated.trim();
        const validation = validateGoal(val);
        if (!validation.ok) {
            alert(`Goal not specific enough: ${validation.reason}`);
            return;
        }
        goals[index] = val;
        settingsNow.goals = goals;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsNow });
        renderGoals(goals);
    }

    async function deleteGoal(index: number) {
        if (!confirm('Delete this goal?')) return;
        const settingsNow = await browser.runtime.sendMessage({ type: 'getSettings' });
        const goals = settingsNow.goals || [];
        goals.splice(index, 1);
        settingsNow.goals = goals;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsNow });
        renderGoals(goals);
    }

    // Basic specificity validation: require at least 6 words AND contain a reason/verb phrase
    function validateGoal(text: string) {
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

    addGoalBtn?.addEventListener('click', addGoal);
});

export { };
