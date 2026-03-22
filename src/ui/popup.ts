// popup.ts — popup UI logic

declare const browser: any;

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status');
    const goalText = document.getElementById('goalText');
    const limitText = document.getElementById('limitText');
    const openOptions = document.getElementById('openOptions');
    const disableBtn = document.getElementById('disableBtn');

    const settings = await browser.runtime.sendMessage({ type: 'getSettings' });
    const goals: string[] = settings.goals || [];

    if (goalText) {
        if (goals.length === 0) {
            goalText.textContent = '(not set)';
        } else if (goals.length === 1) {
            goalText.textContent = goals[0];
        } else {
            goalText.innerHTML = '<ul style="margin:6px 0;padding-left:18px">'
                + goals.map((g: string) => `<li>${g}</li>`).join('') + '</ul>';
        }
    }
    if (limitText) limitText.textContent = `${settings.funLimitMinutes || 0} minutes`;
    if (status) status.textContent = settings.blockingEnabled ? 'Blocking enabled' : 'Blocking disabled';

    const openOpts = () => browser.runtime.openOptionsPage();
    openOptions?.addEventListener('click', openOpts);
    disableBtn?.addEventListener('click', openOpts);
});

