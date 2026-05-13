// ============================================
// Max AI — Frontend Script v3
// Blue & Black UI with Mode Dropdown
// ============================================
(function(){
'use strict';

// DOM
const chatArea=document.getElementById('chatArea');
const chatInput=document.getElementById('chatInput');
const sendBtn=document.getElementById('sendBtn');
const welcomeScreen=document.getElementById('welcomeScreen');
const modeToggleBtn=document.getElementById('modeToggleBtn');
const modeDropdown=document.getElementById('modeDropdown');
const modeIcon=document.getElementById('modeIcon');
const modeLabel=document.getElementById('modeLabel');
const newThreadBtn=document.getElementById('newThreadBtn');
const clearBtn=document.getElementById('clearBtn');
const menuBtn=document.getElementById('menuBtn');
const sidebar=document.getElementById('sidebar');
const sidebarCloseBtn=document.getElementById('sidebarCloseBtn');
const sidebarOverlay=document.getElementById('sidebarOverlay');
const historyList=document.getElementById('historyList');
const apiIndicator=document.getElementById('apiIndicator');
const toastBox=document.getElementById('toastBox');
const particles=document.getElementById('particles');

// State
let mode='precise';
let loading=false;
let messages=[];
let sessions=JSON.parse(localStorage.getItem('maxai_s')||'[]');
let sessionId=null;

const MODE_MAP={
    creative:{icon:'auto_awesome',label:'Creative'},
    precise:{icon:'biotech',label:'Precise'},
    fast:{icon:'bolt',label:'Fast'}
};

// ====== Init ======
function init(){
    listen();
    checkStatus();
    spawnParticles();
}

// ====== Particles ======
function spawnParticles(){
    for(let i=0;i<30;i++){
        const p=document.createElement('div');
        p.className='particle';
        p.style.left=Math.random()*100+'%';
        p.style.top=Math.random()*100+'%';
        p.style.animationDelay=Math.random()*4+'s';
        p.style.animationDuration=(3+Math.random()*3)+'s';
        particles.appendChild(p);
    }
}

// ====== Events ======
function listen(){
    sendBtn.addEventListener('click',send);
    chatInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
    chatInput.addEventListener('input',()=>{
        chatInput.style.height='auto';
        chatInput.style.height=Math.min(chatInput.scrollHeight,140)+'px';
        sendBtn.disabled=chatInput.value.trim().length===0;
    });

    // Mode dropdown toggle
    modeToggleBtn.addEventListener('click',e=>{
        e.stopPropagation();
        const open=modeDropdown.classList.toggle('show');
        modeToggleBtn.classList.toggle('open',open);
    });

    // Mode selection
    modeDropdown.addEventListener('click',e=>{
        const opt=e.target.closest('.mode-option');
        if(!opt)return;
        mode=opt.dataset.mode;
        modeDropdown.querySelectorAll('.mode-option').forEach(o=>o.classList.remove('active'));
        opt.classList.add('active');
        modeIcon.textContent=MODE_MAP[mode].icon;
        modeLabel.textContent=MODE_MAP[mode].label;
        modeDropdown.classList.remove('show');
        modeToggleBtn.classList.remove('open');
    });

    // Close dropdown on outside click
    document.addEventListener('click',()=>{
        modeDropdown.classList.remove('show');
        modeToggleBtn.classList.remove('open');
    });
    modeDropdown.addEventListener('click',e=>e.stopPropagation());

    // Suggestions
    document.querySelectorAll('.suggest-card').forEach(c=>{
        c.addEventListener('click',()=>{
            chatInput.value=c.dataset.prompt;
            chatInput.style.height='auto';
            chatInput.style.height=Math.min(chatInput.scrollHeight,140)+'px';
            sendBtn.disabled=false;
            chatInput.focus();
        });
    });

    // Sidebar
    menuBtn.addEventListener('click',()=>toggleSidebar(true));
    sidebarCloseBtn.addEventListener('click',()=>toggleSidebar(false));
    sidebarOverlay.addEventListener('click',()=>toggleSidebar(false));

    // New thread & clear
    newThreadBtn.addEventListener('click',newChat);
    clearBtn.addEventListener('click',()=>{
        if(!messages.length)return;
        if(confirm('Clear all messages?')){messages=[];render();toast('Chat cleared','info')}
    });

    // Keyboard shortcut
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();newChat()}});
}

// ====== Send ======
async function send(){
    const text=chatInput.value.trim();
    if(!text||loading)return;
    if(welcomeScreen)welcomeScreen.style.display='none';
    messages.push({role:'user',content:text});
    render();
    chatInput.value='';chatInput.style.height='auto';sendBtn.disabled=true;
    loading=true;
    showTyping();
    try{
        const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,mode})});
        const data=await res.json();
        removeTyping();
        if(!res.ok||!data.success)throw new Error(data.error||'Request failed');
        messages.push({role:'assistant',content:data.reply,model:data.model,provider:data.provider,mode:data.mode,fallback:data.fallback});
        render();saveSession();
    }catch(err){
        removeTyping();
        toast(err.message,'error');
        messages.push({role:'assistant',content:`⚠️ **Error:** ${err.message}`,model:'Error',provider:'system',mode});
        render();
    }finally{loading=false}
}

// ====== Render ======
function render(){
    chatArea.querySelectorAll('.msg,.typing-msg').forEach(e=>e.remove());
    if(!messages.length&&welcomeScreen){welcomeScreen.style.display='';return}
    if(welcomeScreen)welcomeScreen.style.display='none';
    messages.forEach(m=>chatArea.appendChild(makeMsgEl(m)));
    requestAnimationFrame(()=>{chatArea.scrollTop=chatArea.scrollHeight});
}

function makeMsgEl(m){
    const d=document.createElement('div');
    d.className=`msg ${m.role}`;
    if(m.role==='user'){
        d.innerHTML=`<div class="msg-avatar"><span class="material-symbols-rounded">person</span></div>
        <div class="msg-body"><div class="msg-head"><span class="msg-name">You</span></div>
        <div class="msg-text">${esc(m.content)}</div></div>`;
    }else{
        const mc=m.mode||'precise';
        const bl=m.fallback?`Fallback · ${m.model}`:(m.model||'AI');
        const bt=m.fallback?'fallback':mc;
        d.innerHTML=`<div class="msg-avatar"><span class="material-symbols-rounded">auto_awesome</span></div>
        <div class="msg-body"><div class="msg-head"><span class="msg-name">Max AI</span>
        <span class="mode-badge ${bt}">${bl}</span></div>
        <div class="msg-text">${fmt(m.content)}</div></div>`;
    }
    return d;
}

// ====== Format ======
function fmt(t){
    if(!t)return'';
    let f=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    f=f.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>`<pre><code>${c.trim()}</code></pre>`);
    f=f.replace(/`([^`]+)`/g,'<code>$1</code>');
    f=f.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    f=f.replace(/\*(.+?)\*/g,'<em>$1</em>');
    f=f.replace(/^[\-\*] (.+)$/gm,'<li>$1</li>');
    f=f.replace(/((?:<li>.*<\/li>\n?)+)/g,'<ul>$1</ul>');
    f=f.replace(/^\d+\. (.+)$/gm,'<li>$1</li>');
    f=f.replace(/\n/g,'<br>');
    return`<p>${f}</p>`;
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// ====== Typing ======
function showTyping(){
    const d=document.createElement('div');d.className='msg assistant typing-msg';
    d.innerHTML=`<div class="msg-avatar"><span class="material-symbols-rounded">auto_awesome</span></div>
    <div class="msg-body"><div class="msg-head"><span class="msg-name">Max AI</span></div>
    <div class="typing-dots"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div></div>`;
    chatArea.appendChild(d);
    requestAnimationFrame(()=>{chatArea.scrollTop=chatArea.scrollHeight});
}
function removeTyping(){chatArea.querySelector('.typing-msg')?.remove()}

// ====== Sessions ======
function saveSession(){
    if(!messages.length)return;
    if(!sessionId)sessionId='s_'+Date.now();
    const first=messages.find(m=>m.role==='user');
    const title=first?first.content.substring(0,45):'Chat';
    const idx=sessions.findIndex(s=>s.id===sessionId);
    const obj={id:sessionId,title,messages,ts:Date.now()};
    if(idx>=0)sessions[idx]=obj;else sessions.unshift(obj);
    if(sessions.length>20)sessions=sessions.slice(0,20);
    localStorage.setItem('maxai_s',JSON.stringify(sessions));
    renderHistory();
}
function loadSession(id){
    const s=sessions.find(x=>x.id===id);
    if(!s)return;
    sessionId=s.id;messages=[...s.messages];render();renderHistory();toggleSidebar(false);
}
function newChat(){sessionId=null;messages=[];render();chatInput.focus();toggleSidebar(false)}
function renderHistory(){
    historyList.innerHTML='';
    if(!sessions.length){historyList.innerHTML='<p class="history-empty">No conversations yet</p>';return}
    sessions.forEach(s=>{
        const el=document.createElement('div');
        el.className=`history-item${s.id===sessionId?' active':''}`;
        el.innerHTML=`<span class="material-symbols-rounded">chat_bubble_outline</span>${esc(s.title)}`;
        el.addEventListener('click',()=>loadSession(s.id));
        historyList.appendChild(el);
    });
}

// ====== Status ======
async function checkStatus(){
    const dot=apiIndicator.querySelector('.api-dot');
    const lbl=apiIndicator.querySelector('span');
    try{
        const r=await fetch('/api/status');const d=await r.json();
        const o=d.apis.openai==='configured',g=d.apis.gemini==='configured';
        if(o&&g){dot.className='api-dot online';lbl.textContent='All APIs active'}
        else if(o||g){dot.className='api-dot partial';lbl.textContent=`${o?'OpenAI':'Gemini'} active`}
        else{dot.className='api-dot offline';lbl.textContent='APIs not configured'}
    }catch{dot.className='api-dot offline';lbl.textContent='Server offline'}
}

// ====== Utils ======
function toggleSidebar(show){
    sidebar.classList.toggle('open',show);
    sidebarOverlay.classList.toggle('show',show);
    if(show)renderHistory();
}
function toast(msg,type='info'){
    const t=document.createElement('div');t.className=`toast ${type}`;
    const icons={error:'error',success:'check_circle',info:'info'};
    t.innerHTML=`<span class="material-symbols-rounded" style="font-size:18px">${icons[type]||'info'}</span>${msg}`;
    toastBox.appendChild(t);setTimeout(()=>t.remove(),4000);
}

init();
})();
