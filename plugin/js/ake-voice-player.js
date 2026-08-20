(function () {
    'use strict';

    if (window.AKEVoicePlayer) return;

    const AUDIO_ROOT = 'https://endfield-assets.fffdan.com/audios/dialogs/vo';
    const LANGUAGE_PATHS = Object.freeze({
        CH: 'chinese',
        TC: 'chinese',
        EN: 'english',
        JP: 'japanese',
        KR: 'korean'
    });
    let activeAudio = null;
    let activeButton = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    function audioLanguage() {
        const language = window.akeI18n?.getLanguage?.() || 'CH';
        return LANGUAGE_PATHS[language] || 'chinese';
    }

    function audioUrl(voId) {
        return `${AUDIO_ROOT}/${audioLanguage()}/${encodeURIComponent(String(voId || ''))}`;
    }

    function setButtonState(button, state) {
        if (!button) return;
        const playing = state === 'playing';
        button.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
        button.setAttribute('aria-pressed', String(playing));
        button.setAttribute('aria-label', button.dataset[playing ? 'pauseLabel' : 'playLabel'] || 'Play voice');
        button.title = state === 'error'
            ? (button.dataset.errorLabel || 'Voice playback failed')
            : (button.dataset[playing ? 'pauseLabel' : 'playLabel'] || 'Play voice');
    }

    function releaseActive() {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio = null;
        }
        setButtonState(activeButton, 'idle');
        activeButton = null;
    }

    function toggle(button) {
        const voId = String(button?.dataset?.akeVoiceId || '').trim();
        if (!voId) return;
        if (button === activeButton && activeAudio) {
            if (activeAudio.paused) {
                const audio = activeAudio;
                audio.play().then(() => {
                    if (activeAudio === audio) setButtonState(button, 'playing');
                }).catch(() => {
                    if (activeAudio === audio) setButtonState(button, 'error');
                });
            } else {
                activeAudio.pause();
                setButtonState(button, 'idle');
            }
            return;
        }

        releaseActive();
        const audio = new Audio();
        activeAudio = audio;
        activeButton = button;
        audio.preload = 'none';
        audio.src = audioUrl(voId);
        audio.addEventListener('ended', () => {
            if (activeAudio !== audio) return;
            setButtonState(button, 'idle');
            activeAudio = null;
            activeButton = null;
        }, { once: true });
        audio.addEventListener('error', () => {
            if (activeAudio !== audio) return;
            setButtonState(button, 'error');
            activeAudio = null;
            activeButton = null;
        }, { once: true });
        audio.play().then(() => {
            if (activeAudio === audio) setButtonState(button, 'playing');
        }).catch(() => {
            if (activeAudio !== audio) return;
            setButtonState(button, 'error');
            activeAudio = null;
            activeButton = null;
        });
    }

    function buttonHtml(voId, labels = {}) {
        if (!voId) return '';
        const playLabel = labels.play || 'Play voice';
        const pauseLabel = labels.pause || 'Pause voice';
        const errorLabel = labels.error || 'Voice playback failed';
        return `<button type="button" class="ake-ui-icon-button" data-ake-voice-id="${escapeHtml(voId)}" data-play-label="${escapeHtml(playLabel)}" data-pause-label="${escapeHtml(pauseLabel)}" data-error-label="${escapeHtml(errorLabel)}" aria-label="${escapeHtml(playLabel)}" title="${escapeHtml(playLabel)}" aria-pressed="false">&#9654;</button>`;
    }

    document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-ake-voice-id]');
        if (button) toggle(button);
    });
    window.addEventListener('ake:module-deactivate', releaseActive);

    window.AKEVoicePlayer = { buttonHtml, stop: releaseActive, toggle };
})();
