/**
 * NoteBound AI - Vanilla JavaScript Application Controller
 * Handles user authentication, per-user notes management, grounded Q&A,
 * evidence inspection, interactive quiz generation & grading, and analytics.
 */

import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup } from 'firebase/auth';

const SESSION_TOKEN_KEY = 'notebound-session-token';


// ----------------------------------------------------
// Language mode: English, Hindi and Hinglish
// UI translations are applied to static and dynamically-rendered labels.
// User-authored notes and AI-generated learning content are left untouched.
const NB_LANGUAGE_KEY = 'notebound-language';
let nbLanguage = 'en';
const NB_TRANSLATIONS = {
  hi: {
    'Language mode':'भाषा चुनें','Choose app language':'ऐप की भाषा चुनें',
    'Grounded AI Copilot • Verified Evidence • Adaptive Quizzes':'स्रोत-आधारित AI सहायक • सत्यापित प्रमाण • अनुकूल क्विज़',
    'Topic:':'विषय:','All Topics & Notes':'सभी विषय और नोट्स','API Docs':'API दस्तावेज़',
    'Upload Notes':'नोट्स अपलोड करें','Sign Out':'साइन आउट','Sign In to Workspace':'वर्कस्पेस में साइन इन करें',
    'Create Account':'अकाउंट बनाएं','Creating account...':'अकाउंट बनाया जा रहा है...',
    'Personal Study Workspace':'आपका निजी स्टडी वर्कस्पेस',
    'Upload your notes once. Master every concept across sessions.':'अपने नोट्स एक बार अपलोड करें। हर सेशन में कॉन्सेप्ट समझें।',
    'Sign in to access your private study library, grounded Q&A citations, quiz history, topic mastery breakdown, and personalized revision hints—automatically saved to your account.':'अपनी निजी स्टडी लाइब्रेरी, स्रोत-आधारित Q&A, क्विज़ हिस्ट्री, टॉपिक प्रोग्रेस और पर्सनल रिविज़न टिप्स के लिए साइन इन करें।',
    'Restoring your NoteBound AI workspace...':'आपका NoteBound AI वर्कस्पेस खोला जा रहा है...',
    'Accessibility':'सुलभता','Accessibility Mode':'सुलभता मोड',
    'NOTBOUND AI · INCLUSIVE LEARNING':'NOTBOUND AI · सभी के लिए सीखना',
    'Smart Audio Navigation':'स्मार्ट ऑडियो नेविगेशन',
    'Listen, navigate and study with less visual effort.':'कम स्क्रीन देख कर सुनें, नेविगेट करें और पढ़ें।',
    'Accessibility tools are ready.':'सुलभता टूल तैयार हैं।',
    'Close accessibility controls':'सुलभता सेटिंग बंद करें',
    '▶ Read current page':'▶ मौजूदा पेज पढ़ें','■ Stop speech':'■ आवाज़ रोकें',
    '🎙 Start voice commands':'🎙 वॉइस कमांड शुरू करें','■ Stop voice commands':'■ वॉइस कमांड रोकें',
    '＋ Upload notes':'＋ नोट्स अपलोड करें','Speech speed':'बोलने की गति','Text size':'टेक्स्ट का आकार',
    'Speak on hover / focus':'होवर / फोकस पर बोलें','High contrast mode':'हाई-कॉन्ट्रास्ट मोड',
    'Voice commands:':'वॉइस कमांड:','Voice input requires a supported browser and microphone permission. You can always use Tab, Shift+Tab, Enter and Space without a mouse.':'वॉइस इनपुट के लिए सपोर्टेड ब्राउज़र और माइक की अनुमति चाहिए। माउस के बिना Tab, Shift+Tab, Enter और Space भी इस्तेमाल कर सकते हैं।',
    'Dashboard':'डैशबोर्ड','Study Notes':'स्टडी नोट्स','Quizzes':'क्विज़','Ask AI':'AI से पूछें',
    'Study Notes Library':'स्टडी नोट्स लाइब्रेरी','AI Quizzes':'AI क्विज़',
    'Toggle dark and light mode':'डार्क और लाइट मोड बदलें','Switch between Dark and Light mode':'डार्क और लाइट मोड के बीच बदलें',
    'Upload study notes':'स्टडी नोट्स अपलोड करें','Sign out of NoteBound AI':'NoteBound AI से साइन आउट करें',
    'Please enter your full name (at least 2 characters).':'कृपया अपना पूरा नाम दर्ज करें (कम से कम 2 अक्षर)।',
    'Password must be at least 6 characters long.':'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।',
    'Passwords do not match. Please double-check and try again.':'पासवर्ड मेल नहीं खाते। कृपया दोबारा जांचें।',
    'Account created! Welcome to NoteBound AI,':'अकाउंट बन गया! NoteBound AI में आपका स्वागत है,',
    'Welcome back,':'वापस स्वागत है,','Reading started. Use Stop speech to stop.':'पढ़ना शुरू हुआ। रोकने के लिए आवाज़ रोकें दबाएं।',
    'Finished reading.':'पढ़ना पूरा हुआ।','Speech stopped.':'आवाज़ रोक दी गई।',
    'There is no readable content on this screen yet.':'इस स्क्रीन पर अभी पढ़ने योग्य कंटेंट नहीं है।',
    'High contrast enabled.':'हाई-कॉन्ट्रास्ट मोड चालू है।','High contrast disabled.':'हाई-कॉन्ट्रास्ट मोड बंद है।',
    'Speak on hover and keyboard focus enabled.':'होवर और कीबोर्ड फोकस पर बोलना चालू है।','Speak on hover and keyboard focus disabled.':'होवर और कीबोर्ड फोकस पर बोलना बंद है।',
    'Voice commands stopped.':'वॉइस कमांड बंद हैं।','Listening for one voice command. Try: read this page, upload notes, open dashboard, or ask a question.':'एक वॉइस कमांड सुन रहा है। कहें: पेज पढ़ो, नोट्स अपलोड करो, डैशबोर्ड खोलो या सवाल पूछो।',
    'Microphone permission was denied. Allow microphone access in browser settings to use voice commands.':'माइक की अनुमति नहीं मिली। वॉइस कमांड के लिए ब्राउज़र सेटिंग में माइक की अनुमति दें।',
    'Could not start microphone. Check browser permissions and try again.':'माइक शुरू नहीं हो सका। ब्राउज़र की अनुमति जांचकर फिर कोशिश करें।',
    'Voice commands are not supported by this browser. Use keyboard navigation or your device screen reader.':'इस ब्राउज़र में वॉइस कमांड सपोर्ट नहीं हैं। कीबोर्ड या डिवाइस स्क्रीन रीडर इस्तेमाल करें।',
    'Text to speech is not supported in this browser. Try a supported version of Chrome, Edge or Safari, or use your operating system screen reader.':'इस ब्राउज़र में टेक्स्ट-टू-स्पीच उपलब्ध नहीं है। Chrome, Edge या Safari का सपोर्टेड वर्ज़न या सिस्टम स्क्रीन रीडर इस्तेमाल करें।'
  },
  hinglish: {
    'Language mode':'Language mode','Choose app language':'App language choose karein',
    'Grounded AI Copilot • Verified Evidence • Adaptive Quizzes':'AI Study Copilot • Verified Evidence • Smart Quizzes',
    'Topic:':'Topic:','All Topics & Notes':'All Topics aur Notes','API Docs':'API Docs',
    'Upload Notes':'Notes Upload karo','Sign Out':'Sign Out','Sign In to Workspace':'Workspace mein Sign In karo',
    'Create Account':'Account banao','Creating account...':'Account ban raha hai...',
    'Personal Study Workspace':'Aapka Personal Study Workspace',
    'Upload your notes once. Master every concept across sessions.':'Notes ek baar upload karo. Har session mein concepts master karo.',
    'Sign in to access your private study library, grounded Q&A citations, quiz history, topic mastery breakdown, and personalized revision hints—automatically saved to your account.':'Apni private study library, source-based Q&A, quiz history, topic progress aur personalized revision hints ke liye sign in karo.',
    'Restoring your NoteBound AI workspace...':'Aapka NoteBound AI workspace load ho raha hai...',
    'Accessibility':'Accessibility','Accessibility Mode':'Accessibility Mode',
    'NOTBOUND AI · INCLUSIVE LEARNING':'NOTBOUND AI · Learning sabke liye',
    'Smart Audio Navigation':'Smart Audio Navigation',
    'Listen, navigate and study with less visual effort.':'Kam screen dekho, suno, navigate karo aur study karo.',
    'Accessibility tools are ready.':'Accessibility tools ready hain.',
    'Close accessibility controls':'Accessibility controls band karo',
    '▶ Read current page':'▶ Current page padho','■ Stop speech':'■ Speech roko',
    '🎙 Start voice commands':'🎙 Voice commands start karo','■ Stop voice commands':'■ Voice commands roko',
    '＋ Upload notes':'＋ Notes upload karo','Speech speed':'Speech speed','Text size':'Text size',
    'Speak on hover / focus':'Hover / focus par bolna','High contrast mode':'High contrast mode',
    'Voice commands:':'Voice commands:','Voice input requires a supported browser and microphone permission. You can always use Tab, Shift+Tab, Enter and Space without a mouse.':'Voice input ke liye supported browser aur mic permission chahiye. Mouse ke bina Tab, Shift+Tab, Enter aur Space bhi use kar sakte ho.',
    'Dashboard':'Dashboard','Study Notes':'Study Notes','Quizzes':'Quizzes','Ask AI':'AI se poochho',
    'Study Notes Library':'Study Notes Library','AI Quizzes':'AI Quizzes',
    'Toggle dark and light mode':'Dark aur light mode badlo','Switch between Dark and Light mode':'Dark aur Light mode ke beech switch karo',
    'Upload study notes':'Study notes upload karo','Sign out of NoteBound AI':'NoteBound AI se sign out karo',
    'Please enter your full name (at least 2 characters).':'Apna full name daalo (kam se kam 2 characters).',
    'Password must be at least 6 characters long.':'Password kam se kam 6 characters ka hona chahiye.',
    'Passwords do not match. Please double-check and try again.':'Passwords match nahi kar rahe. Dobara check karo.',
    'Account created! Welcome to NoteBound AI,':'Account ban gaya! NoteBound AI mein welcome,',
    'Welcome back,':'Welcome back,','Reading started. Use Stop speech to stop.':'Reading start ho gayi. Rokne ke liye Stop Speech dabao.',
    'Finished reading.':'Reading complete ho gayi.','Speech stopped.':'Speech rok di gayi.',
    'There is no readable content on this screen yet.':'Is screen par abhi readable content nahi hai.',
    'High contrast enabled.':'High contrast on hai.','High contrast disabled.':'High contrast off hai.',
    'Speak on hover and keyboard focus enabled.':'Hover aur keyboard focus par bolna on hai.','Speak on hover and keyboard focus disabled.':'Hover aur keyboard focus par bolna off hai.',
    'Voice commands stopped.':'Voice commands stop ho gaye.','Listening for one voice command. Try: read this page, upload notes, open dashboard, or ask a question.':'Ek voice command sun raha hoon. Bolo: page padho, notes upload karo, dashboard kholo ya question poochho.',
    'Microphone permission was denied. Allow microphone access in browser settings to use voice commands.':'Mic permission nahi mili. Voice commands ke liye browser settings mein mic allow karo.',
    'Could not start microphone. Check browser permissions and try again.':'Mic start nahi hua. Browser permissions check karke try karo.',
    'Voice commands are not supported by this browser. Use keyboard navigation or your device screen reader.':'Is browser mein voice commands supported nahi hain. Keyboard navigation ya device screen reader use karo.',
    'Text to speech is not supported in this browser. Try a supported version of Chrome, Edge or Safari, or use your operating system screen reader.':'Is browser mein text-to-speech supported nahi hai. Chrome, Edge, Safari ka supported version ya system screen reader use karo.'
  }
};
const nbOriginalText = new WeakMap();
const nbOriginalAttrs = new WeakMap();
function nbTranslationFor(text, lang) {
  const dict = NB_TRANSLATIONS[lang] || {};
  if (dict[text] !== undefined) return dict[text];
  for (const [en, translated] of Object.entries(dict)) if (translated === text) return en;
  return text;
}
function nbApplyLanguage(root = document) {
  const lang = nbLanguage;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim() || node.parentElement?.closest('script,style,textarea,input,option[data-no-translate],.user-content,[contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) {
    if (!nbOriginalText.has(node)) nbOriginalText.set(node, node.nodeValue);
    const original = nbOriginalText.get(node).trim();
    const translated = nbTranslationFor(original, lang);
    if (translated !== original) {
      const leading = node.nodeValue.match(/^\s*/)?.[0] || '';
      const trailing = node.nodeValue.match(/\s*$/)?.[0] || '';
      node.nodeValue = leading + translated + trailing;
    } else if (lang === 'en') node.nodeValue = nbOriginalText.get(node);
  }
  const attrs = ['placeholder','title','aria-label'];
  root.querySelectorAll?.('*').forEach(el => attrs.forEach(attr => {
    const value = el.getAttribute(attr); if (value == null) return;
    if (!nbOriginalAttrs.has(el)) nbOriginalAttrs.set(el, {});
    const saved = nbOriginalAttrs.get(el);
    if (!(attr in saved)) saved[attr] = value;
    const original = saved[attr];
    const translated = nbTranslationFor(original, lang);
    if (translated !== value) el.setAttribute(attr, translated);
  }));
  document.documentElement.lang = lang === 'hi' ? 'hi-IN' : lang === 'hinglish' ? 'en-IN' : 'en';
}
function nbSetLanguage(lang) {
  nbLanguage = ['en','hi','hinglish'].includes(lang) ? lang : 'en';
  try { localStorage.setItem(NB_LANGUAGE_KEY, nbLanguage); } catch (_) {}
  const select = document.getElementById('nbLanguageSelect');
  if (select) select.value = nbLanguage;
  nbApplyLanguage(document);
  const panel = document.getElementById('accessibilityPanel');
  if (panel) panel.setAttribute('lang', nbLanguage === 'hi' ? 'hi-IN' : 'en-IN');
  if (nbVoiceActive && nbRecognition) { stopRecognition(); }
}
function nbInitLanguageMode() {
  try { nbLanguage = localStorage.getItem(NB_LANGUAGE_KEY) || 'en'; } catch (_) { nbLanguage = 'en'; }
  const select = document.getElementById('nbLanguageSelect');
  if (select) {
    select.value = nbLanguage;
    select.addEventListener('change', () => nbSetLanguage(select.value));
  }
  nbApplyLanguage(document);
  // Re-translate interface fragments rendered after API calls, tab changes, and modal opens.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const n = record.target;
        if (!n.parentElement?.closest('script,style,textarea,input,option[data-no-translate],.user-content,[contenteditable="true"]')) {
          const current = n.nodeValue || '';
          // Always translate from the saved source text, never from the already
          // translated DOM text. This prevents MutationObserver translation loops
          // that can freeze the entire app after switching languages.
          if (!nbOriginalText.has(n)) nbOriginalText.set(n, current);
          const original = nbOriginalText.get(n) || '';
          const translated = nbTranslationFor(original.trim(), nbLanguage);
          if (translated !== current.trim()) {
            const leading = current.match(/^\\s*/)?.[0] || '';
            const trailing = current.match(/\\s*$/)?.[0] || '';
            n.nodeValue = leading + translated + trailing;
          }
        }
      }
      if (record.type === 'childList') record.addedNodes.forEach(n => {
        if (n.nodeType === Node.ELEMENT_NODE) nbApplyLanguage(n);
        else if (n.nodeType === Node.TEXT_NODE && n.parentElement && !nbOriginalText.has(n)) {
          nbOriginalText.set(n, n.nodeValue);
          const t = nbTranslationFor(n.nodeValue.trim(), nbLanguage);
          if (t !== n.nodeValue.trim()) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), t);
        }
      });
    }
  });
  observer.observe(document.body, {childList:true, subtree:true, characterData:true, characterDataOldValue:true});
}

// Global state
const state = {
  user: null,
  token: '',
  authMode: 'login',
  activeTab: 'dashboard',
  notes: [],
  qaHistory: [],
  selectedTopic: 'all',
  selectedNoteId: null,
  activeQuiz: null,
  quizAnswers: {},
  quizResult: null,
  dashboardData: null,
  inspectedEvidence: null,
  isGeneratingQuiz: false,
  isAskingQuestion: false,
  isUploadingNote: false,
  activeModal: null,
};

// DOM ready initialization
document.addEventListener('DOMContentLoaded', () => {
  nbInitLanguageMode();
  initTheme();
  initEventListeners();
  setupAccessibilityMode();
  bootstrapAuthSession();
});

function initTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  syncThemeToggleUI(isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  try {
    const mode = isDark ? 'dark' : 'light';
    localStorage.setItem('notebound-theme', mode);
    localStorage.setItem('gemmastudy-theme', mode);
  } catch (e) {}
  syncThemeToggleUI(isDark);
}

function syncThemeToggleUI(isDark) {
  const btn = document.getElementById('themeToggleBtn');
  const thumb = document.getElementById('themeToggleThumb');
  if (btn) {
    btn.setAttribute('aria-checked', String(isDark));
  }
  if (thumb) {
    if (isDark) {
      thumb.classList.add('translate-x-6', 'bg-indigo-600/25', 'border-indigo-500/50');
      thumb.classList.remove('translate-x-0', 'bg-amber-500/20', 'border-amber-500/50');
    } else {
      thumb.classList.remove('translate-x-6', 'bg-indigo-600/25', 'border-indigo-500/50');
      thumb.classList.add('translate-x-0', 'bg-amber-500/20', 'border-amber-500/50');
    }
  }
}

// ----------------------------------------------------
// Authenticated Fetch Wrapper & Session Lifecycle
// ----------------------------------------------------

function getStoredToken() {
  if (state.token) return state.token;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveSessionToken(token) {
  state.token = token || '';
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {}
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/register')) {
    clearUserSessionUI();
  }

  return res;
}

async function bootstrapAuthSession() {
  const loader = document.getElementById('authCheckingLoader');
  try {
    const token = getStoredToken();
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        state.user = data.user;
        if (token) state.token = token;
        if (loader) loader.classList.add('hidden');
        await enterAuthenticatedWorkspace();
        return;
      }
    }
  } catch (err) {
    console.warn('Session check failed:', err);
  }

  saveSessionToken('');
  if (loader) loader.classList.add('hidden');
  showAuthView('login');
}

function getInitials(name, email) {
  const src = (name || email || 'U').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

async function enterAuthenticatedWorkspace() {
  const authView = document.getElementById('authView');
  const workspace = document.getElementById('appWorkspace');
  const headerControls = document.getElementById('headerAuthControls');
  const globalTopicWrapper = document.getElementById('globalTopicWrapper');

  if (authView) authView.classList.add('hidden');
  if (workspace) workspace.classList.remove('hidden');
  if (headerControls) {
    headerControls.classList.remove('hidden');
    headerControls.classList.add('flex');
  }
  if (globalTopicWrapper) {
    globalTopicWrapper.classList.remove('hidden');
    globalTopicWrapper.classList.add('md:flex');
  }

  if (state.user) {
    const nameEl = document.getElementById('userDisplayName');
    const emailEl = document.getElementById('userDisplayEmail');
    const avatarEl = document.getElementById('userAvatarInitials');
    const subtitleEl = document.getElementById('welcomeUserSubtitle');

    if (nameEl) nameEl.textContent = state.user.full_name;
    if (emailEl) emailEl.textContent = state.user.email;
    if (avatarEl) {
      avatarEl.textContent = getInitials(state.user.full_name, state.user.email);
    }
    if (subtitleEl) {
      subtitleEl.textContent = `${state.user.full_name}'s Study Workspace`;
    }
  }

  switchTab('dashboard', false);
  await loadUserData();
}

function clearUserSessionUI() {
  state.user = null;
  saveSessionToken('');
  state.notes = [];
  state.qaHistory = [];
  state.selectedTopic = 'all';
  state.activeQuiz = null;
  state.quizAnswers = {};
  state.quizResult = null;
  state.dashboardData = null;

  // Reset transient DOM containers so another user never sees stale content
  const qaAnswerContainer = document.getElementById('qaAnswerContainer');
  if (qaAnswerContainer) qaAnswerContainer.classList.add('hidden');
  const activeQuizCard = document.getElementById('activeQuizCard');
  if (activeQuizCard) activeQuizCard.classList.add('hidden');
  const quizSummaryBox = document.getElementById('quizSummaryBox');
  if (quizSummaryBox) {
    quizSummaryBox.classList.add('hidden');
    quizSummaryBox.innerHTML = '';
  }
  closeEvidenceInspector();
  if (state.activeModal) closeModal(state.activeModal);

  const workspace = document.getElementById('appWorkspace');
  const headerControls = document.getElementById('headerAuthControls');
  const globalTopicWrapper = document.getElementById('globalTopicWrapper');

  if (workspace) workspace.classList.add('hidden');
  if (headerControls) {
    headerControls.classList.add('hidden');
    headerControls.classList.remove('flex');
  }
  if (globalTopicWrapper) {
    globalTopicWrapper.classList.add('hidden');
    globalTopicWrapper.classList.remove('md:flex');
  }

  showAuthView('login');
}

function showAuthView(mode = 'login') {
  state.authMode = mode;
  const authView = document.getElementById('authView');
  if (authView) authView.classList.remove('hidden');

  const tabLogin = document.getElementById('authTabLogin');
  const tabRegister = document.getElementById('authTabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const heading = document.getElementById('authCardHeading');
  const subheading = document.getElementById('authCardSubheading');
  const errBox = document.getElementById('authErrorBox');

  if (errBox) {
    errBox.classList.add('hidden');
    errBox.textContent = '';
  }

  if (mode === 'register') {
    if (tabRegister) {
      tabRegister.classList.add('bg-indigo-600', 'text-white');
      tabRegister.classList.remove('text-zinc-400', 'hover:text-zinc-200');
    }
    if (tabLogin) {
      tabLogin.classList.remove('bg-indigo-600', 'text-white');
      tabLogin.classList.add('text-zinc-400', 'hover:text-zinc-200');
    }
    if (registerForm) registerForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
    if (heading) heading.textContent = 'Create your NoteBound AI account';
    if (subheading) {
      subheading.textContent =
        'Start with a clean personal library where your uploaded PDFs, quizzes, and mastery stay saved.';
    }
  } else {
    if (tabLogin) {
      tabLogin.classList.add('bg-indigo-600', 'text-white');
      tabLogin.classList.remove('text-zinc-400', 'hover:text-zinc-200');
    }
    if (tabRegister) {
      tabRegister.classList.remove('bg-indigo-600', 'text-white');
      tabRegister.classList.add('text-zinc-400', 'hover:text-zinc-200');
    }
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (heading) heading.textContent = 'Sign in to NoteBound AI';
    if (subheading) {
      subheading.textContent =
        'Enter your account credentials to load your personal study library.';
    }
  }
}

function setAuthError(message) {
  const errBox = document.getElementById('authErrorBox');
  if (!errBox) return;
  if (!message) {
    errBox.classList.add('hidden');
    errBox.textContent = '';
  } else {
    errBox.textContent = message;
    errBox.classList.remove('hidden');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  setAuthError('');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmitBtn');
  const label = document.getElementById('loginSubmitLabel');

  if (!email || !password) {
    setAuthError('Please enter both your email address and password.');
    return;
  }

  btn.disabled = true;
  label.textContent = 'Signing in...';

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || 'Invalid email or password.');
    }

    state.user = data.user;
    saveSessionToken(data.token);
    document.getElementById('loginPassword').value = '';
    showToast(`Welcome back, ${data.user.full_name}!`, 'success');
    await enterAuthenticatedWorkspace();
  } catch (err) {
    setAuthError(err.message || 'Sign-in failed.');
  } finally {
    btn.disabled = false;
    label.textContent = 'Sign In to Workspace';
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  setAuthError('');

  const fullName = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (fullName.length < 2) {
    setAuthError('Please enter your full name (at least 2 characters).');
    return;
  }
  if (password.length < 6) {
    setAuthError('Password must be at least 6 characters long.');
    return;
  }
  if (password !== confirmPassword) {
    setAuthError('Passwords do not match. Please double-check and try again.');
    return;
  }

  const btn = document.getElementById('registerSubmitBtn');
  const label = document.getElementById('registerSubmitLabel');
  btn.disabled = true;
  label.textContent = 'Creating account...';

  try {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || 'Could not create account.');
    }

    state.user = data.user;
    saveSessionToken(data.token);
    document.getElementById('registerForm').reset();
    showToast(`Account created! Welcome to NoteBound AI, ${data.user.full_name}.`, 'success');
    await enterAuthenticatedWorkspace();
  } catch (err) {
    setAuthError(err.message || 'Account registration failed.');
  } finally {
    btn.disabled = false;
    label.textContent = 'Create Account';
  }
}

async function handleGoogleSignIn() {
  setAuthError('');
  const btn = document.getElementById('googleSignInBtn');
  if (btn) btn.disabled = true;

  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await result.user.getIdToken();

    const res = await apiFetch('/api/auth/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || 'Google sign-in failed on server.');
    }

    state.user = data.user;
    saveSessionToken(data.token);
    showToast(`Signed in with Google as ${data.user.full_name}!`, 'success');
    await enterAuthenticatedWorkspace();
  } catch (err) {
    console.error('Google Sign-in error:', err);
    if (err && err.code !== 'auth/popup-closed-by-user') {
      setAuthError(err.message || 'Google sign-in failed. Please try again.');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout request error:', err);
  }
  clearUserSessionUI();
  showToast('Signed out of your workspace.', 'info');
}

async function loadUserData() {
  await Promise.all([fetchNotes(), fetchAnalytics(), fetchQaHistory()]);
}

// ----------------------------------------------------
// API Calls (Scoped to Authenticated User)
// ----------------------------------------------------

async function fetchNotes() {
  if (!state.user) return;
  try {
    const res = await apiFetch('/api/notes');
    if (!res.ok) throw new Error('Failed to load notes');
    state.notes = await res.json();
    renderTopicSelector();
    renderNotesList();
  } catch (err) {
    console.error('fetchNotes error:', err);
  }
}

async function fetchAnalytics() {
  if (!state.user) return;
  try {
    const res = await apiFetch('/api/analytics/dashboard');
    if (!res.ok) throw new Error('Failed to load analytics');
    state.dashboardData = await res.json();
    renderDashboard();
  } catch (err) {
    console.error('fetchAnalytics error:', err);
  }
}

async function fetchQaHistory() {
  if (!state.user) return;
  try {
    const res = await apiFetch('/api/qa/history');
    if (!res.ok) return;
    state.qaHistory = await res.json();
    renderQaHistory();
  } catch (err) {
    console.error('fetchQaHistory error:', err);
  }
}

// ----------------------------------------------------
// Event Listeners
// ----------------------------------------------------

function initEventListeners() {
  // Light / Dark Mode switch
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Auth mode tabs & forms
  const authTabLogin = document.getElementById('authTabLogin');
  const authTabRegister = document.getElementById('authTabRegister');
  if (authTabLogin) authTabLogin.addEventListener('click', () => showAuthView('login'));
  if (authTabRegister) authTabRegister.addEventListener('click', () => showAuthView('register'));

  const googleSignInBtn = document.getElementById('googleSignInBtn');
  if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);

  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

  const registerForm = document.getElementById('registerForm');
  if (registerForm) registerForm.addEventListener('submit', handleRegisterSubmit);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Show / Hide password buttons
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  });

  // Navigation tabs
  document.querySelectorAll('[data-tab-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-tab-target');
      switchTab(target);
    });
  });

  // Topic filter dropdown
  const topicFilter = document.getElementById('globalTopicSelect');
  if (topicFilter) {
    topicFilter.addEventListener('change', (e) => {
      state.selectedTopic = e.target.value;
      renderNotesList();
    });
  }

  // Grounded Q&A form
  const qaForm = document.getElementById('qaForm');
  if (qaForm) {
    qaForm.addEventListener('submit', handleAskQuestion);
  }

  // Sample prompt pills
  document.querySelectorAll('.sample-prompt-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const text = pill.textContent.trim();
      const input = document.getElementById('qaInput');
      if (input) {
        input.value = text;
        input.focus();
      }
    });
  });

  // Quiz generator form
  const quizForm = document.getElementById('quizGenForm');
  if (quizForm) {
    quizForm.addEventListener('submit', handleGenerateQuiz);
  }

  // Upload note form
  const uploadForm = document.getElementById('uploadFileForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', handleFileUpload);
  }

  // Paste note form
  const pasteForm = document.getElementById('pasteNoteForm');
  if (pasteForm) {
    pasteForm.addEventListener('submit', handlePasteNote);
  }

  // Modal triggers
  const openUploadBtn = document.getElementById('openUploadModalBtn');
  if (openUploadBtn) {
    openUploadBtn.addEventListener('click', () => openModal('uploadModal'));
  }

  const closeUploadBtn = document.getElementById('closeUploadModalBtn');
  if (closeUploadBtn) {
    closeUploadBtn.addEventListener('click', () => closeModal('uploadModal'));
  }

  // Modal switcher tabs (Upload File vs Paste Text)
  const tabUploadFile = document.getElementById('tabUploadFile');
  const tabPasteText = document.getElementById('tabPasteText');
  if (tabUploadFile && tabPasteText) {
    tabUploadFile.addEventListener('click', () => {
      tabUploadFile.classList.add('bg-indigo-600', 'text-white');
      tabUploadFile.classList.remove('text-zinc-400');
      tabPasteText.classList.remove('bg-indigo-600', 'text-white');
      tabPasteText.classList.add('text-zinc-400');
      document.getElementById('uploadFileSection').classList.remove('hidden');
      document.getElementById('pasteTextSection').classList.add('hidden');
    });

    tabPasteText.addEventListener('click', () => {
      tabPasteText.classList.add('bg-indigo-600', 'text-white');
      tabPasteText.classList.remove('text-zinc-400');
      tabUploadFile.classList.remove('bg-indigo-600', 'text-white');
      tabUploadFile.classList.add('text-zinc-400');
      document.getElementById('uploadFileSection').classList.add('hidden');
      document.getElementById('pasteTextSection').classList.remove('hidden');
    });
  }

  // Reseed samples button
  const reseedBtn = document.getElementById('reseedBtn');
  if (reseedBtn) {
    reseedBtn.addEventListener('click', handleReseed);
  }

  // Close evidence inspector
  const closeInspectorBtn = document.getElementById('closeInspectorBtn');
  if (closeInspectorBtn) {
    closeInspectorBtn.addEventListener('click', closeEvidenceInspector);
  }
}

function switchTab(tabId, refreshData = true) {
  state.activeTab = tabId;

  document.querySelectorAll('[data-tab-target]').forEach((btn) => {
    if (btn.getAttribute('data-tab-target') === tabId) {
      btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.remove('text-zinc-400', 'hover:text-zinc-200');
    } else {
      btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.add('text-zinc-400', 'hover:text-zinc-200');
    }
  });

  document.querySelectorAll('.tab-content-panel').forEach((panel) => {
    panel.classList.add('hidden');
  });

  const activePanel = document.getElementById(`tab-${tabId}`);
  if (activePanel) {
    activePanel.classList.remove('hidden');
  }

  if (refreshData && state.user) {
    if (tabId === 'dashboard') {
      fetchAnalytics();
    } else if (tabId === 'notes') {
      fetchNotes();
    } else if (tabId === 'qa') {
      fetchQaHistory();
    }
  }
}

// ----------------------------------------------------
// UI Renderers
// ----------------------------------------------------

function renderTopicSelector() {
  const topics = ['all', ...new Set(state.notes.map((n) => n.topic))];
  if (!topics.includes(state.selectedTopic)) {
    state.selectedTopic = 'all';
  }

  const select = document.getElementById('globalTopicSelect');
  const quizTopicSelect = document.getElementById('quizTopicSelect');
  const qaTopicSelect = document.getElementById('qaTopicSelect');

  const optionsHtml = topics
    .map((t) => {
      const label = t === 'all' ? 'All Topics & Notes' : escapeHtml(t);
      return `<option value="${escapeHtml(t)}">${label}</option>`;
    })
    .join('');

  if (select) {
    select.innerHTML = optionsHtml;
    select.value = state.selectedTopic;
  }
  if (quizTopicSelect) quizTopicSelect.innerHTML = optionsHtml;
  if (qaTopicSelect) qaTopicSelect.innerHTML = optionsHtml;
}

function renderNotesList() {
  const container = document.getElementById('notesListContainer');
  if (!container) return;

  const filtered =
    state.selectedTopic === 'all'
      ? state.notes
      : state.notes.filter((n) => n.topic === state.selectedTopic);

  if (filtered.length === 0) {
    const isCompletelyEmpty = state.notes.length === 0;
    container.innerHTML = `
      <div class="col-span-full p-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800">
        <svg class="w-12 h-12 mx-auto text-zinc-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <p class="text-zinc-200 font-semibold text-sm">
          ${isCompletelyEmpty ? 'Your personal study library is empty' : 'No notes match the selected topic'}
        </p>
        <p class="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
          ${
            isCompletelyEmpty
              ? 'Upload your PDF, Markdown, or text notes once—they remain permanently saved to your account so you never have to re-upload them.'
              : 'Select a different topic filter or add a new document to this topic.'
          }
        </p>
        <div class="mt-5 flex items-center justify-center flex-wrap gap-3">
          <button onclick="openModal('uploadModal')" type="button" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-2 cursor-pointer">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Upload or Paste Notes</span>
          </button>
          ${
            isCompletelyEmpty
              ? `<button onclick="handleReseed()" type="button" class="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition cursor-pointer">
                  Load Sample Study Notes
                </button>`
              : ''
          }
        </div>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (note) => `
    <div class="p-5 bg-zinc-900/60 rounded-xl border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between gap-3 mb-2">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">
            ${escapeHtml(note.file_type ? note.file_type.toUpperCase() : 'TXT')}
          </span>
          <span class="text-xs text-zinc-500">${new Date(note.created_at).toLocaleDateString()}</span>
        </div>
        <h3 class="font-semibold text-zinc-100 text-base mb-1 line-clamp-1">${escapeHtml(note.title)}</h3>
        <p class="text-xs text-indigo-300 mb-3 line-clamp-1 font-mono">${escapeHtml(note.topic)}</p>
        <div class="flex items-center gap-4 text-xs text-zinc-400 mb-4">
          <span>${Number(note.word_count || 0).toLocaleString()} words</span>
          <span>•</span>
          <span>${Number(note.char_count || 0).toLocaleString()} chars</span>
        </div>
      </div>
      <div class="flex items-center justify-between pt-3 border-t border-zinc-800/80 gap-2">
        <button onclick="viewNoteDetail(${note.id})" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
          <span>Read &amp; Inspect</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
        <button onclick="deleteNote(${note.id})" class="text-xs text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/30 transition cursor-pointer" title="Delete note">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

function renderDashboard() {
  const d = state.dashboardData;
  if (!d) return;

  const totalNotesEl = document.getElementById('statTotalNotes');
  const totalQuizzesEl = document.getElementById('statTotalQuizzes');
  const avgAccuracyEl = document.getElementById('statAvgAccuracy');

  if (totalNotesEl) totalNotesEl.textContent = d.total_notes;
  if (totalQuizzesEl) totalQuizzesEl.textContent = d.total_quizzes_taken;
  if (avgAccuracyEl) avgAccuracyEl.textContent = `${d.overall_accuracy}%`;

  const masteryContainer = document.getElementById('topicMasteryContainer');
  if (masteryContainer) {
    if (d.topic_mastery.length === 0) {
      if (d.total_notes === 0) {
        masteryContainer.innerHTML = `
          <div class="col-span-full p-5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-zinc-200">No study notes in your library yet</p>
              <p class="text-xs text-zinc-400 mt-0.5">Upload a PDF/TXT document or load sample study notes to start tracking topic mastery.</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="openModal('uploadModal')" type="button" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer">Upload Notes</button>
              <button onclick="handleReseed()" type="button" class="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-semibold rounded-lg transition cursor-pointer">Load Samples</button>
            </div>
          </div>`;
      } else {
        masteryContainer.innerHTML = `<p class="col-span-full text-sm text-zinc-500 py-3">No quiz attempts yet. Take a quiz to see topic mastery tracking.</p>`;
      }
    } else {
      masteryContainer.innerHTML = d.topic_mastery
        .map((tm) => {
          const badgeColor =
            tm.avg_score >= 85
              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
              : tm.avg_score >= 70
                ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                : 'bg-amber-950 text-amber-400 border-amber-800';
          return `
          <div class="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2 gap-2">
                <span class="text-sm font-semibold text-zinc-200 line-clamp-1">${escapeHtml(tm.topic)}</span>
                <span class="px-2 py-0.5 rounded text-xs border font-medium shrink-0 ${badgeColor}">${escapeHtml(tm.mastery_level)}</span>
              </div>
              <div class="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-2">
                <div class="bg-indigo-500 h-full rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(0, Number(tm.avg_score)))}%"></div>
              </div>
              <div class="flex justify-between text-xs text-zinc-400 mb-3">
                <span>Accuracy: ${tm.avg_score}%</span>
                <span>${tm.attempts} attempt${tm.attempts !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <p class="text-xs text-zinc-400 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">${escapeHtml(tm.recommendation)}</p>
          </div>
        `;
        })
        .join('');
    }
  }

  const recsContainer = document.getElementById('adaptiveRecsContainer');
  if (recsContainer) {
    recsContainer.innerHTML = d.adaptive_recommendations
      .map(
        (r) => `
      <div class="flex items-start gap-3 p-3.5 bg-zinc-900/40 rounded-xl border border-zinc-800/80">
        <div class="p-1.5 rounded-lg bg-indigo-950 text-indigo-400 mt-0.5 border border-indigo-800/60 shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
        </div>
        <p class="text-xs text-zinc-300 leading-relaxed">${escapeHtml(r)}</p>
      </div>
    `
      )
      .join('');
  }

  const recentTable = document.getElementById('recentAttemptsList');
  if (recentTable) {
    if (d.recent_attempts.length === 0) {
      recentTable.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-sm text-zinc-500">No quiz attempts recorded in your account yet.</td></tr>`;
    } else {
      recentTable.innerHTML = d.recent_attempts
        .map(
          (att) => `
        <tr class="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition text-sm">
          <td class="py-3 px-4 font-medium text-zinc-200">${escapeHtml(att.quiz_title)}</td>
          <td class="py-3 px-4 text-xs text-indigo-300 font-mono">${escapeHtml(att.topic)}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${att.score_percentage >= 70 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-amber-950 text-amber-400 border border-amber-800/60'}">
              ${att.score} / ${att.total_questions} (${att.score_percentage}%)
            </span>
          </td>
          <td class="py-3 px-4 text-xs text-zinc-400">${new Date(att.completed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="reviewAttempt(${att.attempt_id})" class="text-xs font-medium text-indigo-400 hover:text-indigo-300 cursor-pointer">Review</button>
          </td>
        </tr>
      `
        )
        .join('');
    }
  }
}

// ----------------------------------------------------
// Grounded Q&A & History Handler
// ----------------------------------------------------

async function handleAskQuestion(e) {
  e.preventDefault();
  const input = document.getElementById('qaInput');
  const question = input.value.trim();
  if (!question) return;

  const topicSelect = document.getElementById('qaTopicSelect');
  const topic = topicSelect && topicSelect.value !== 'all' ? topicSelect.value : null;

  const submitBtn = document.getElementById('qaSubmitBtn');
  const loadingIndicator = document.getElementById('qaLoadingIndicator');
  const answerContainer = document.getElementById('qaAnswerContainer');

  state.isAskingQuestion = true;
  submitBtn.disabled = true;
  loadingIndicator.classList.remove('hidden');
  answerContainer.classList.add('hidden');

  try {
    const res = await apiFetch('/api/qa/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, topic }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to get answer');
    }

    const data = await res.json();
    renderAnswerResponse(data);
    fetchQaHistory();
  } catch (err) {
    console.error('QA Error:', err);
    showToast(err.message || 'Error processing question', 'error');
  } finally {
    state.isAskingQuestion = false;
    submitBtn.disabled = false;
    loadingIndicator.classList.add('hidden');
  }
}

function renderAnswerResponse(data) {
  const answerContainer = document.getElementById('qaAnswerContainer');
  const answerStatusBadge = document.getElementById('answerStatusBadge');
  const answerContent = document.getElementById('answerContent');
  const answerEvidenceList = document.getElementById('answerEvidenceList');
  const answerModelBadge = document.getElementById('answerModelBadge');

  if (!answerContainer) return;

  answerContainer.classList.remove('hidden');

  if (data.is_supported) {
    answerStatusBadge.className =
      'px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5';
    answerStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Grounded in Note Evidence (${Math.round(data.confidence * 100)}% Confidence)`;
  } else {
    answerStatusBadge.className =
      'px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1.5';
    answerStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Insufficient Evidence in Notes`;
  }

  if (answerModelBadge) {
    answerModelBadge.textContent = data.model_used;
  }

  answerContent.innerHTML = formatAnswerText(data.answer);

  if (data.evidence_list && data.evidence_list.length > 0) {
    answerEvidenceList.innerHTML = `
      <div class="mt-4 pt-4 border-t border-zinc-800/80">
        <h4 class="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
          <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          Verified Evidence Quotations (${data.evidence_list.length})
        </h4>
        <div class="space-y-2.5">
          ${data.evidence_list
            .map(
              (ev, idx) => `
            <div class="p-3 bg-zinc-950/70 rounded-lg border border-zinc-800/90 hover:border-indigo-600/50 transition">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-indigo-400">${escapeHtml(ev.note_title)}</span>
                  ${ev.line_number > 0 ? `<span class="text-[11px] text-zinc-500 font-mono">Line ${ev.line_number}</span>` : ''}
                </div>
                <span class="text-[11px] px-2 py-0.5 rounded font-mono ${ev.verified ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-zinc-800 text-zinc-400'}">
                  ${ev.verified ? `${Math.round(ev.match_percentage)}% Match` : 'Unverified'}
                </span>
              </div>
              <p class="text-xs text-zinc-300 italic mb-2">"${escapeHtml(ev.quote)}"</p>
              <button onclick="inspectEvidenceByIndex(${idx})" class="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer">
                <span>Open in Evidence Inspector</span>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
    window.__currentEvidenceList = data.evidence_list;
  } else {
    answerEvidenceList.innerHTML = '';
  }
}

function renderQaHistory() {
  const container = document.getElementById('qaHistoryList');
  if (!container) return;

  if (!state.qaHistory || state.qaHistory.length === 0) {
    container.innerHTML = `<p class="text-xs text-zinc-500 py-3">No saved Q&amp;A history yet. Ask a question above to store grounded answers in your account.</p>`;
    return;
  }

  container.innerHTML = state.qaHistory
    .map(
      (item, idx) => `
      <div class="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 hover:border-zinc-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${item.is_supported ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-amber-950 text-amber-400 border-amber-800'}">
              ${item.is_supported ? 'Supported' : 'Insufficient Evidence'}
            </span>
            <span class="text-[11px] text-zinc-500">${new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            ${item.evidence_list && item.evidence_list.length > 0 ? `<span class="text-[11px] text-indigo-400 font-mono">${item.evidence_list.length} citation${item.evidence_list.length === 1 ? '' : 's'}</span>` : ''}
          </div>
          <p class="text-sm font-semibold text-zinc-200 truncate">${escapeHtml(item.question)}</p>
          <p class="text-xs text-zinc-400 line-clamp-1">${escapeHtml(item.answer)}</p>
        </div>
        <button
          type="button"
          onclick="restoreQaHistoryItem(${idx})"
          class="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-indigo-400 border border-zinc-800 rounded-lg text-xs font-medium shrink-0 transition cursor-pointer"
        >
          View Answer
        </button>
      </div>
    `
    )
    .join('');
}

function restoreQaHistoryItem(idx) {
  const item = state.qaHistory[idx];
  if (!item) return;
  const input = document.getElementById('qaInput');
  if (input) input.value = item.question;
  renderAnswerResponse(item);
  const answerContainer = document.getElementById('qaAnswerContainer');
  if (answerContainer) {
    answerContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function formatAnswerText(text) {
  return String(text || '')
    .split('\n\n')
    .map((p) => `<p class="mb-3 text-zinc-200 leading-relaxed text-sm">${escapeHtml(p)}</p>`)
    .join('');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----------------------------------------------------
// Evidence Inspector
// ----------------------------------------------------

function inspectEvidenceByIndex(index) {
  if (window.__currentEvidenceList && window.__currentEvidenceList[index]) {
    openEvidenceInspector(window.__currentEvidenceList[index]);
  }
}

function openEvidenceInspector(evidence) {
  state.inspectedEvidence = evidence;
  const drawer = document.getElementById('evidenceInspectorDrawer');
  if (!drawer) return;

  document.getElementById('inspectorQuote').textContent = `"${evidence.quote}"`;
  document.getElementById('inspectorNoteTitle').textContent = evidence.note_title;
  document.getElementById('inspectorSectionTitle').textContent =
    evidence.section_title || 'General';
  document.getElementById('inspectorLineNum').textContent =
    evidence.line_number > 0 ? `Line ${evidence.line_number}` : 'N/A';
  document.getElementById('inspectorMatchPct').textContent = `${Math.round(evidence.match_percentage)}% Match`;
  document.getElementById('inspectorStatus').textContent = evidence.status;

  const contextBox = document.getElementById('inspectorContextPassage');
  if (contextBox) {
    if (evidence.surrounding_passage) {
      const fullPassage = evidence.surrounding_passage;
      const q = evidence.quote;
      const idx = fullPassage.indexOf(q);
      if (idx !== -1) {
        const before = escapeHtml(fullPassage.slice(0, idx));
        const highlighted = `<mark class="bg-indigo-500/30 text-indigo-200 px-1 py-0.5 rounded font-semibold border-b border-indigo-400">${escapeHtml(q)}</mark>`;
        const after = escapeHtml(fullPassage.slice(idx + q.length));
        contextBox.innerHTML = `${before}${highlighted}${after}`;
      } else {
        contextBox.textContent = fullPassage;
      }
    } else {
      contextBox.textContent = 'Full note passage available in Note Reader.';
    }
  }

  drawer.classList.remove('translate-x-full');
}

function closeEvidenceInspector() {
  const drawer = document.getElementById('evidenceInspectorDrawer');
  if (drawer) {
    drawer.classList.add('translate-x-full');
  }
}

// ----------------------------------------------------
// AI Quiz Generator & Interactive Testing
// ----------------------------------------------------

async function handleGenerateQuiz(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const topicSelect = document.getElementById('quizTopicSelect');
  const countSelect = document.getElementById('quizCountSelect');
  const diffSelect = document.getElementById('quizDiffSelect');
  const customPromptInput = document.getElementById('quizCustomPrompt');

  const topic = topicSelect && topicSelect.value !== 'all' ? topicSelect.value : null;
  const num_questions = parseInt(countSelect.value, 10) || 3;
  const difficulty = diffSelect.value || 'Medium';
  const custom_prompt = customPromptInput ? customPromptInput.value.trim() : null;

  const btn = document.getElementById('generateQuizBtn');
  const loading = document.getElementById('quizLoadingIndicator');
  const activeQuizCard = document.getElementById('activeQuizCard');
  const summaryBox = document.getElementById('quizSummaryBox');

  btn.disabled = true;
  loading.classList.remove('hidden');
  activeQuizCard.classList.add('hidden');
  if (summaryBox) summaryBox.classList.add('hidden');

  try {
    const res = await apiFetch('/api/quizzes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        num_questions,
        difficulty,
        custom_prompt,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Quiz generation failed');
    }

    const quiz = await res.json();
    state.activeQuiz = quiz;
    state.quizAnswers = {};
    state.quizResult = null;
    renderActiveQuiz(quiz);
  } catch (err) {
    console.error('Quiz error:', err);
    showToast(err.message || 'Error generating quiz', 'error');
  } finally {
    btn.disabled = false;
    loading.classList.add('hidden');
  }
}

function renderActiveQuiz(quiz) {
  const card = document.getElementById('activeQuizCard');
  if (!card) return;

  card.classList.remove('hidden');
  document.getElementById('quizTitleHeader').textContent = quiz.title;
  document.getElementById('quizMetaHeader').textContent = `${quiz.topic} • ${quiz.difficulty} Difficulty • ${quiz.question_count} Questions`;

  const container = document.getElementById('quizQuestionsContainer');
  container.innerHTML = quiz.questions
    .map(
      (q, idx) => `
    <div class="p-5 bg-zinc-900/60 rounded-xl border border-zinc-800" id="question-card-${q.id}">
      <div class="flex items-center gap-2 mb-3">
        <span class="w-6 h-6 rounded-full bg-indigo-900/80 text-indigo-300 font-mono text-xs flex items-center justify-center font-bold shrink-0">
          ${idx + 1}
        </span>
        <h3 class="text-sm font-semibold text-zinc-100">${escapeHtml(q.question_text)}</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
        ${['A', 'B', 'C', 'D']
          .map(
            (optKey) => `
          <label class="flex items-start gap-3 p-3 bg-zinc-950/70 hover:bg-zinc-800/50 rounded-lg border border-zinc-800 cursor-pointer transition text-xs text-zinc-300" id="opt-label-${q.id}-${optKey}">
            <input type="radio" name="question-${q.id}" value="${optKey}" ${state.quizAnswers[q.id] === optKey ? 'checked' : ''} class="mt-0.5 text-indigo-600 focus:ring-indigo-500 bg-zinc-900 border-zinc-700" onchange="selectQuizOption(${q.id}, '${optKey}')">
            <span><strong class="text-indigo-400 font-mono mr-1">${optKey}.</strong> ${escapeHtml(q.options[optKey] || '')}</span>
          </label>
        `
          )
          .join('')}
      </div>
      <div id="explanation-box-${q.id}" class="mt-4 hidden"></div>
    </div>
  `
    )
    .join('');

  const submitContainer = document.getElementById('quizSubmitContainer');
  submitContainer.innerHTML = `
    <button onclick="submitActiveQuiz()" id="submitQuizBtn" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-md transition flex items-center gap-2 cursor-pointer">
      <span>Submit &amp; Score Assessment</span>
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    </button>
  `;
}

function selectQuizOption(questionId, option) {
  state.quizAnswers[questionId] = option;
}

async function submitActiveQuiz() {
  if (!state.activeQuiz) return;

  const answeredCount = Object.keys(state.quizAnswers).length;
  if (answeredCount === 0) {
    showToast('Please select at least one answer before submitting', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitQuizBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Grading Assessment...</span>`;
  }

  const answersPayload = state.activeQuiz.questions.map((q) => ({
    question_id: q.id,
    selected_option: state.quizAnswers[q.id] || '',
  }));

  try {
    const res = await apiFetch(`/api/quizzes/${state.activeQuiz.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quiz_id: state.activeQuiz.id,
        answers: answersPayload,
        time_taken_seconds: 45,
      }),
    });

    if (!res.ok) throw new Error('Failed to evaluate quiz');
    const result = await res.json();
    state.quizResult = result;
    renderQuizResults(result);
    fetchAnalytics();
  } catch (err) {
    console.error('Quiz submit error:', err);
    showToast(err.message || 'Error submitting quiz', 'error');
  }
}

function renderQuizResults(result) {
  result.results.forEach((r) => {
    const box = document.getElementById(`explanation-box-${r.question_id}`);
    if (box) {
      box.classList.remove('hidden');
      const isCorrect = r.is_correct;
      box.className = `mt-4 p-4 rounded-lg border text-xs ${isCorrect ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' : 'bg-red-950/40 border-red-800/80 text-red-300'}`;
      box.innerHTML = `
        <div class="flex items-center justify-between font-semibold mb-2">
          <span>${isCorrect ? '✓ Correct Answer' : `✗ Incorrect (Correct: ${escapeHtml(r.correct_option)})`}</span>
          <span class="text-[11px] font-mono opacity-80">${isCorrect ? '+1 Point' : '0 Points'}</span>
        </div>
        <p class="mb-2 text-zinc-200"><strong>Grounded Explanation:</strong> ${escapeHtml(r.explanation)}</p>
        ${
          r.quote_evidence
            ? `
          <div class="p-2.5 bg-zinc-950/70 rounded border border-zinc-800/80 my-2">
            <span class="text-[11px] font-semibold text-indigo-400 block mb-1">Source Note Quotation:</span>
            <p class="text-zinc-300 italic">"${escapeHtml(r.quote_evidence)}"</p>
          </div>
        `
            : ''
        }
        ${
          !isCorrect && r.revision_hint
            ? `
          <div class="mt-2 p-2 bg-amber-950/50 rounded border border-amber-800/60 text-amber-300">
            <strong>Targeted Revision Hint:</strong> ${escapeHtml(r.revision_hint)}
          </div>
        `
            : ''
        }
      `;
    }
  });

  const summaryBox = document.getElementById('quizSummaryBox');
  if (summaryBox) {
    summaryBox.classList.remove('hidden');
    summaryBox.innerHTML = `
      <div class="p-6 bg-gradient-to-r from-indigo-950/80 via-zinc-900 to-zinc-900 rounded-xl border border-indigo-800/80 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <span class="text-xs uppercase tracking-wider font-semibold text-indigo-400">Assessment Score</span>
          <h2 class="text-2xl font-bold text-white mt-1">${result.score} / ${result.total_questions} (${result.score_percentage}%)</h2>
          <p class="text-xs text-zinc-300 mt-1 max-w-xl">${escapeHtml(result.summary_feedback)}</p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick="handleGenerateQuiz(event)" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition cursor-pointer">
            Generate New Quiz
          </button>
        </div>
      </div>
    `;
    summaryBox.scrollIntoView({ behavior: 'smooth' });
  }

  const submitContainer = document.getElementById('quizSubmitContainer');
  if (submitContainer) {
    submitContainer.innerHTML = `<span class="text-xs text-zinc-500">Quiz scored &amp; saved to your account.</span>`;
  }
}

// ----------------------------------------------------
// Note Detail & Upload Handlers
// ----------------------------------------------------

function renderNoteVideoRecommendations(note) {
  const list = document.getElementById('noteReaderVideoList');
  const countLabel = document.getElementById('noteResourceCount');
  if (!list) return;

  const sections = Array.isArray(note.sections) ? note.sections : [];
  const normalize = (value) => String(value || '')
    .replace(/^\s*\d+[.)\-:]?\s*/, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const rawConcepts = [
    ...sections.map((section) => ({ title: normalize(section.title), content: normalize(section.content) })),
    { title: normalize(note.topic), content: normalize(note.summary || '') },
    { title: normalize(note.title), content: normalize(note.summary || '') },
  ];
  const seen = new Set();
  const concepts = rawConcepts.filter((item) => {
    const key = item.title.toLowerCase();
    if (!item.title || key.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  if (countLabel) countLabel.textContent = `${concepts.length} concept${concepts.length === 1 ? '' : 's'} · curated search links`;
  if (!concepts.length) {
    list.innerHTML = '<p class="text-sm text-zinc-400 rounded-lg border border-zinc-800 p-4">Add a topic or section headings to get concept-focused learning resources.</p>';
    return;
  }

  const makeSearch = (query, site = '') => `https://www.google.com/search?q=${encodeURIComponent(`${site ? `site:${site} ` : ''}${query}`.trim())}`;
  const makeYoutube = (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const linkClass = 'nb-resource-link';
  list.innerHTML = concepts.map((item, index) => {
    const concept = item.title;
    const context = note.topic && note.topic.toLowerCase() !== concept.toLowerCase() ? note.topic : '';
    const query = `${concept} ${context}`.trim();
    const sectionText = item.content || (sections.find((section) => normalize(section.title).toLowerCase() === concept.toLowerCase()) || {}).content || '';
    const preview = normalize(sectionText).slice(0, 360);
    const resources = [
      { label: 'YouTube videos', hint: 'Beginner-friendly explanations', icon: '▶', url: makeYoutube(`${query} explained for beginners`) , primary: true },
      { label: 'Hindi videos', hint: 'Hindi explanations', icon: '▶', url: makeYoutube(`${query} Hindi explanation`) },
      { label: 'Study material', hint: 'Notes and tutorials', icon: '▤', url: makeSearch(`${query} notes tutorial study material`) },
      { label: 'Practice questions', hint: 'Solved examples and exercises', icon: '✓', url: makeSearch(`${query} practice questions solved examples`) },
      { label: 'Diagrams & visuals', hint: 'Concept diagrams and mind maps', icon: '◇', url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${query} diagram concept map`)}` },
      { label: 'Khan Academy', hint: 'Search educational lessons', icon: '↗', url: makeSearch(`${query} tutorial`, 'khanacademy.org') },
    ];
    return `
      <details class="nb-resource-card" ${index === 0 ? 'open' : ''}>
        <summary class="nb-resource-summary">
          <span class="nb-resource-number">${index + 1}</span>
          <span class="nb-resource-title-wrap"><span class="nb-resource-title">${escapeHtml(concept)}</span><span class="nb-resource-subtitle">Videos, reading and practice resources</span></span>
          <span class="nb-resource-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="nb-resource-body">
          ${preview ? `<details class="nb-quick-revision"><summary>Quick revision from your notes</summary><p>${escapeHtml(preview)}${sectionText.length > 360 ? '…' : ''}</p></details>` : ''}
          <div class="nb-resource-grid">
            ${resources.map((resource) => `<a href="${resource.url}" target="_blank" rel="noopener noreferrer" class="${linkClass}${resource.primary ? ' is-primary' : ''}" aria-label="${resource.label} about ${escapeHtml(concept)}"><span class="nb-resource-icon" aria-hidden="true">${resource.icon}</span><span class="nb-resource-link-copy"><span>${resource.label}</span><small>${resource.hint}</small></span><span class="nb-resource-external" aria-hidden="true">↗</span></a>`).join('')}
          </div>
        </div>
      </details>`;
  }).join('');

  // Keep the resource panel compact: opening one concept closes the others.
  list.querySelectorAll('.nb-resource-card').forEach((card) => {
    card.addEventListener('toggle', () => {
      if (!card.open) return;
      list.querySelectorAll('.nb-resource-card').forEach((other) => {
        if (other !== card) other.open = false;
      });
    });
  });
}

async function viewNoteDetail(noteId) {
  try {
    const res = await apiFetch(`/api/notes/${noteId}`);
    if (!res.ok) throw new Error('Note not found');
    const note = await res.json();

    document.getElementById('noteReaderTitle').textContent = note.title;
    document.getElementById('noteReaderTopic').textContent = note.topic;
    document.getElementById('noteReaderStats').textContent = `${note.word_count} words • ${note.sections ? note.sections.length : 0} sections`;

    const sectionsContainer = document.getElementById('noteReaderSections');
    if (sectionsContainer && note.sections) {
      sectionsContainer.innerHTML = note.sections
        .map(
          (s) => `
        <div class="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 mb-3">
          <h4 class="text-sm font-semibold text-indigo-400 mb-2">${s.section_index}. ${escapeHtml(s.title)}</h4>
          <p class="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(s.content)}</p>
        </div>
      `
        )
        .join('');
    }

    renderNoteVideoRecommendations(note);
    openModal('noteReaderModal');
  } catch (err) {
    showToast('Failed to load note details', 'error');
  }
}

async function deleteNote(noteId) {
  try {
    const res = await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete note');
    showToast('Note deleted from your library', 'success');
    await fetchNotes();
    await fetchAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function reviewAttempt(attemptId) {
  try {
    const res = await apiFetch(`/api/quizzes/attempts/${attemptId}`);
    if (!res.ok) throw new Error('Failed to load quiz attempt');
    const attempt = await res.json();
    const quizRes = await apiFetch(`/api/quizzes/${attempt.quiz_id}`);
    if (quizRes.ok) {
      const quiz = await quizRes.json();
      state.activeQuiz = quiz;
      state.quizAnswers = {};
      attempt.results.forEach((r) => {
        state.quizAnswers[r.question_id] = r.selected_option;
      });
      switchTab('quizzes');
      renderActiveQuiz(quiz);
      renderQuizResults(attempt);
    }
  } catch (err) {
    showToast(err.message || 'Could not load quiz attempt', 'error');
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

async function handleFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('noteFileInput');
  const topicInput = document.getElementById('noteFileTopic');
  const titleInput = document.getElementById('noteFileTitle');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a .txt, .md, or .pdf file to upload', 'error');
    return;
  }

  const file = fileInput.files[0];
  const topicVal = topicInput.value.trim();
  const titleVal = titleInput.value.trim();

  const btn = document.getElementById('uploadFileSubmitBtn');
  const labelEl = document.getElementById('uploadFileSubmitLabel') || btn;
  btn.disabled = true;
  labelEl.textContent = 'Extracting text...';

  const CHUNK_THRESHOLD = 12 * 1024 * 1024; // 12 MB
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB raw

  try {
    if (file.size > CHUNK_THRESHOLD) {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      for (let idx = 0; idx < totalChunks; idx++) {
        const pct = Math.round(((idx + 1) / totalChunks) * 100);
        labelEl.textContent =
          idx + 1 === totalChunks ? 'Extracting text...' : `Uploading (${pct}%)...`;

        const slice = file.slice(idx * CHUNK_SIZE, Math.min(file.size, (idx + 1) * CHUNK_SIZE));
        const buf = await slice.arrayBuffer();
        const chunkBase64 = arrayBufferToBase64(buf);

        const res = await apiFetch('/api/notes/upload-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_id: uploadId,
            chunk_index: idx,
            total_chunks: totalChunks,
            chunk_base64: chunkBase64,
            filename: file.name,
            title: titleVal,
            topic: topicVal,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Upload failed');
        }
      }
    } else {
      const formData = new FormData();
      formData.append('file', file);
      if (topicVal) formData.append('topic', topicVal);
      if (titleVal) formData.append('title', titleVal);

      const res = await apiFetch('/api/notes/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
    }

    showToast('Document saved permanently to your library!', 'success');
    closeModal('uploadModal');
    fileInput.value = '';
    titleInput.value = '';
    topicInput.value = '';
    await fetchNotes();
    await fetchAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    labelEl.textContent = 'Upload & Process Document';
  }
}

async function handlePasteNote(e) {
  e.preventDefault();
  const titleInput = document.getElementById('pasteNoteTitle');
  const topicInput = document.getElementById('pasteNoteTopic');
  const contentInput = document.getElementById('pasteNoteContent');

  const title = titleInput.value.trim();
  const topic = topicInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !topic || !content) {
    showToast('Please fill out all fields', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, topic, content }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to save note');
    }

    showToast('Note saved to your library!', 'success');
    closeModal('uploadModal');
    titleInput.value = '';
    topicInput.value = '';
    contentInput.value = '';
    await fetchNotes();
    await fetchAnalytics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleReseed() {
  try {
    const res = await apiFetch('/api/notes/seed', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.message || 'Sample notes loaded into your library', 'success');
      await fetchNotes();
      await fetchAnalytics();
    } else {
      showToast(data.detail || 'Failed to load sample notes', 'error');
    }
  } catch (err) {
    showToast('Failed to load sample notes', 'error');
  }
}

// ----------------------------------------------------
// Modal Helpers
// ----------------------------------------------------

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    state.activeModal = modalId;
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    state.activeModal = null;
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor =
    type === 'error'
      ? 'bg-red-950 border-red-800 text-red-200'
      : type === 'success'
        ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
        : 'bg-indigo-950 border-indigo-800 text-indigo-200';

  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${bgColor}`;
  toast.textContent = message;

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Expose functions globally for inline onclick handlers
window.switchTab = switchTab;
window.viewNoteDetail = viewNoteDetail;
window.deleteNote = deleteNote;
window.openModal = openModal;
window.closeModal = closeModal;
window.inspectEvidenceByIndex = inspectEvidenceByIndex;
window.openEvidenceInspector = openEvidenceInspector;
window.closeEvidenceInspector = closeEvidenceInspector;
window.selectQuizOption = selectQuizOption;
window.submitActiveQuiz = submitActiveQuiz;
window.handleGenerateQuiz = handleGenerateQuiz;
window.reviewAttempt = reviewAttempt;
window.handleReseed = handleReseed;
window.restoreQaHistoryItem = restoreQaHistoryItem;


// ----------------------------------------------------
// Smart Audio Navigation / Accessibility Mode
// ----------------------------------------------------
const NB_ACCESS_PREF_KEY = 'notebound-accessibility-preferences';
let nbSpeechRate = 1;
let nbRecognition = null;
let nbLastAnnouncement = '';
let nbLastAnnouncementAt = 0;
let nbHoverEnabled = false;
let nbVoiceActive = false;

function setupAccessibilityMode() {
  const panel = document.getElementById('accessibilityPanel');
  const toggle = document.getElementById('accessibilityToggle');
  if (!panel || !toggle) return;
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(NB_ACCESS_PREF_KEY) || '{}'); } catch (_) {}
  const hover = document.getElementById('accessibilityHoverToggle');
  const contrast = document.getElementById('accessibilityContrastToggle');
  const speed = document.getElementById('accessibilitySpeed');
  const font = document.getElementById('accessibilityFontSize');
  if (hover) hover.checked = Boolean(prefs.hover);
  if (contrast) contrast.checked = Boolean(prefs.contrast);
  if (speed) speed.value = String(prefs.speed || 1);
  if (font) font.value = String(prefs.font || 100);
  nbSpeechRate = Number((speed && speed.value) || 1);
  nbHoverEnabled = Boolean(hover && hover.checked);
  setContrast(Boolean(contrast && contrast.checked), false);
  setFontScale(Number((font && font.value) || 100), false);
  updateAccessibilityValues();

  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    if (opening) announce('Smart Audio Navigation opened. Use the controls to listen, navigate or change accessibility settings.');
    else toggle.focus();
  });
  document.getElementById('accessibilityClose')?.addEventListener('click', () => {
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
  });
  document.getElementById('accessibilityReadPage')?.addEventListener('click', readCurrentPage);
  document.getElementById('accessibilityStopSpeech')?.addEventListener('click', stopSpeech);
  document.getElementById('accessibilityUploadBtn')?.addEventListener('click', () => {
    stopSpeech();
    const btn = document.getElementById('openUploadModalBtn');
    if (btn) btn.click(); else if (typeof openModal === 'function') openModal('uploadModal');
    announce('Upload notes dialog opened. Choose a text, Markdown or PDF file, then activate Upload and Process Document.');
  });
  document.getElementById('accessibilityVoiceBtn')?.addEventListener('click', toggleVoiceCommands);
  if (hover) hover.addEventListener('change', () => {
    nbHoverEnabled = hover.checked; saveAccessibilityPrefs();
    announce(nbHoverEnabled ? 'Speak on hover and keyboard focus enabled.' : 'Speak on hover and keyboard focus disabled.');
  });
  if (contrast) contrast.addEventListener('change', () => { setContrast(contrast.checked); saveAccessibilityPrefs(); announce(contrast.checked ? 'High contrast enabled.' : 'High contrast disabled.'); });
  if (speed) speed.addEventListener('input', () => { nbSpeechRate = Number(speed.value); updateAccessibilityValues(); saveAccessibilityPrefs(); });
  if (font) font.addEventListener('input', () => { setFontScale(Number(font.value)); saveAccessibilityPrefs(); });

  // Delegated announcements cover dynamically rendered controls too.
  document.addEventListener('pointerover', (event) => {
    if (!nbHoverEnabled || event.pointerType === 'touch') return;
    const target = event.target.closest('button,a,input,textarea,select,[role="button"],[role="tab"],[role="option"],[data-tab-target]');
    if (!target || target.closest('#accessibilityPanel') || target === document.activeElement) return;
    const related = event.relatedTarget;
    if (related && target.contains(related)) return;
    const label = getAccessibleDescription(target);
    if (label) announceDebounced(label);
  });
  document.addEventListener('focusin', (event) => {
    if (!nbHoverEnabled) return;
    const target = event.target.closest('button,a,input,textarea,select,[role="button"],[role="tab"],[role="option"],[data-tab-target]');
    if (!target || target.closest('#accessibilityPanel')) return;
    const label = getAccessibleDescription(target);
    if (label) announceDebounced(label);
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault(); toggle.click();
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'r') {
      event.preventDefault(); readCurrentPage();
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault(); stopSpeech();
    }
  });
}

function announce(message) {
  const status = document.getElementById('accessibilityStatus');
  const live = document.getElementById('accessibilityLiveRegion');
  if (status) status.textContent = message;
  if (live) { live.textContent = ''; window.setTimeout(() => { live.textContent = message; }, 30); }
}
function announceDebounced(message) {
  const now = Date.now();
  if (message === nbLastAnnouncement && now - nbLastAnnouncementAt < 1800) return;
  nbLastAnnouncement = message; nbLastAnnouncementAt = now;
  speakText(message, { interrupt: true, announceStatus: false });
}
function getAccessibleDescription(el) {
  if (!el) return '';
  const aria = el.getAttribute('aria-label') || el.getAttribute('title');
  const label = el.labels && el.labels.length ? Array.from(el.labels).map(x => x.textContent.trim()).join('. ') : '';
  let text = (aria || label || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (el instanceof HTMLInputElement) {
    if (el.type === 'file') text = `${text || 'Choose file'}. ${el.files?.length ? `Selected file ${el.files[0].name}` : 'No file selected'}`;
    else if (el.placeholder && !text) text = `${el.placeholder}`;
    if (el.type === 'checkbox' || el.type === 'radio') text += el.checked ? ', selected' : ', not selected';
  }
  if (!text) return '';
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  const type = el.getAttribute('type');
  const prefix = tag === 'a' ? 'Link' : (tag === 'button' || role === 'button') ? 'Button' : tag === 'select' ? 'Dropdown' : (tag === 'input' || tag === 'textarea') ? `${type === 'file' ? 'File upload' : 'Input field'}` : role === 'tab' ? 'Tab' : '';
  return `${prefix ? prefix + ': ' : ''}${text}`.slice(0, 260);
}
function speakText(text, options = {}) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    announce('Text to speech is not supported in this browser. Try a supported version of Chrome, Edge or Safari, or use your operating system screen reader.');
    return;
  }
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) { announce('There is no readable content on this screen yet.'); return; }
  if (options.interrupt !== false) window.speechSynthesis.cancel();
  // Chunk long documents at sentence boundaries to avoid browser utterance limits.
  const chunks = [];
  let remaining = clean;
  while (remaining.length > 0) {
    if (remaining.length <= 1800) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('. ', 1800);
    if (cut < 700) cut = remaining.lastIndexOf(' ', 1800);
    if (cut < 1) cut = 1800;
    chunks.push(remaining.slice(0, cut + 1)); remaining = remaining.slice(cut + 1).trim();
  }
  let index = 0;
  const speakNext = () => {
    if (index >= chunks.length) { announce('Finished reading.'); return; }
    const utterance = new SpeechSynthesisUtterance(chunks[index++]);
    utterance.lang = nbLanguage === 'hi' ? 'hi-IN' : nbLanguage === 'hinglish' ? 'en-IN' : 'en-US';
    utterance.rate = nbSpeechRate;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === navigator.language) || voices.find(v => v.lang.startsWith((navigator.language || 'en').split('-')[0]));
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => { if (index < chunks.length) speakNext(); else announce('Finished reading.'); };
    utterance.onerror = (event) => { if (event.error !== 'canceled' && event.error !== 'interrupted') announce('Speech playback stopped because the browser reported an error.'); };
    window.speechSynthesis.speak(utterance);
  };
  if (options.announceStatus !== false) announce('Reading started. Use Stop speech to stop.');
  speakNext();
}
function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  announce('Speech stopped.');
}
function readCurrentPage() {
  stopRecognition();
  const reader = document.getElementById('noteReaderModal');
  let text = '';
  if (reader && !reader.classList.contains('hidden')) {
    text = [document.getElementById('noteReaderTitle')?.textContent, document.getElementById('noteReaderTopic')?.textContent,
      document.getElementById('noteReaderStats')?.textContent, document.getElementById('noteReaderSections')?.innerText].filter(Boolean).join('. ');
  } else {
    const activeTab = document.querySelector('.tab-content-panel:not(.hidden)');
    const source = activeTab || document.querySelector('main') || document.body;
    const clone = source.cloneNode(true);
    clone.querySelectorAll('script,style,button,nav,header,footer,[aria-hidden="true"],.nb-access-panel,.nb-access-fab,input,textarea,select').forEach(el => el.remove());
    text = clone.innerText || clone.textContent || '';
  }
  speakText(text, { interrupt: true });
}
function setContrast(enabled, persist = true) {
  document.documentElement.classList.toggle('nb-high-contrast', enabled);
  const control = document.getElementById('accessibilityContrastToggle'); if (control) control.checked = enabled;
  if (persist) saveAccessibilityPrefs();
}
function setFontScale(percent, persist = true) {
  const scale = Math.max(1, Math.min(1.5, percent / 100));
  document.documentElement.style.setProperty('--nb-font-scale', String(scale));
  document.documentElement.classList.toggle('nb-large-text', scale > 1);
  const control = document.getElementById('accessibilityFontSize'); if (control) control.value = String(Math.round(scale * 100));
  updateAccessibilityValues();
  if (persist) saveAccessibilityPrefs();
}
function updateAccessibilityValues() {
  const speed = document.getElementById('accessibilitySpeed'); const font = document.getElementById('accessibilityFontSize');
  const speedValue = document.getElementById('accessibilitySpeedValue'); const fontValue = document.getElementById('accessibilityFontValue');
  if (speedValue && speed) speedValue.textContent = `${Number(speed.value).toFixed(1).replace('.0','')}×`;
  if (fontValue && font) fontValue.textContent = `${font.value}%`;
}
function saveAccessibilityPrefs() {
  try {
    localStorage.setItem(NB_ACCESS_PREF_KEY, JSON.stringify({
      hover: Boolean(document.getElementById('accessibilityHoverToggle')?.checked),
      contrast: Boolean(document.getElementById('accessibilityContrastToggle')?.checked),
      speed: Number(document.getElementById('accessibilitySpeed')?.value || 1),
      font: Number(document.getElementById('accessibilityFontSize')?.value || 100)
    }));
  } catch (_) {}
}
function toggleVoiceCommands() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { announce('Voice commands are not supported by this browser. Use keyboard navigation or your device screen reader.'); return; }
  if (nbVoiceActive) { stopRecognition(); announce('Voice commands stopped.'); return; }
  try {
    nbRecognition = new SpeechRecognition(); nbRecognition.lang = nbLanguage === 'hi' ? 'hi-IN' : nbLanguage === 'hinglish' ? 'en-IN' : 'en-US'; nbRecognition.interimResults = true; nbRecognition.continuous = false; nbVoiceActive = true;
    const btn = document.getElementById('accessibilityVoiceBtn'); if (btn) btn.textContent = '■ Stop voice commands';
    announce('Listening for one voice command. Try: read this page, upload notes, open dashboard, or ask a question.');
    nbRecognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) { announce(`I heard: ${result[0].transcript}`); return; }
      handleAccessibilityVoiceCommand(result[0].transcript.trim().toLowerCase());
    };
    nbRecognition.onerror = (event) => announce(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow microphone access in browser settings to use voice commands.' : `Voice recognition error: ${event.error}. You can try again.`);
    nbRecognition.onend = () => { nbVoiceActive = false; const b = document.getElementById('accessibilityVoiceBtn'); if (b) b.textContent = '🎙 Start voice commands'; };
    nbRecognition.start();
  } catch (_) { nbVoiceActive = false; announce('Could not start microphone. Check browser permissions and try again.'); }
}
function stopRecognition() { if (nbRecognition) { try { nbRecognition.abort(); } catch (_) {} nbRecognition = null; } nbVoiceActive = false; const b = document.getElementById('accessibilityVoiceBtn'); if (b) b.textContent = '🎙 Start voice commands'; }
function handleAccessibilityVoiceCommand(command) {
  announce(`Voice command received: ${command}`);
  if (/^(read|read out|read this|read current) (the )?(page|screen|content)?$/.test(command) || command.includes('read this page') || command.includes('read current page') || command.includes('read my notes') || command.includes('read notes') || command.includes('page padho') || command.includes('panna padho') || command.includes('पेज पढ़ो') || command.includes('पन्ना पढ़ो') || command.includes('पढ़कर सुनाओ')) { readCurrentPage(); return; }
  if ((command.includes('upload') && (command.includes('note') || command.includes('file') || command === 'upload')) || command.includes('notes upload') || command.includes('नोट्स अपलोड') || command.includes('नोट अपलोड')) { document.getElementById('accessibilityUploadBtn')?.click(); return; }
  if (command.includes('pause reading') || command.includes('padhna pause') || command.includes('पढ़ना रोक') || command === 'pause') { if ('speechSynthesis' in window) window.speechSynthesis.pause(); announce('Reading paused.'); return; }
  if (command.includes('resume reading') || command.includes('padhna chalu') || command.includes('फिर से पढ़') || command === 'resume') { if ('speechSynthesis' in window) window.speechSynthesis.resume(); announce('Reading resumed.'); return; }
  if (command.includes('stop reading') || command.includes('padhna roko') || command.includes('पढ़ना बंद') || command === 'stop') { stopSpeech(); return; }
  if (command.includes('high contrast on')) { setContrast(true); announce('High contrast enabled.'); return; }
  if (command.includes('high contrast off')) { setContrast(false); announce('High contrast disabled.'); return; }
  if (command.includes('open dashboard') || command.includes('dashboard kholo') || command.includes('डैशबोर्ड खोल') || command === 'dashboard') { switchTab('dashboard'); announce('Dashboard opened.'); return; }
  if (command.includes('open notes') || command.includes('notes kholo') || command.includes('नोट्स खोल') || command === 'notes' || command.includes('study notes')) { switchTab('notes'); announce('Study Notes Library opened.'); return; }
  if (command.includes('open quiz') || command.includes('start quiz') || command === 'quizzes') { switchTab('quizzes'); announce('AI Quizzes opened.'); return; }
  if (command.includes('ask a question') || command.includes('sawal pooch') || command.includes('सवाल पूछ') || command.includes('प्रश्न पूछ') || command.includes('open question') || command.includes('ask ai')) {
    switchTab('qa'); const input = document.getElementById('qaInput'); input?.focus(); announce('Question field focused. You can type a question or use your keyboard.'); return;
  }
  const askMatch = command.match(/^(?:ask|question)\s+(.+)$/);
  if (askMatch) {
    switchTab('qa'); const input = document.getElementById('qaInput');
    if (input) { input.value = askMatch[1]; input.focus(); announce(`Question entered: ${askMatch[1]}. Review it and submit using the Ask button.`); }
    return;
  }
  announce(`I do not recognize the command “${command}”. Try “read this page”, “open notes”, “upload notes” or “ask a question”.`);
}
