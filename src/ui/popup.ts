// popup.ts — popup UI logic (converted to TypeScript)

declare const browser: any;

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status') as HTMLElement | null;
    const goalText = document.getElementById('goalText') as HTMLElement | null;
    const limitText = document.getElementById('limitText') as HTMLElement | null;
    const openOptions = document.getElementById('openOptions') as HTMLElement | null;
    const disableBtn = document.getElementById('disableBtn') as HTMLElement | null;

    const settings = await browser.runtime.sendMessage({ type: 'getSettings' });
    const goals = Array.isArray(settings.goals) ? settings.goals : (settings.goal ? [settings.goal] : []);
    if (goals.length === 0) {
        if (goalText) goalText.textContent = '(not set)';
    } else if (goals.length === 1) {
        if (goalText) goalText.textContent = goals[0];
    } else {
        if (goalText) goalText.innerHTML = '<ul style="margin:6px 0;padding-left:18px">' + goals.map((g: string) => `<li>${g}</li>`).join('') + '</ul>';
    }
    if (limitText) limitText.textContent = `${settings.funLimitMinutes || 0} minutes`;
    if (status) status.textContent = settings.blockingEnabled ? 'Blocking enabled' : 'Blocking disabled';

    openOptions?.addEventListener('click', () => browser.runtime.openOptionsPage());

    disableBtn?.addEventListener('click', async () => {
        // Open options page where the quiz flow is implemented (options.html)
        browser.runtime.openOptionsPage();
    });
});

export { };
