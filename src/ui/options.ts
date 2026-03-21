// options.ts — options page behaviour (converted to TypeScript)

declare const browser: any;

document.addEventListener('DOMContentLoaded', async () => {
    const newGoalInput = document.getElementById('newGoalInput') as HTMLInputElement | null;
    const addGoalBtn = document.getElementById('addGoalBtn') as HTMLButtonElement | null;
    const goalsList = document.getElementById('goalsList') as HTMLElement | null;
    const funLimit = document.getElementById('funLimit') as HTMLInputElement | null;
    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement | null;
    const genQuizBtn = document.getElementById('genQuizBtn') as HTMLButtonElement | null;
    const quizArea = document.getElementById('quizArea') as HTMLElement | null;

    let settings = await browser.runtime.sendMessage({ type: 'getSettings' });
    // migrate old single-goal to goals array if needed
    if (settings && typeof settings.goal === 'string' && !Array.isArray(settings.goals)) {
        settings.goals = settings.goals || [];
        if (settings.goal && settings.goal.trim()) settings.goals.push(settings.goal.trim());
        delete settings.goal;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
    }
    if (funLimit) funLimit.value = settings.funLimitMinutes || 30;
    renderGoals(settings.goals || []);

    saveBtn?.addEventListener('click', async () => {
        settings.funLimitMinutes = Number(funLimit?.value) || 0;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        createToast('Settings saved', 'success');
    });

    // Add goal on Enter
    newGoalInput?.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            await handleAddGoal();
        }
    });

    addGoalBtn?.addEventListener('click', async () => {
        await handleAddGoal();
    });

    async function handleAddGoal() {
        const val = (newGoalInput?.value || '').trim();
        if (!val) return;

        // Ask background to validate with Nemotron (returns { ok, result: 'Y'|'N', reason })
        const resp = await browser.runtime.sendMessage({ type: 'validateGoalNemotron', goal: val });
        if (!resp || !resp.ok) {
            // Fallback to local validation rule
            const v = validateGoal(val);
            if (!v.ok) {
                showValidationDialog(v.reason || 'Goal not specific enough');
                return;
            }
        }

        if (resp && resp.result === 'N') {
            // Not educational enough — show slightly red dialog and do not clear input
            showValidationDialog(resp.reason || 'Goal does not appear sufficiently educational or descriptive.');
            return;
        }

        // Ok — add and autosave
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        settings.goals = settings.goals || [];
        settings.goals.push(val);
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        renderGoals(settings.goals);
        if (newGoalInput) newGoalInput.value = '';
        createToast('Goal added', 'success');
    }

    // Quiz generation and rendering
    genQuizBtn?.addEventListener('click', async () => {
        if (!quizArea) return;
        quizArea.style.display = 'block';
        quizArea.innerHTML = '<div>Generating quiz…</div>';
        const quiz = await browser.runtime.sendMessage({ type: 'generateQuiz' });
        // Expect quiz to be an array of question objects
        if (!quiz || !Array.isArray(quiz) || quiz.length === 0) {
            quizArea.innerHTML = '<div>Could not generate quiz (no API key or parse error). Try again later.</div>';
            return;
        }
        renderQuizCarousel(quizArea, quiz.slice(0, 5));
    });

    // Small helper: toast popup bottom-right
    function createToast(text: string, type: 'success' | 'error' = 'success') {
        const t = document.createElement('div');
        t.textContent = text;
        t.style.position = 'fixed';
        t.style.right = '16px';
        t.style.bottom = '16px';
        t.style.padding = '10px 14px';
        t.style.borderRadius = '6px';
        t.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        t.style.zIndex = '99999';
        t.style.color = '#fff';
        t.style.fontSize = '13px';
        t.style.background = type === 'success' ? '#2e7d32' : '#b00020';
        document.body.appendChild(t);
        setTimeout(() => {
            t.style.transition = 'opacity 0.35s ease';
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 400);
        }, 2000);
    }

    function showValidationDialog(msg: string) {
        // Slightly red dialog near the input
        let d = document.getElementById('goalValidationDialog') as HTMLElement | null;
        if (!d) {
            d = document.createElement('div');
            d.id = 'goalValidationDialog';
            d.style.position = 'relative';
            d.style.marginTop = '8px';
            d.style.padding = '8px';
            d.style.borderRadius = '6px';
            d.style.background = 'rgba(200,40,40,0.08)';
            d.style.border = '1px solid rgba(200,40,40,0.2)';
            d.style.color = '#700';
            const container = document.querySelector('.container');
            container?.insertBefore(d, container.firstChild?.nextSibling || null);
        }
        d.textContent = msg;
    }

    // Render goals with edit/delete and move up/down
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

            const up = document.createElement('button');
            up.textContent = '↑';
            up.title = 'Move up';
            up.style.marginLeft = '8px';
            up.disabled = i === 0;
            up.addEventListener('click', () => moveGoal(i, i - 1));

            const down = document.createElement('button');
            down.textContent = '↓';
            down.title = 'Move down';
            down.style.marginLeft = '6px';
            down.disabled = i === goals.length - 1;
            down.addEventListener('click', () => moveGoal(i, i + 1));

            const edit = document.createElement('button');
            edit.textContent = 'Edit';
            edit.style.marginLeft = '8px';
            edit.addEventListener('click', () => editGoal(i));

            const del = document.createElement('button');
            del.textContent = 'Delete';
            del.style.marginLeft = '6px';
            del.addEventListener('click', () => deleteGoal(i));

            row.appendChild(text);
            row.appendChild(up);
            row.appendChild(down);
            row.appendChild(edit);
            row.appendChild(del);
            goalsList.appendChild(row);
        });
    }

    async function moveGoal(from: number, to: number) {
        settings = await browser.runtime.sendMessage({ type: 'getSettings' });
        settings.goals = settings.goals || [];
        if (to < 0 || to >= settings.goals.length) return;
        const arr = settings.goals;
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
        settings.goals = arr;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        renderGoals(settings.goals);
    }

    async function editGoal(index: number) {
        const settingsNow = await browser.runtime.sendMessage({ type: 'getSettings' });
        const goals = settingsNow.goals || [];
        const current = goals[index];
        const updated = prompt('Edit goal (make it specific):', current);
        if (updated === null) return; // cancelled
        const val = updated.trim();

        // Validate with nemotron if possible
        const resp = await browser.runtime.sendMessage({ type: 'validateGoalNemotron', goal: val });
        if (resp && resp.result === 'N') {
            showValidationDialog(resp.reason || 'Goal not educational enough.');
            return;
        }

        goals[index] = val;
        settingsNow.goals = goals;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsNow });
        renderGoals(goals);
        createToast('Goal updated', 'success');
    }

    async function deleteGoal(index: number) {
        if (!confirm('Delete this goal?')) return;
        const settingsNow = await browser.runtime.sendMessage({ type: 'getSettings' });
        const goals = settingsNow.goals || [];
        goals.splice(index, 1);
        settingsNow.goals = goals;
        await browser.runtime.sendMessage({ type: 'saveSettings', settings: settingsNow });
        renderGoals(goals);
        createToast('Goal deleted', 'success');
    }

    // Local fallback validation
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

    // Render a quiz carousel (one question at a time). Expected format: [{question: '', answer_choices: [{choice:'', isCorrect:true}, ...]}, ...]
    function renderQuizCarousel(container: HTMLElement, questions: any[]) {
        container.innerHTML = '';
        let idx = 0;
        const state: any = { answers: Array(questions.length).fill(null) };

        const qBox = document.createElement('div');
        qBox.style.border = '1px solid #ddd';
        qBox.style.padding = '12px';
        qBox.style.borderRadius = '8px';
        qBox.style.background = '#fff';
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

            const choices = document.createElement('div');
            if (Array.isArray(q.answer_choices)) {
                q.answer_choices.forEach((c: any, ci: number) => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    const input = document.createElement('input');
                    input.type = 'radio';
                    input.name = `q${idx}`;
                    input.checked = state.answers[idx] === ci;
                    input.addEventListener('change', () => state.answers[idx] = ci);
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(' ' + c.choice));
                    choices.appendChild(label);
                });
            } else {
                const ta = document.createElement('input');
                ta.type = 'text';
                ta.value = state.answers[idx] || '';
                ta.addEventListener('input', () => state.answers[idx] = ta.value);
                choices.appendChild(ta);
            }
            qBox.appendChild(choices);

            nav.innerHTML = '';
            const prev = document.createElement('button');
            prev.textContent = 'Previous';
            prev.disabled = idx === 0;
            prev.addEventListener('click', () => { idx = Math.max(0, idx - 1); render(); });
            nav.appendChild(prev);

            const next = document.createElement('button');
            next.textContent = idx === questions.length - 1 ? 'Submit' : 'Next';
            next.style.marginLeft = '8px';
            next.addEventListener('click', async () => {
                if (idx === questions.length - 1) {
                    // Submit
                    await submitQuizAnswers(questions, state.answers);
                } else {
                    idx = Math.min(questions.length - 1, idx + 1);
                    render();
                }
            });
            nav.appendChild(next);
        }

        render();
    }

    async function submitQuizAnswers(questions: any[], answers: any[]) {
        let correct = 0;
        let total = 0;
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            total++;
            if (Array.isArray(q.answer_choices)) {
                const selected = answers[i];
                if (selected == null) continue;
                if (q.answer_choices[selected] && q.answer_choices[selected].isCorrect) correct++;
            } else {
                // short answer: treat non-empty as correct for now
                if (answers[i] && String(answers[i]).trim().length > 0) correct++;
            }
        }
        const score = Math.round((correct / total) * 100);
        if (score >= 60) {
            const s = await browser.runtime.sendMessage({ type: 'getSettings' });
            s.blockingEnabled = false;
            await browser.runtime.sendMessage({ type: 'saveSettings', settings: s });
            createToast('Quiz passed — blocking disabled', 'success');
            location.reload();
        } else {
            alert(`Quiz failed — score ${score}%. Need >= 60%.`);
        }
    }
});

export { };
