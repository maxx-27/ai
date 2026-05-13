// ============================================
// Max AI - Frontend Script
// ============================================
// Mode-based AI chat (Creative / Precise / Fast)
// API key TIDAK disimpan di frontend (aman)
// ============================================

(function () {
    'use strict';

    // ---------- DOM Elements ----------
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const modeSelector = document.getElementById('modeSelector');
    const mobileNav = document.getElementById('mobileNav');
    const newThreadBtn = document.getElementById('newThreadBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const historyBtn = document.getElementById('historyBtn');
    const chatHistoryPanel = document.getElementById('chatHistoryPanel');
    const statusDot = document.getElementById('statusDot');
    const statusLabel = document.getElementById('statusLabel');
    const inputStatusDot = document.getElementById('inputStatusDot');
    const inputStatusText = document.getElementById('inputStatusText');
    const toastContainer = document.getElementById('toastContainer');

    // ---------- State ----------
    let selectedMode = 'precise';
    let isLoading = false;
    let messages = [];
    let sessions = JSON.parse(localStorage.getItem('maxai_sessions') || '[]');
    let currentSessionId = null;

    // ============================================
    // Init
    // ============================================
    function init() {
        setupListeners();
        checkApiStatus();
    }

    // ============================================
    // Event Listeners
    // ============================================
    function setupListeners() {
        // Send message
        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });

        // Auto-resize + enable/disable send
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            sendBtn.disabled = chatInput.value.trim().length === 0;
        });

        // Desktop mode selector
        modeSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.mode-btn');
            if (!btn) return;
            setActiveMode(btn.dataset.mode);
        });

        // Mobile mode selector
        mobileNav.addEventListener('click', (e) => {
            const btn = e.target.closest('.mobile-mode-btn');
            if (!btn) return;
            setActiveMode(btn.dataset.mode);
        });

        // Suggestion cards
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                chatInput.value = card.dataset.prompt;
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
                sendBtn.disabled = false;
                chatInput.focus();
            });
        });

        // New thread
        newThreadBtn.addEventListener('click', startNewChat);

        // Clear all
        clearAllBtn.addEventListener('click', () => {
            if (messages.length === 0) return;
            if (confirm('Clear all messages?')) { messages = []; renderMessages(); showToast('Chat cleared', 'info'); }
        });

        // Mobile sidebar
        mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar(true));
        sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));

        // Archive / history toggle
        historyBtn.addEventListener('click', toggleHistory);
    }

    // ============================================
    // Mode Switching
    // ============================================
    function setActiveMode(mode) {
        selectedMode = mode;

        // Update desktop buttons
        modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.className = 'mode-btn active flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-on-primary font-bold transition-all text-label-sm scale-105 shadow-lg';
            } else {
                btn.className = 'mode-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface transition-all text-label-sm';
            }
        });

        // Update mobile buttons
        mobileNav.querySelectorAll('.mobile-mode-btn').forEach(btn => {
            if (btn.dataset.mode === mode) {
                btn.className = 'mobile-mode-btn active flex flex-col items-center justify-center bg-primary text-on-primary rounded-full px-6 py-1 scale-110 shadow-xl';
            } else {
                btn.className = 'mobile-mode-btn flex flex-col items-center justify-center text-on-surface-variant/60';
            }
        });
    }

    // ============================================
    // Send Message to Backend
    // ============================================
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isLoading) return;

        // Hide welcome
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // Add user message
        messages.push({ role: 'user', content: text });
        renderMessages();

        // Reset input
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.disabled = true;
        isLoading = true;

        // Update status
        inputStatusText.textContent = 'Processing...';
        showTyping();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, mode: selectedMode })
            });

            const data = await response.json();
            removeTyping();

            if (!response.ok || !data.success) throw new Error(data.error || 'Request failed');

            messages.push({
                role: 'assistant',
                content: data.reply,
                model: data.model,
                provider: data.provider,
                mode: data.mode,
                fallback: data.fallback
            });

            renderMessages();
            saveSession();
            inputStatusText.textContent = 'System Coherent & Ready';

        } catch (err) {
            removeTyping();
            showToast(err.message, 'error');
            messages.push({
                role: 'assistant',
                content: `⚠️ **Error:** ${err.message}\n\nPeriksa koneksi atau API key Anda.`,
                model: 'Error',
                provider: 'system',
                mode: selectedMode
            });
            renderMessages();
            inputStatusText.textContent = 'Error — Try Again';
        } finally {
            isLoading = false;
        }
    }

    // ============================================
    // Render Messages
    // ============================================
    function renderMessages() {
        // Remove all messages (keep welcome screen element)
        chatMessages.querySelectorAll('.chat-msg, .typing-msg').forEach(el => el.remove());

        if (messages.length === 0 && welcomeScreen) {
            welcomeScreen.style.display = '';
            return;
        }
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        messages.forEach(msg => chatMessages.appendChild(createMsgEl(msg)));
        scrollBottom();
    }

    function createMsgEl(msg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-msg max-w-4xl mx-auto msg-enter';

        if (msg.role === 'user') {
            wrapper.innerHTML = `
                <div class="flex justify-end">
                    <div class="max-w-[85%] glass-panel px-6 py-4 rounded-3xl rounded-tr-none">
                        <p class="font-body-md text-on-surface">${escapeHtml(msg.content)}</p>
                    </div>
                </div>`;
        } else {
            const modeClass = msg.mode || 'precise';
            const badgeLabel = msg.fallback ? `Fallback · ${msg.model}` : (msg.model || 'AI');
            const badgeType = msg.fallback ? 'fallback' : modeClass;

            wrapper.innerHTML = `
                <div class="flex justify-start items-start gap-3">
                    <div class="w-8 h-8 rounded-full orb-gradient flex-shrink-0 mt-1"></div>
                    <div class="max-w-[85%]">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-label-sm text-primary font-bold">Max AI</span>
                            <span class="mode-badge ${badgeType}">${badgeLabel}</span>
                        </div>
                        <div class="glass-panel px-6 py-4 rounded-3xl rounded-tl-none">
                            <div class="msg-text font-body-md text-on-surface-variant leading-relaxed">${formatMsg(msg.content)}</div>
                        </div>
                    </div>
                </div>`;
        }
        return wrapper;
    }

    // ============================================
    // Simple Markdown Formatter
    // ============================================
    function formatMsg(text) {
        if (!text) return '';
        let f = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        f = f.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`);
        f = f.replace(/`([^`]+)`/g, '<code>$1</code>');
        f = f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        f = f.replace(/\*(.+?)\*/g, '<em>$1</em>');
        f = f.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        f = f.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
        f = f.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        f = f.replace(/\n/g, '<br>');
        return `<p>${f}</p>`;
    }

    // ============================================
    // Typing Indicator
    // ============================================
    function showTyping() {
        const el = document.createElement('div');
        el.className = 'chat-msg typing-msg max-w-4xl mx-auto msg-enter';
        el.innerHTML = `
            <div class="flex justify-start items-start gap-3">
                <div class="w-8 h-8 rounded-full orb-gradient flex-shrink-0 mt-1 ai-pulse"></div>
                <div class="glass-panel px-6 py-4 rounded-3xl rounded-tl-none">
                    <div class="flex gap-[6px] items-center h-5">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>`;
        chatMessages.appendChild(el);
        scrollBottom();
    }

    function removeTyping() {
        chatMessages.querySelector('.typing-msg')?.remove();
    }

    // ============================================
    // Sessions
    // ============================================
    function saveSession() {
        if (!messages.length) return;
        if (!currentSessionId) currentSessionId = 'ses_' + Date.now();
        const first = messages.find(m => m.role === 'user');
        const title = first ? first.content.substring(0, 50) : 'New chat';
        const idx = sessions.findIndex(s => s.id === currentSessionId);
        const data = { id: currentSessionId, title, messages, ts: Date.now() };
        if (idx >= 0) sessions[idx] = data; else sessions.unshift(data);
        if (sessions.length > 20) sessions = sessions.slice(0, 20);
        localStorage.setItem('maxai_sessions', JSON.stringify(sessions));
    }

    function loadSession(id) {
        const s = sessions.find(x => x.id === id);
        if (!s) return;
        currentSessionId = s.id;
        messages = [...s.messages];
        renderMessages();
        toggleMobileSidebar(false);
    }

    function startNewChat() {
        currentSessionId = null;
        messages = [];
        renderMessages();
        chatInput.focus();
        toggleMobileSidebar(false);
    }

    function toggleHistory() {
        const nav = historyBtn.closest('nav');
        const isVisible = !chatHistoryPanel.classList.contains('hidden');
        if (isVisible) {
            chatHistoryPanel.classList.add('hidden');
            nav.classList.remove('hidden');
        } else {
            nav.classList.add('hidden');
            chatHistoryPanel.classList.remove('hidden');
            chatHistoryPanel.innerHTML = '';
            if (sessions.length === 0) {
                chatHistoryPanel.innerHTML = '<p class="text-on-surface-variant/50 text-label-sm px-2 py-4">No history yet</p>';
            } else {
                // Back button
                const back = document.createElement('button');
                back.className = 'w-full flex items-center gap-2 px-4 py-2 text-primary hover:bg-white/5 rounded-xl text-label-sm mb-2';
                back.innerHTML = '<span class="material-symbols-outlined text-[18px]">arrow_back</span> Back';
                back.onclick = () => { chatHistoryPanel.classList.add('hidden'); nav.classList.remove('hidden'); };
                chatHistoryPanel.appendChild(back);

                sessions.forEach(s => {
                    const item = document.createElement('button');
                    item.className = `history-item w-full text-left px-4 py-3 rounded-xl text-on-surface-variant text-body-md truncate ${s.id === currentSessionId ? 'active' : ''}`;
                    item.textContent = s.title;
                    item.onclick = () => loadSession(s.id);
                    chatHistoryPanel.appendChild(item);
                });
            }
        }
    }

    // ============================================
    // API Status Check
    // ============================================
    async function checkApiStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            const oai = data.apis.openai === 'configured';
            const gem = data.apis.gemini === 'configured';

            if (oai && gem) {
                statusDot.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]';
                statusLabel.textContent = 'All APIs Active';
                inputStatusDot.className = 'w-2 h-2 rounded-full bg-green-500 ai-pulse';
            } else if (oai || gem) {
                statusDot.className = 'w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
                statusLabel.textContent = `${oai ? 'OpenAI' : 'Gemini'} active`;
                inputStatusDot.className = 'w-2 h-2 rounded-full bg-yellow-500 ai-pulse';
            } else {
                statusDot.className = 'w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
                statusLabel.textContent = 'APIs not configured';
                inputStatusText.textContent = 'Configure API Keys in .env';
                inputStatusDot.className = 'w-2 h-2 rounded-full bg-red-500 ai-pulse';
            }
        } catch {
            statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
            statusLabel.textContent = 'Server offline';
            inputStatusText.textContent = 'Server Offline';
        }
    }

    // ============================================
    // Utilities
    // ============================================
    function scrollBottom() {
        requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
    }

    function toggleMobileSidebar(show) {
        if (show) {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
            sidebarOverlay.classList.remove('hidden');
        } else {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
            sidebarOverlay.classList.add('hidden');
        }
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function showToast(msg, type = 'info') {
        const colors = { error: 'bg-red-600', success: 'bg-green-600', info: 'bg-primary', warning: 'bg-yellow-600' };
        const icons = { error: 'error', success: 'check_circle', info: 'info', warning: 'warning' };
        const t = document.createElement('div');
        t.className = `toast-item ${colors[type]} text-white px-5 py-3 rounded-2xl flex items-center gap-3 shadow-2xl text-body-md`;
        t.innerHTML = `<span class="material-symbols-outlined text-[20px]">${icons[type]}</span>${msg}`;
        toastContainer.appendChild(t);
        setTimeout(() => t.remove(), 4000);
    }

    // ---------- Start ----------
    init();
})();
