const DEFAULT_FILES = [
    { id: 1, name: 'index.html', type: 'html', content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modern App</title>
</head>
<body>
    <div class="glass-container">
        <div class="card">
            <h1>Welcome to Pro ⚡</h1>
            <p>Experience the ultimate live coding environment.</p>
            <button onclick="sayHello()">Get Started</button>
            <div id="output"></div>
        </div>
    </div>
</body>
</html>` },
    { id: 2, name: 'styles.css', type: 'css', content: `body {
    margin: 0;
    font-family: 'Inter', system-ui, sans-serif;
    min-height: 100vh;
    background: linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
}

.glass-container {
    padding: 2px;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
}

.card {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 22px;
    padding: 40px;
    text-align: center;
    max-width: 400px;
}

h1 {
    font-size: 2.2rem;
    margin: 0 0 10px 0;
    font-weight: 700;
}

p {
    margin: 0 0 30px 0;
    opacity: 0.9;
    line-height: 1.5;
}

button {
    background: white;
    color: #4f46e5;
    border: none;
    padding: 14px 32px;
    font-size: 1.1rem;
    font-weight: 600;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}

button:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}

#output {
    margin-top: 24px;
    font-weight: 500;
    border-radius: 8px;
}` },
    { id: 3, name: 'script.js', type: 'js', content: `function sayHello() {
    const btn = document.querySelector('button');
    btn.textContent = 'Awesome! 🎉';
    btn.style.background = '#10b981';
    btn.style.color = 'white';
    
    const output = document.getElementById('output');
    output.style.padding = '12px';
    output.style.background = 'rgba(255,255,255,0.1)';
    output.innerHTML = 'Compilation successful. Start building!';
    
    console.log("Interactive component triggered!");
}

console.log("Ready to code! 🚀");
` }
];

const APP_STATE_KEY = 'liveCompilerProStateV1';
const APP_STATE_TTL_MS = 30 * 60 * 1000;
const PRETTIER_CORE_URL = 'https://unpkg.com/prettier@3.2.5/standalone.js';
const PRETTIER_HTML_PARSER_URL = 'https://unpkg.com/prettier@3.2.5/plugins/html.js';
const PRETTIER_BABEL_PARSER_URL = 'https://unpkg.com/prettier@3.2.5/plugins/babel.js';
const PRETTIER_POSTCSS_PARSER_URL = 'https://unpkg.com/prettier@3.2.5/plugins/postcss.js';
const PRETTIER_MARKDOWN_PARSER_URL = 'https://unpkg.com/prettier@3.2.5/plugins/markdown.js';

function getDefaultFilesCopy() {
    return JSON.parse(JSON.stringify(DEFAULT_FILES));
}

const state = {
    files: getDefaultFilesCopy(),
    activeFileId: 1,
    selectedFileType: 'html',
    consoleVisible: true,
    consoleHeight: 200,
    consoleExpanded: false,
    sidebarVisible: true,
    autoRun: false,
    sectionCollapsed: {},
    sidebarWidth: 250,
    previewVisible: true,
    previewWidthPercent: 50,
    activeSidebarTab: 'files',
    theme: 'dark'
};

// CodeMirror editor instances
const editorInstances = new Map();
let codeMirrorLoaded = false;

// Wait for CodeMirror to load
if (window.codeMirrorReady) {
    codeMirrorLoaded = true;
} else {
    window.addEventListener('codemirror-ready', () => {
        codeMirrorLoaded = true;
        // Re-render editors with CodeMirror
        if (state.files && state.files.length > 0) {
            renderEditors();
        }
    });
}

// Get language mode for CodeMirror
function getLanguageMode(type) {
    if (!window.CodeMirror) return null;
    
    const modes = {
        'html': window.CodeMirror.html(),
        'css': window.CodeMirror.css(),
        'js': window.CodeMirror.javascript(),
        'python': window.CodeMirror.python(),
        'json': window.CodeMirror.json(),
        'markdown': window.CodeMirror.markdown()
    };
    
    return modes[type] || null;
}

// Language configurations
const languageConfig = {
    html: { icon: 'fa-html5', color: 'var(--html-color)', extension: '.html', tabSize: 4 },
    css: { icon: 'fa-css3-alt', color: 'var(--css-color)', extension: '.css', tabSize: 4 },
    js: { icon: 'fa-js', color: 'var(--js-color)', extension: '.js', tabSize: 4 },
    python: { icon: 'fa-python', color: 'var(--python-color)', extension: '.py', tabSize: 4 },
    json: { icon: 'fa-brackets-curly', color: 'var(--warning)', extension: '.json', tabSize: 2 },
    markdown: { icon: 'fa-markdown', color: 'var(--text-primary)', extension: '.md', tabSize: 2 }
};

// File type groups for sidebar
const fileGroups = {
    'Web': ['html', 'css', 'js'],
    'Backend': ['python'],
    'Other': ['json', 'markdown']
};

// HTML tags for auto-wrap helper
const HTML_TAG_SET = new Set([
    '!doctype', 'a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base',
    'basefont', 'bdi', 'bdo', 'bgsound', 'big', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption',
    'center', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog',
    'dir', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form',
    'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i',
    'iframe', 'img', 'input', 'ins', 'isindex', 'kbd', 'keygen', 'label', 'legend', 'li', 'link', 'main',
    'mark', 'marquee', 'menuitem', 'meta', 'meter', 'nav', 'nobr', 'noembed', 'noscript', 'object', 'optgroup',
    'option', 'output', 'p', 'param', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script',
    'section', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup',
    'svg', 'table', 'tbody', 'td', 'template', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt',
    'u', 'var', 'video', 'wbr', 'xmp'
]);

const HTML_VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr','basefont','bgsound','frame','isindex','keygen','menuitem','spacer']);

// Per-file undo/redo history
const historyStore = {};
let isRestoringHistory = false;

// Width constraints for resizable sidebar
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const ACTIVITY_BAR_WIDTH = 52;
const CONSOLE_MIN_HEIGHT = 120;
const CONSOLE_MAX_RATIO = 0.75;
const DEFAULT_CONSOLE_HEIGHT = 200;
const CONSOLE_KEYSTEP = 12;
const CONSOLE_KEYSTEP_FAST = 40;

// ==================== DOM ELEMENTS ====================
const fileTabsContainer = document.getElementById('fileTabs');
const addFileBtn = document.getElementById('addFileBtn');
const editorTabsContainer = document.getElementById('editorTabs');
const editorContent = document.getElementById('editorContent');
const previewFrame = document.getElementById('previewFrame');
const previewArea = document.getElementById('previewArea');
const mainResizer = document.getElementById('resizer');
const previewToggleIcon = document.getElementById('previewToggleIcon');
const consoleFocusIcon = document.getElementById('consoleFocusIcon');
const consoleOutput = document.getElementById('consoleOutput');
const consolePanel = document.getElementById('consolePanel');
const consoleResizer = document.getElementById('consoleResizer');
const consoleResizeHint = document.getElementById('consoleResizeHint');
const addFileModal = document.getElementById('addFileModal');
const importFileInput = document.getElementById('importFileInput');
const filesPanel = document.getElementById('filesPanel');
const importPanel = document.getElementById('importPanel');
const activityFilesBtn = document.getElementById('activityFilesBtn');
const activityImportBtn = document.getElementById('activityImportBtn');
const sidebar = document.getElementById('sidebar');
const leftSidebar = document.getElementById('leftSidebar');
const sidebarResizer = document.getElementById('sidebarResizer');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const editorArea = document.querySelector('.editor-area');
let pyodideReadyPromise = null;
let persistTimer = null;
let prettierReadyPromise = null;
let blackReadyPromise = null;

function setupModalDismiss() {
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.addEventListener('click', (event) => {
            if (event.target === infoModal) {
                closeInfoModal();
            }
        });
    }

    const addModal = document.getElementById('addFileModal');
    if (addModal) {
        addModal.addEventListener('click', (event) => {
            if (event.target === addModal) {
                closeAddFileModal();
            }
        });
    }

    const snippetsModal = document.getElementById('snippetsModal');
    if (snippetsModal) {
        snippetsModal.addEventListener('click', (event) => {
            if (event.target === snippetsModal) {
                closeSnippetsModal();
            }
        });
    }

    const collabModal = document.getElementById('collabModal');
    if (collabModal) {
        collabModal.addEventListener('click', (event) => {
            if (event.target === collabModal) {
                closeCollabModal();
            }
        });
    }
}

function persistStateNow() {
    const payload = {
        savedAt: Date.now(),
        state: {
            files: state.files,
            activeFileId: state.activeFileId,
            selectedFileType: state.selectedFileType,
            consoleVisible: state.consoleVisible,
            consoleHeight: state.consoleHeight,
            consoleExpanded: state.consoleExpanded,
            autoRun: state.autoRun,
            sectionCollapsed: state.sectionCollapsed,
            sidebarWidth: state.sidebarWidth,
            sidebarVisible: state.sidebarVisible,
            previewVisible: state.previewVisible,
            previewWidthPercent: state.previewWidthPercent,
            activeSidebarTab: state.activeSidebarTab,
            theme: state.theme
        }
    };

    try {
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
    } catch (err) {
        // Ignore quota/privacy errors
    }
}

function schedulePersistState() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistStateNow();
    }, 600);
}

function restoreStateFromStorage() {
    try {
        const raw = localStorage.getItem(APP_STATE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const savedAt = Number(parsed?.savedAt || 0);
        const savedState = parsed?.state;

        if (!savedState || !savedAt || (Date.now() - savedAt > APP_STATE_TTL_MS)) {
            localStorage.removeItem(APP_STATE_KEY);
            return;
        }

        if (Array.isArray(savedState.files) && savedState.files.length) {
            state.files = savedState.files;
        }

        if (typeof savedState.activeFileId === 'number') state.activeFileId = savedState.activeFileId;
        if (typeof savedState.selectedFileType === 'string') state.selectedFileType = savedState.selectedFileType;
        if (typeof savedState.consoleVisible === 'boolean') state.consoleVisible = savedState.consoleVisible;
        if (typeof savedState.consoleHeight === 'number') state.consoleHeight = savedState.consoleHeight;
        if (typeof savedState.consoleExpanded === 'boolean') state.consoleExpanded = savedState.consoleExpanded;
        // Force manual-run mode regardless of previously persisted value.
        state.autoRun = false;
        if (savedState.sectionCollapsed && typeof savedState.sectionCollapsed === 'object') {
            state.sectionCollapsed = savedState.sectionCollapsed;
        }
        if (typeof savedState.sidebarWidth === 'number') state.sidebarWidth = savedState.sidebarWidth;
        if (typeof savedState.sidebarVisible === 'boolean') state.sidebarVisible = savedState.sidebarVisible;
        if (typeof savedState.previewVisible === 'boolean') state.previewVisible = savedState.previewVisible;
        if (typeof savedState.previewWidthPercent === 'number') state.previewWidthPercent = savedState.previewWidthPercent;
        if (savedState.activeSidebarTab === 'files' || savedState.activeSidebarTab === 'import') {
            state.activeSidebarTab = savedState.activeSidebarTab;
        }
        if (savedState.theme === 'light' || savedState.theme === 'dark') {
            state.theme = savedState.theme;
        }
    } catch (err) {
        localStorage.removeItem(APP_STATE_KEY);
    }
}

function resetWorkspaceToDefaults() {
    state.files = getDefaultFilesCopy();
    state.activeFileId = state.files[0].id;
    state.selectedFileType = 'html';
    state.sectionCollapsed = {};
}

// ==================== INITIALIZATION ====================
function init() {
    restoreStateFromStorage();
    applyTheme(state.theme);
    applySidebarWidth(state.sidebarWidth);
    
    // Always close sidebar on desktop/laptop (> 1024px)
    if (window.innerWidth > 1024) {
        state.sidebarVisible = false;
    }
    
    switchSidebarTab(state.activeSidebarTab, true);
    renderFileTabs();
    renderEditorTabs();
    setupEditorTabsEvents();
    renderEditors();
    setupAutoRun();
    setupConsoleIntercept();
    setupConsoleInput();
    updatePreview();
    applyPreviewLayout();
    applyConsoleHeight();
    setupSidebarResizer();
    setupResizer();
    setupConsoleResizer();
    setupKeyboardShortcuts();
    setupModalDismiss();
    updateConsoleToggleIcon();
    updateConsoleFocusIcon();
    window.addEventListener('resize', applyConsoleHeight);

    window.addEventListener('beforeunload', () => {
        persistStateNow();
    });
    
    // Hide console by default on mobile
    if (window.innerWidth <= 768) {
        state.consoleVisible = false;
        const consolePanel = document.getElementById('consolePanel');
        if (consolePanel) {
            consolePanel.classList.remove('mobile-visible');
        }
        updateConsoleToggleIcon();
    }
    
    // Select default file type
    selectFileType(state.selectedFileType || 'html');
    
    // Attempt to reconnect to collaboration session if exists
    const session = getCollabSession();
    if (session) {
        setTimeout(() => {
            showToast('Reconnecting to collaboration session...', 'info');
            manualReconnect();
        }, 1000);
    }
}

// ==================== FILE TYPE SELECTION ====================
function selectFileType(type) {
    state.selectedFileType = type;
    
    // Update UI
    document.querySelectorAll('.file-type-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.type === type) {
            option.classList.add('selected');
        }
    });
}

// ==================== SIDEBAR HELPERS ====================
function applySidebarWidth(width) {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
    state.sidebarWidth = clamped;
    applySidebarLayout();
    schedulePersistState();
}

function getLeftSidebarWidth() {
    return ACTIVITY_BAR_WIDTH + (state.sidebarVisible ? state.sidebarWidth : 0);
}

function applySidebarLayout() {
    const totalWidth = getLeftSidebarWidth();
    leftSidebar.style.width = `${totalWidth}px`;
    leftSidebar.style.minWidth = `${ACTIVITY_BAR_WIDTH}px`;

    sidebar.classList.toggle('hidden', !state.sidebarVisible);
    sidebarResizer.classList.toggle('hidden', !state.sidebarVisible);

    if (state.sidebarVisible) {
        sidebar.style.width = `${state.sidebarWidth}px`;
    }
}

function switchSidebarTab(tab, forceOpen = false) {
    const clickedActiveTab = state.activeSidebarTab === tab;

    if (clickedActiveTab && !forceOpen) {
        state.sidebarVisible = !state.sidebarVisible;
    } else {
        state.activeSidebarTab = tab;
        state.sidebarVisible = true;
    }

    // Clear chat notifications when opening chat
    if (tab === 'chat' && window.socketClient) {
        window.socketClient.clearNotifications();
    }

    // Update panel visibility
    const panels = ['filesPanel', 'importPanel', 'chatPanel'];
    const buttons = ['activityFilesBtn', 'activityImportBtn', 'activityChatBtn'];
    
    panels.forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.remove('active');
        }
    });
    
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    // Activate selected panel and button
    const activePanel = document.getElementById(tab + 'Panel');
    const activeBtn = document.getElementById('activity' + tab.charAt(0).toUpperCase() + tab.slice(1) + 'Btn');
    
    if (activePanel) activePanel.classList.add('active');
    if (activeBtn) activeBtn.classList.add('active');

    applySidebarLayout();

    if (addFileBtn) {
        addFileBtn.style.display = (tab === 'files') ? 'flex' : 'none';
    }

    schedulePersistState();
}

function openImportPicker() {
    if (!importFileInput) return;
    importFileInput.value = '';
    importFileInput.click();
}

function detectFileTypeByName(fileName) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    const map = {
        html: 'html',
        htm: 'html',
        css: 'css',
        js: 'js',
        mjs: 'js',
        py: 'python',
        jsx: 'js',
        tsx: 'js',
        json: 'json',
        md: 'markdown',
        markdown: 'markdown',
        c: 'c',
        cpp: 'cpp',
        cxx: 'cpp',
        cs: 'csharp',
        java: 'java'
    };
    return map[ext] || 'js';
}

function importFiles(event) {
    const inputFiles = Array.from(event?.target?.files || []);
    if (!inputFiles.length) return;

    let importedCount = 0;
    let pending = inputFiles.length;

    inputFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
            const content = typeof reader.result === 'string' ? reader.result : '';
            const fileType = detectFileTypeByName(file.name);

            const newFile = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: file.name,
                type: fileType,
                content
            };

            state.files.push(newFile);
            importedCount += 1;

            if (fileType === 'markdown') {
                openMarkdownCompiler(content, file.name);
            }

            pending -= 1;
            if (pending === 0) {
                state.activeFileId = state.files[state.files.length - 1].id;
                renderFileTabs();
                renderEditorTabs();
                renderEditors();
                updatePreview();
                switchSidebarTab('files');
                showToast(`Imported ${importedCount} file${importedCount > 1 ? 's' : ''}`, 'success');
                schedulePersistState();
            }
        };

        reader.onerror = () => {
            pending -= 1;
            if (pending === 0) {
                if (importedCount > 0) {
                    state.activeFileId = state.files[state.files.length - 1].id;
                    renderFileTabs();
                    renderEditorTabs();
                    renderEditors();
                    updatePreview();
                    switchSidebarTab('files');
                    showToast(`Imported ${importedCount} file${importedCount > 1 ? 's' : ''}`, 'success');
                    schedulePersistState();
                } else {
                    showToast('Failed to import selected files', 'error');
                }
            }
        };

        reader.readAsText(file);
    });
}

function openMarkdownCompiler(content = '', fileName = 'markdown.md') {
    const payload = {
        name: fileName,
        content: content,
        savedAt: Date.now()
    };
    try {
        sessionStorage.setItem('mdLivePayload', JSON.stringify(payload));
    } catch (err) {
        // If storage fails, continue and open page; user can paste manually.
    }
    window.open('md.html', '_blank');
}

// ==================== FILE TABS ====================
function renderFileTabs() {
    // Group files by category
    const groupedFiles = {};
    
    Object.keys(fileGroups).forEach(group => {
        groupedFiles[group] = state.files.filter(f => 
            fileGroups[group].includes(f.type)
        );
    });

    fileTabsContainer.innerHTML = Object.entries(groupedFiles).map(([group, files]) => {
        if (files.length === 0) return '';
        
        const isCollapsed = state.sectionCollapsed[group] || false;
        
        return `
            <div class="file-section">
                <div class="file-section-header ${isCollapsed ? 'collapsed' : ''}" 
                     onclick="toggleSection('${group}')">
                    <i class="fas fa-chevron-down"></i>
                    <span>${group}</span>
                    <span style="margin-left:auto;font-size:0.65rem;color:var(--text-secondary);">${files.length}</span>
                </div>
                <div class="file-section-content ${isCollapsed ? 'collapsed' : ''}">
                    ${files.map(file => `
                        <div class="file-tab ${file.id === state.activeFileId ? 'active' : ''}" 
                             onclick="switchFile(${file.id})">
                            <i class="fab ${getLanguageIcon(file.type)}" 
                               style="color: ${getLanguageColor(file.type)};"></i>
                            <span class="file-name">${file.name}</span>
                            <i class="fas fa-times close-tab" 
                               onclick="event.stopPropagation(); deleteFile(${file.id})"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function toggleSection(group) {
    state.sectionCollapsed[group] = !state.sectionCollapsed[group];
    renderFileTabs();
    schedulePersistState();
}

function getLanguageIcon(type) {
    const icons = {
        html: 'fa-html5',
        css: 'fa-css3-alt',
        js: 'fa-js',
        python: 'fa-python',
        react: 'fa-react',
        node: 'fa-node-js',
        c: 'fa-c',
        cpp: 'fa-code',
        csharp: 'fa-code',
        java: 'fa-java',
        json: 'fa-brackets-curly',
        markdown: 'fa-markdown'
    };
    return icons[type] || 'fa-file';
}

function getLanguageColor(type) {
    return languageConfig[type]?.color || 'var(--text-secondary)';
}

// ==================== EDITOR TABS ====================
function renderEditorTabs() {
    editorTabsContainer.innerHTML = state.files.map(file => `
        <div class="editor-tab ${file.id === state.activeFileId ? 'active' : ''}"
             role="tab"
             aria-selected="${file.id === state.activeFileId}"
             tabindex="${file.id === state.activeFileId ? '0' : '-1'}"
             data-file-id="${file.id}"
             onclick="switchFile(${file.id})">
            <i class="fab ${getLanguageIcon(file.type)}" 
               style="color: ${getLanguageColor(file.type)};"></i>
            <span class="file-name-editable" 
                  data-file-id="${file.id}"
                  ondblclick="event.stopPropagation(); startRenameFile(${file.id})"
                  title="Double-click or press F2 to rename">${file.name}</span>
            <i class="fas fa-download close-editor-tab" 
               title="Export file"
               onclick="event.stopPropagation(); exportFile(${file.id})"></i>
            <i class="fas fa-times close-editor-tab" 
               onclick="event.stopPropagation(); closeEditorTab(${file.id})"></i>
        </div>
    `).join('');
}

// Setup editor tabs event delegation (call once on init) - Backup method
function setupEditorTabsEvents() {
    // Use event delegation for double-click as backup
    editorTabsContainer.addEventListener('dblclick', function(e) {
        // Check if we clicked on the file name span
        if (e.target.classList.contains('file-name-editable')) {
            e.stopPropagation();
            const fileId = parseInt(e.target.getAttribute('data-file-id'));
            if (fileId) {
                startRenameFile(fileId);
            }
        }
    });
}

function startRenameFile(fileId) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;
    
    // Find the span element for this file
    const span = document.querySelector(`.file-name-editable[data-file-id="${fileId}"]`);
    if (!span) return;
    
    const currentName = file.name;
    const lastDotIndex = currentName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? currentName.substring(0, lastDotIndex) : currentName;
    const ext = lastDotIndex > 0 ? currentName.substring(lastDotIndex) : '';
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = nameWithoutExt;
    input.className = 'rename-input';
    input.setAttribute('data-file-id', fileId);
    input.onclick = (e) => e.stopPropagation();
    
    // Replace span with input
    span.replaceWith(input);
    input.focus();
    input.select();
    
    let isFinishing = false;
    
    const finishRename = () => {
        if (isFinishing) return;
        isFinishing = true;
        
        const newName = input.value.trim();
        if (newName && newName !== nameWithoutExt) {
            const fullNewName = newName + ext;
            
            // Check for duplicate names
            const duplicate = state.files.find(f => f.id !== fileId && f.name === fullNewName);
            if (duplicate) {
                showToast('A file with this name already exists', 'error');
            } else {
                file.name = fullNewName;
                schedulePersistState();
                showToast(`Renamed to ${fullNewName}`, 'success');
            }
        }
        
        // Re-render to restore normal state
        renderEditorTabs();
        renderFileTabs();
    };
    
    const cancelRename = () => {
        if (isFinishing) return;
        isFinishing = true;
        renderEditorTabs();
        renderFileTabs();
    };
    
    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelRename();
        }
    });
}

function closeEditorTab(fileId) {
    if (state.files.length <= 1) {
        showToast('Cannot close the last file', 'warning');
        return;
    }
    deleteFile(fileId);
}

function exportFile(fileId) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;

    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'download.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${file.name}`, 'success');
}

// ==================== EDITORS ====================
function renderEditors() {
    // Clear existing editors
    editorContent.innerHTML = '';
    
    // Dispose old CodeMirror instances
    editorInstances.forEach((editor, fileId) => {
        if (editor && editor.destroy) {
            editor.destroy();
        }
    });
    editorInstances.clear();
    
    // Create editor containers
    state.files.forEach(file => {
        const editorDiv = document.createElement('div');
        editorDiv.className = `code-editor ${file.id === state.activeFileId ? 'active' : ''}`;
        editorDiv.id = `editor-${file.id}`;
        editorContent.appendChild(editorDiv);
        
        // If CodeMirror is loaded, create editor instance
        if (codeMirrorLoaded && window.CodeMirror) {
            createCodeMirrorEditor(file.id, editorDiv);
        } else {
            // Fallback to textarea while CodeMirror loads
            createFallbackEditor(file.id, editorDiv);
        }
        
        primeHistory(file.id, file.content);
    });
}

function createCodeMirrorEditor(fileId, container) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;
    
    const languageMode = getLanguageMode(file.type);
    const extensions = [
        window.CodeMirror.basicSetup,
        window.CodeMirror.keymap.of([window.CodeMirror.indentWithTab]),
        window.CodeMirror.EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const content = update.state.doc.toString();
                file.content = content;
                onCodeChange(fileId);
            }
        })
    ];
    
    // Add language mode if available
    if (languageMode) {
        extensions.push(languageMode);
    }
    
    // Add theme based on current theme
    if (state.theme === 'dark') {
        extensions.push(window.CodeMirror.oneDark);
    }
    
    // Add line wrapping
    extensions.push(window.CodeMirror.EditorView.lineWrapping);
    
    const editorState = window.CodeMirror.EditorState.create({
        doc: file.content,
        extensions: extensions
    });
    
    const view = new window.CodeMirror.EditorView({
        state: editorState,
        parent: container
    });
    
    // Store instance
    editorInstances.set(fileId, view);
}

function createFallbackEditor(fileId, container) {
    const file = state.files.find(f => f.id === fileId);
    if (!file) return;
    
    container.innerHTML = `
        <div class="editor-wrapper">
            <div class="line-numbers" id="lines-${fileId}"></div>
            <textarea id="code-${fileId}" 
                      data-type="${file.type}"
                      oninput="updateLineNumbers(${fileId}); onCodeChange(${fileId})"
                      onscroll="syncScroll(${fileId})"
                      onkeydown="handleTabKey(event, ${fileId})"
                      spellcheck="false">${escapeHtml(file.content)}</textarea>
        </div>
    `;
    
    updateLineNumbers(fileId);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateLineNumbers(fileId) {
    const textarea = document.getElementById(`code-${fileId}`);
    if (!textarea) return;
    const linesDiv = document.getElementById(`lines-${fileId}`);
    if (!linesDiv) return;
    const lines = textarea.value.split('\n').length;
    linesDiv.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
}

function syncScroll(fileId) {
    const textarea = document.getElementById(`code-${fileId}`);
    const linesDiv = document.getElementById(`lines-${fileId}`);
    linesDiv.scrollTop = textarea.scrollTop;
}

// ==================== VS CODE STYLE TAB HANDLING ====================
function handleTabKey(event, fileId) {
    const textarea = document.getElementById(`code-${fileId}`);
    const file = state.files.find(f => f.id === fileId);
    const tabSize = languageConfig[file?.type]?.tabSize || 4;

    // Tab key - insert spaces
    if (event.key === 'Tab') {
        event.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const spaces = ' '.repeat(tabSize);
        
        textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + tabSize;
        onCodeChange(fileId);
    }

    // Enter key - maintain indentation
    if (event.key === 'Enter') {
        event.preventDefault();
        const start = textarea.selectionStart;
        const value = textarea.value;
        
        // Find current line's indentation
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLine = value.substring(lineStart, start);
        const indentation = currentLine.match(/^(\s*)/)[0];

        // Auto-wrap bare tag names into <tag></tag>
        const trimmed = currentLine.trim();
        const tagMatch = trimmed.match(/^([A-Za-z][\w-]*)$/);
        if (tagMatch && HTML_TAG_SET.has(tagMatch[1].toLowerCase())) {
            const tag = tagMatch[1];
            const isVoid = HTML_VOID_TAGS.has(tag.toLowerCase());
            const openTag = `<${tag}>`;
            const closeTag = isVoid ? '' : `</${tag}>`;
            const innerIndent = indentation + ' '.repeat(tabSize);

            const before = value.substring(0, lineStart);
            const after = value.substring(start);
            const newContent = isVoid
                ? `${before}${indentation}${openTag}${after}`
                : `${before}${indentation}${openTag}\n${innerIndent}\n${indentation}${closeTag}${after}`;

            textarea.value = newContent;
            const cursorPos = isVoid
                ? (before + indentation + openTag).length
                : (before + indentation + openTag + '\n' + innerIndent).length;
            textarea.selectionStart = textarea.selectionEnd = cursorPos;
            updateLineNumbers(fileId);
            onCodeChange(fileId);
            return;
        }
        
        // Check for auto-indent (if line ends with { or similar)
        const prevChar = value[start - 1];
        const nextChar = value[start];
        let additionalIndent = '';
        
        if (prevChar === '{' || prevChar === ':' || prevChar === '(') {
            additionalIndent = ' '.repeat(tabSize);
        }
        
        // Insert new line with indentation
        const newLine = '\n' + indentation + additionalIndent;
        textarea.value = value.substring(0, start) + newLine + value.substring(start);
        
        // Set cursor position
        const newCursorPos = start + newLine.length;
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
        
        // Handle auto-close brackets
        if (prevChar === '{' && nextChar === '}') {
            // Move cursor inside the brackets
            textarea.selectionStart = textarea.selectionEnd = start + 1;
        }
        
        updateLineNumbers(fileId);
        onCodeChange(fileId);
    }

    // Auto-close brackets and quotes
    const pairs = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'", '`': '`' };
    if (pairs[event.key]) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        
        if (selectedText) {
            // Wrap selection
            event.preventDefault();
            textarea.value = textarea.value.substring(0, start) + 
                event.key + selectedText + pairs[event.key] + 
                textarea.value.substring(end);
            textarea.selectionStart = start + 1;
            textarea.selectionEnd = end + 1;
            onCodeChange(fileId);
        }
    }

    // Auto-close HTML/JSX tags on '>'
    if (event.key === '>' && (file?.type === 'html' || file?.type === 'react')) {
        const cursor = textarea.selectionStart;
        const before = textarea.value.substring(0, cursor);
        const match = before.match(/<([A-Za-z][\w-]*)([^<>]*?)$/);
        const voidTags = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];

        if (match) {
            const tagName = match[1];
            const attrs = match[2] || '';
            const isClosing = match[0].includes('</');
            const selfClosed = attrs.trim().endsWith('/') || voidTags.includes(tagName.toLowerCase());

            if (!isClosing && !selfClosed) {
                event.preventDefault();
                const closing = `</${tagName}>`;
                const newValue = `${before}>${closing}${textarea.value.substring(cursor)}`;
                textarea.value = newValue;
                const newPos = cursor + 1; // place cursor between open and close
                textarea.selectionStart = textarea.selectionEnd = newPos;
                updateLineNumbers(fileId);
                onCodeChange(fileId);
            }
        }
    }
}

// ==================== FORMATTER ====================
async function formatCurrentFile() {
    const file = state.files.find(f => f.id === state.activeFileId);
    if (!file) return;

    const formatted = await formatContent(file.type, file.content);
    if (formatted == null) {
        showToast('Formatting not available for this file type', 'warning');
        return;
    }

    file.content = formatted;
    const textarea = document.getElementById(`code-${file.id}`);
    if (textarea) {
        textarea.value = formatted;
        updateLineNumbers(file.id);
    }

    updatePreview();
    showToast('Formatted', 'success');
    recordHistory(file.id);
    schedulePersistState();
}

async function formatContent(type, content) {
    if (!content) return content;
    const clean = content.replace(/\r\n/g, '\n');

    // Try Prettier first
    const prettierResult = await formatWithPrettier(type, clean);
    if (prettierResult !== null) return prettierResult;

    if (type === 'python') {
        const pythonResult = await formatPythonWithBlack(clean);
        if (pythonResult !== null) return pythonResult;
    }

    // Fallback lightweight formatter if Prettier unavailable
    if (type === 'js' || type === 'css' || type === 'react' || type === 'node' || type === 'c' || type === 'cpp' || type === 'csharp' || type === 'java') {
        return formatBraced(clean, 4);
    }
    if (type === 'html') {
        return formatHtml(clean, 2);
    }
    return null;
}

function formatBraced(content, indentSize = 4) {
    const lines = content.split('\n');
    let indent = 0;
    const result = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';

        const closing = /^([}\]]|\)\s*;?|case\b|default\b)/.test(trimmed);
        if (closing) {
            indent = Math.max(indent - 1, 0);
        }

        const indented = ' '.repeat(indent * indentSize) + trimmed;

        const openCount = (trimmed.match(/[({\[]/g) || []).length;
        const closeCount = (trimmed.match(/[)}\]]/g) || []).length;
        indent += Math.max(openCount - closeCount, 0);

        return indented;
    });

    return result.join('\n');
}

function formatHtml(content, indentSize = 2) {
    const tokens = content.split(/(<[^>]+>)/g).filter(t => t.trim() !== '');
    const voidTags = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
    let indent = 0;
    const out = tokens.map(tok => {
        const trimmed = tok.trim();
        const isClosing = /^<\//.test(trimmed);
        const tagName = trimmed.match(/^<\/?\s*([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase();
        const isVoid = voidTags.includes(tagName) || /\/>$/.test(trimmed) || /^<!/.test(trimmed) || /^<script/i.test(trimmed) || /^<style/i.test(trimmed);

        if (isClosing) {
            indent = Math.max(indent - 1, 0);
        }

        const line = ' '.repeat(indent * indentSize) + trimmed;

        if (!isClosing && !isVoid && /^<[^>]+>$/.test(trimmed)) {
            indent += 1;
        }

        return line;
    });

    return out.join('\n');
}

// ==================== HISTORY (UNDO/REDO) ====================
function primeHistory(fileId, initialContent = '') {
    if (!historyStore[fileId]) {
        historyStore[fileId] = {
            stack: [{ content: initialContent, selectionStart: 0, selectionEnd: 0 }],
            pointer: 0
        };
    }
}

function recordHistory(fileId) {
    primeHistory(fileId);
    const textarea = document.getElementById(`code-${fileId}`);
    if (!textarea) return;
    const entry = {
        content: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd
    };
    const hist = historyStore[fileId];
    const current = hist.stack[hist.pointer];
    if (current && current.content === entry.content && current.selectionStart === entry.selectionStart && current.selectionEnd === entry.selectionEnd) {
        return;
    }

    if (hist.pointer < hist.stack.length - 1) {
        hist.stack = hist.stack.slice(0, hist.pointer + 1);
    }

    hist.stack.push(entry);
    hist.pointer = hist.stack.length - 1;

    const MAX_HISTORY = 200;
    if (hist.stack.length > MAX_HISTORY) {
        hist.stack.shift();
        hist.pointer = hist.stack.length - 1;
    }
}

function applyHistoryEntry(fileId, entry) {
    isRestoringHistory = true;
    
    const editor = editorInstances.get(fileId);
    if (editor) {
        // CodeMirror editor
        const transaction = editor.state.update({
            changes: {
                from: 0,
                to: editor.state.doc.length,
                insert: entry.content
            }
        });
        editor.dispatch(transaction);
        
        // Set selection
        if (entry.selectionStart !== undefined) {
            editor.dispatch({
                selection: {
                    anchor: entry.selectionStart,
                    head: entry.selectionEnd || entry.selectionStart
                }
            });
        }
    } else {
        // Fallback textarea
        const textarea = document.getElementById(`code-${fileId}`);
        if (textarea) {
            textarea.value = entry.content;
            textarea.selectionStart = entry.selectionStart;
            textarea.selectionEnd = entry.selectionEnd;
            updateLineNumbers(fileId);
        }
    }
    
    const file = state.files.find(f => f.id === fileId);
    if (file) file.content = entry.content;
    
    updatePreview();
    schedulePersistState();
    isRestoringHistory = false;
}

function undoInEditor(fileId) {
    const hist = historyStore[fileId];
    if (!hist || hist.pointer <= 0) return false;
    hist.pointer -= 1;
    applyHistoryEntry(fileId, hist.stack[hist.pointer]);
    return true;
}

function redoInEditor(fileId) {
    const hist = historyStore[fileId];
    if (!hist || hist.pointer >= hist.stack.length - 1) return false;
    hist.pointer += 1;
    applyHistoryEntry(fileId, hist.stack[hist.pointer]);
    return true;
}

// ==================== FILE OPERATIONS ====================
function switchFile(fileId) {
    state.activeFileId = fileId;
    renderFileTabs();
    renderEditorTabs();
    renderEditors();
    schedulePersistState();
}

function deleteFile(fileId) {
    if (state.files.length <= 1) {
        showToast('Cannot delete the last file!', 'warning');
        return;
    }
    if (confirm('Are you sure you want to delete this file?')) {
        state.files = state.files.filter(f => f.id !== fileId);
        if (state.activeFileId === fileId) {
            state.activeFileId = state.files[0].id;
        }
        delete historyStore[fileId];
        renderFileTabs();
        renderEditorTabs();
        renderEditors();
        updatePreview();
        showToast('File deleted', 'success');
        schedulePersistState();
    }
}

function openAddFileModal() {
    addFileModal.classList.add('active');
    document.getElementById('newFileName').focus();
    selectFileType('html');
}

function closeAddFileModal() {
    addFileModal.classList.remove('active');
    document.getElementById('newFileName').value = '';
}

function openInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function createNewFile() {
    const nameInput = document.getElementById('newFileName');
    let fileName = nameInput.value.trim();
    const fileType = state.selectedFileType;
    const config = languageConfig[fileType];

    if (!fileName) {
        showToast('Please enter a file name', 'warning');
        return;
    }

    // Auto-add extension if not present
    if (!fileName.includes('.')) {
        fileName = `${fileName}${config.extension}`;
    }

    const newFile = {
        id: Date.now(),
        name: fileName,
        type: fileType,
        content: getDefaultContent(fileType)
    };

    state.files.push(newFile);
    state.activeFileId = newFile.id;
    primeHistory(newFile.id, newFile.content);
    if (fileType === 'markdown') {
        openMarkdownCompiler(newFile.content, newFile.name);
    }
    
    closeAddFileModal();
    renderFileTabs();
    renderEditorTabs();
    renderEditors();
    updatePreview();
    showToast(`Created ${fileName}`, 'success');
    schedulePersistState();
}

function getDefaultContent(type) {
    const defaults = {
        html: '<!DOCTYPE html>\n<html>\n<head>\n    <title>New Page</title>\n</head>\n<body>\n    <!-- Your content here -->\n</body>\n</html>',
        css: '/* Styles here */\n\n.selector {\n    \n}',
        js: '// JavaScript code here\n\n',
        python: '# Python code here\n\ndef main():\n    \n\nif __name__ == "__main__":\n    main()',
        json: '{\n    "key": "value"\n}',
        markdown: '# Title\n\n## Section\n\n- Item 1\n- Item 2'
    };
    return defaults[type] || '// Your code here\n';
}

// ==================== CODE COMPILATION ====================
function onCodeChange(fileId) {
    if (isRestoringHistory) return;
    const file = state.files.find(f => f.id === fileId);
    if (file) {
        // Get content from CodeMirror or textarea
        const editor = editorInstances.get(fileId);
        if (editor) {
            file.content = editor.state.doc.toString();
        } else {
            const textarea = document.getElementById(`code-${fileId}`);
            if (textarea) {
                file.content = textarea.value;
            }
        }
    }

    recordHistory(fileId);
    schedulePersistState();
}

function updatePreview() {
    const htmlFile = state.files.find(f => f.type === 'html');
    const cssFiles = state.files.filter(f => f.type === 'css');
    const jsFiles = state.files.filter(f => f.type === 'js');

    let html = htmlFile ? htmlFile.content : '<h1>No HTML file</h1>';
    let css = cssFiles.map(f => f.content).join('\n');
    let js = jsFiles.map(f => f.content).join('\n');

    const source = `
        <!DOCTYPE html>
        <html>
            <head>
                <style>${css}</style>
            </head>
            <body>
                ${html}
                <script>
                    // Intercept console methods
                    const _originalLog = console.log;
                    const _originalWarn = console.warn;
                    const _originalError = console.error;
                    const _originalInfo = console.info;
                    
                    console.log = function(...args) {
                        window.parent.postMessage({type: 'console', level: 'log', args: args}, '*');
                        _originalLog.apply(console, args);
                    };
                    
                    console.warn = function(...args) {
                        window.parent.postMessage({type: 'console', level: 'warn', args: args}, '*');
                        _originalWarn.apply(console, args);
                    };
                    
                    console.error = function(...args) {
                        window.parent.postMessage({type: 'console', level: 'error', args: args}, '*');
                        _originalError.apply(console, args);
                    };
                    
                    console.info = function(...args) {
                        window.parent.postMessage({type: 'console', level: 'info', args: args}, '*');
                        _originalInfo.apply(console, args);
                    };
                    
                    // Error handler
                    window.onerror = function(msg, url, line) {
                        window.parent.postMessage({type: 'console', level: 'error', args: [msg + ' (Line: ' + line + ')']}, '*');
                    };
                    
                    ${js}
                <\/script>
            </body>
        </html>
    `;

    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(source);
    doc.close();
}

async function runCode() {
    ensureOutputPanelsVisible();
    updatePreview();
    await runPythonBackend();
    showToast('Code executed!', 'success');
}

function refreshPreview() {
    updatePreview();
    showToast('Preview refreshed', 'success');
}

function openInNewTab() {
    const htmlFile = state.files.find(f => f.type === 'html');
    const cssFiles = state.files.filter(f => f.type === 'css');
    const jsFiles = state.files.filter(f => f.type === 'js');

    let html = htmlFile ? htmlFile.content : '';
    let css = cssFiles.map(f => f.content).join('\n');
    let js = jsFiles.map(f => f.content).join('\n');

    const source = `
        <!DOCTYPE html>
        <html>
            <head>
                <style>${css}</style>
            </head>
            <body>
                ${html}
                <script>${js}<\/script>
            </body>
        </html>
    `;

    const blob = new Blob([source], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    showToast('Opened in new tab', 'success');
}

function ensureOutputPanelsVisible() {
    if (!state.previewVisible) {
        state.previewVisible = true;
        applyPreviewLayout();
    }

    if (!state.consoleVisible) {
        state.consoleVisible = true;
        applyConsoleHeight();
        updateConsoleToggleIcon();
    }
}

// ==================== PREVIEW VISIBILITY ====================
function applyPreviewLayout() {
    if (state.previewVisible) {
        previewArea.classList.remove('hidden');
        mainResizer.classList.remove('hidden');
        editorArea.classList.remove('full-width');

        const editorWidth = 100 - state.previewWidthPercent;
        editorArea.style.width = `${editorWidth}%`;
        previewArea.style.width = `${state.previewWidthPercent}%`;
    } else {
        previewArea.classList.add('hidden');
        mainResizer.classList.add('hidden');
        editorArea.classList.add('full-width');

        editorArea.style.width = '100%';
        previewArea.style.width = '0%';
    }

    updatePreviewToggleIcon();
    updatePreviewToggleAria();
    applyConsoleHeight();
}

function togglePreviewArea() {
    state.previewVisible = !state.previewVisible;
    applyPreviewLayout();
    showToast(state.previewVisible ? 'Preview shown' : 'Preview hidden', 'info');
    schedulePersistState();
}

function updatePreviewToggleIcon() {
    if (!previewToggleIcon) return;
    previewToggleIcon.className = state.previewVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function updatePreviewToggleAria() {
    const previewToggleButton = document.getElementById('previewToggleButton');
    if (previewToggleButton) {
        previewToggleButton.setAttribute('aria-pressed', String(state.previewVisible));
    }
}

// ==================== PYTHON BACKEND ====================
async function loadPyodideOnce() {
    if (pyodideReadyPromise) return pyodideReadyPromise;

    pyodideReadyPromise = new Promise((resolve, reject) => {
        addConsoleLog('info', ['Loading Pyodide (Python runtime)...']);
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
        script.onload = async () => {
            try {
                const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' });
                addConsoleLog('success', ['Pyodide ready']);
                resolve(pyodide);
            } catch (err) {
                addConsoleLog('error', ['Pyodide init failed', String(err)]);
                reject(err);
            }
        };
        script.onerror = () => {
            addConsoleLog('error', ['Failed to load Pyodide script']);
            reject(new Error('Pyodide script load failed'));
        };
        document.head.appendChild(script);
    });

    return pyodideReadyPromise;
}

async function runPythonBackend() {
    const pythonFiles = state.files.filter(f => f.type === 'python');
    if (!pythonFiles.length) return; // Nothing to run

    const code = pythonFiles.map(f => f.content).join('\n\n');
    if (!code.trim()) return;

    let pyodide;
    try {
        pyodide = await loadPyodideOnce();
    } catch (err) {
        // Loading already logged; stop here
        return;
    }

    const consoleBridge = `import sys, js\n\nclass _Writer:\n    def __init__(self, level):\n        self.level = level\n    def write(self, s):\n        if s.strip():\n            js.addConsoleLog(self.level, [s])\n    def flush(self):\n        pass\n\nsys.stdout = _Writer('log')\nsys.stderr = _Writer('error')\n`;

    try {
        const result = await pyodide.runPythonAsync(consoleBridge + '\n' + code);
        if (typeof result !== 'undefined') {
            addConsoleLog('log', ['Python result:', String(result)]);
        }
    } catch (err) {
        addConsoleLog('error', ['Python error:', String(err)]);
    }
}

// ==================== CONSOLE ====================
function setupConsoleIntercept() {
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'console') {
            addConsoleLog(event.data.level, event.data.args);
        }
    });
}

function addConsoleLog(level, args) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    const logElement = document.createElement('div');
    logElement.className = `console-log ${level}`;
    logElement.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    consoleOutput.appendChild(logElement);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function applyConsoleHeight() {
    if (!consolePanel || !consoleResizer) return;
    if (!state.previewVisible) {
        consolePanel.style.height = '0px';
        consolePanel.classList.add('collapsed');
        consoleResizer.classList.add('hidden');
        consoleResizer.classList.remove('active');
        updateConsoleResizerAria(CONSOLE_MIN_HEIGHT, CONSOLE_MIN_HEIGHT, CONSOLE_MIN_HEIGHT);
        hideConsoleHint();
        return;
    }

    previewArea.classList.toggle('console-only', state.consoleExpanded);

    if (state.consoleExpanded) {
        consolePanel.style.height = '100%';
        consolePanel.classList.remove('collapsed');
        consoleResizer.classList.add('hidden');
        hideConsoleHint();
        updateConsoleResizerAria(100, 0, 100);
        return;
    }

    const maxHeight = getConsoleMaxHeight();
    const clamped = Math.min(maxHeight, Math.max(CONSOLE_MIN_HEIGHT, state.consoleHeight || DEFAULT_CONSOLE_HEIGHT));
    state.consoleHeight = clamped;

    const visible = state.consoleVisible;
    consolePanel.style.height = visible ? `${clamped}px` : '0px';
    consolePanel.classList.toggle('collapsed', !visible);
    consoleResizer.classList.toggle('hidden', !visible);
    if (!visible) {
        consoleResizer.classList.remove('active');
    }

    updateConsoleResizerAria(clamped, CONSOLE_MIN_HEIGHT, maxHeight);
    positionConsoleHint(clamped);
}

function setupConsoleResizer() {
    if (!consoleResizer) return;
    
    let isActive = false;
    let initialY = 0;
    let initialHeight = DEFAULT_CONSOLE_HEIGHT;

    function handleMouseDown(event) {
        if (!state.consoleVisible) return;
        
        isActive = true;
        initialY = event.pageY;
        initialHeight = state.consoleHeight || DEFAULT_CONSOLE_HEIGHT;
        
        consoleResizer.classList.add('active');
        document.body.classList.add('resizing');
        showConsoleHint(initialHeight);
        
        event.preventDefault();
        event.stopPropagation();
    }

    function handleMouseMove(event) {
        if (!isActive) return;
        
        const currentY = event.pageY;
        const diffY = initialY - currentY; // Inverted for natural feel
        
        let newHeight = initialHeight + diffY;
        
        // Limit between min and max
        const maxHeight = getConsoleMaxHeight();
        if (newHeight < CONSOLE_MIN_HEIGHT) newHeight = CONSOLE_MIN_HEIGHT;
        if (newHeight > maxHeight) newHeight = maxHeight;
        
        state.consoleHeight = newHeight;
        
        // Apply height directly
        consolePanel.style.setProperty('--console-height', newHeight + 'px');
        consolePanel.style.height = newHeight + 'px';
        
        showConsoleHint(newHeight);
    }

    function handleMouseUp() {
        if (!isActive) return;
        
        isActive = false;
        consoleResizer.classList.remove('active');
        document.body.classList.remove('resizing');
        hideConsoleHint();
        
        schedulePersistState();
    }

    function handleDoubleClick() {
        state.consoleHeight = DEFAULT_CONSOLE_HEIGHT;
        applyConsoleHeight();
        schedulePersistState();
        showToast('Console reset to default', 'info');
    }

    consoleResizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    consoleResizer.addEventListener('dblclick', handleDoubleClick);

    // Keyboard controls
    consoleResizer.addEventListener('keydown', (e) => {
        if (!state.consoleVisible) return;
        
        const step = e.shiftKey ? CONSOLE_KEYSTEP_FAST : CONSOLE_KEYSTEP;
        
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            adjustConsoleHeightBy(step);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            adjustConsoleHeightBy(-step);
        } else if (e.key === 'Home') {
            e.preventDefault();
            state.consoleHeight = CONSOLE_MIN_HEIGHT;
            applyConsoleHeight();
            schedulePersistState();
        } else if (e.key === 'End') {
            e.preventDefault();
            state.consoleHeight = getConsoleMaxHeight();
            applyConsoleHeight();
            schedulePersistState();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleDoubleClick();
        }
    });
}

function toggleConsole() {
    state.consoleVisible = !state.consoleVisible;
    if (!state.consoleVisible) {
        state.consoleExpanded = false;
    }
    
    // Mobile-specific handling
    if (window.innerWidth <= 768) {
        const consolePanel = document.getElementById('consolePanel');
        const previewArea = document.getElementById('previewArea');
        
        if (consolePanel) {
            if (state.consoleVisible) {
                consolePanel.classList.add('mobile-visible');
            } else {
                consolePanel.classList.remove('mobile-visible');
            }
        }
        
        if (previewArea) {
            if (state.consoleVisible) {
                previewArea.classList.add('console-visible');
            } else {
                previewArea.classList.remove('console-visible');
            }
        }
    }
    
    applyConsoleHeight();
    updateConsoleToggleIcon();
    updateConsoleFocusIcon();
    schedulePersistState();
}

function updateConsoleToggleIcon() {
    const icon = document.getElementById('consoleToggleIcon');
    if (icon) {
        icon.className = state.consoleVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
    }
    document.querySelectorAll('.console-toggle-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', String(state.consoleVisible));
    });
}

function toggleConsoleFocus() {
    if (!state.consoleVisible) {
        state.consoleVisible = true;
    }
    state.consoleExpanded = !state.consoleExpanded;
    applyConsoleHeight();
    updateConsoleFocusIcon();
    schedulePersistState();
}

function updateConsoleFocusIcon() {
    const btn = document.getElementById('consoleFocusButton');
    if (btn) {
        btn.setAttribute('aria-pressed', String(state.consoleExpanded));
    }
    if (consoleFocusIcon) {
        consoleFocusIcon.className = state.consoleExpanded ? 'fas fa-compress-alt' : 'fas fa-expand-alt';
    }
}

function adjustConsoleHeightBy(delta) {
    const maxHeight = getConsoleMaxHeight();
    const next = Math.min(maxHeight, Math.max(CONSOLE_MIN_HEIGHT, (state.consoleHeight || DEFAULT_CONSOLE_HEIGHT) + delta));
    state.consoleHeight = next;
    applyConsoleHeight();
    schedulePersistState();
}

function getConsoleMaxHeight() {
    const headerHeight = document.querySelector('.preview-header')?.offsetHeight || 0;
    const resizerHeight = consoleResizer?.offsetHeight || 0;
    const areaHeight = previewArea?.clientHeight || 0;
    const available = Math.max(0, areaHeight - headerHeight - resizerHeight - 24);
    return Math.max(CONSOLE_MIN_HEIGHT, available * CONSOLE_MAX_RATIO);
}

function updateConsoleResizerAria(value, min, max) {
    if (!consoleResizer) return;
    consoleResizer.setAttribute('aria-valuenow', Math.round(value));
    consoleResizer.setAttribute('aria-valuemin', Math.round(min));
    consoleResizer.setAttribute('aria-valuemax', Math.round(max));
}

async function loadPrettierOnce() {
    if (prettierReadyPromise) return prettierReadyPromise;

    const loadScript = (src) => new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find(s => s.src === src);
        if (existing) {
            if (existing.dataset.loaded === 'true') return resolve();
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.dataset.loaded = 'false';
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });

    prettierReadyPromise = (async () => {
        await loadScript(PRETTIER_CORE_URL);
        await loadScript(PRETTIER_HTML_PARSER_URL);
        await loadScript(PRETTIER_BABEL_PARSER_URL);
        await loadScript(PRETTIER_POSTCSS_PARSER_URL);
        await loadScript(PRETTIER_MARKDOWN_PARSER_URL);

        if (!globalThis.prettier || !globalThis.prettier.format || !globalThis.prettierPlugins) {
            throw new Error('Prettier failed to initialize');
        }
        return globalThis.prettier;
    })();

    try {
        return await prettierReadyPromise;
    } catch (err) {
        prettierReadyPromise = null;
        return Promise.reject(err);
    }
}

async function formatWithPrettier(type, content) {
    const parserMap = {
        html: 'html',
        css: 'css',
        js: 'babel',
        json: 'json',
        react: 'babel',
        markdown: 'markdown'
    };

    const parser = parserMap[type];
    if (!parser) return null;

    try {
        const prettier = await loadPrettierOnce();
        const tabWidth = languageConfig[type]?.tabSize || 2;
        return prettier.format(content, {
            parser,
            plugins: globalThis.prettierPlugins,
            tabWidth,
            useTabs: false,
            bracketSpacing: true,
            semi: true
        });
    } catch (err) {
        addConsoleLog('warn', ['Prettier format failed, using fallback formatter.', String(err?.message || err)]);
        return null;
    }
}

async function ensureBlackLoaded(pyodide) {
    if (blackReadyPromise) return blackReadyPromise;
    blackReadyPromise = (async () => {
        await pyodide.loadPackage('micropip');
        await pyodide.runPythonAsync(
            "import micropip\nawait micropip.install('black==23.12.1')"
        );
    })();

    try {
        return await blackReadyPromise;
    } catch (err) {
        blackReadyPromise = null;
        throw err;
    }
}

async function formatPythonWithBlack(content) {
    try {
        const pyodide = await loadPyodideOnce();
        await ensureBlackLoaded(pyodide);
        const pyCode = `import black\nfrom black.mode import Mode\nresult = black.format_str(${JSON.stringify(content)}, mode=Mode())`;
        const result = await pyodide.runPythonAsync(pyCode + "\nresult");
        return typeof result === 'string' ? result : String(result);
    } catch (err) {
        addConsoleLog('warn', ['Black formatting failed, falling back.', String(err?.message || err)]);
        return null;
    }
}

function showConsoleHint(height) {
    if (!consoleResizeHint || !state.consoleVisible) return;
    consoleResizeHint.textContent = `${Math.round(height)} px`;
    consoleResizeHint.classList.add('visible');
    positionConsoleHint(height);
}

function hideConsoleHint() {
    if (!consoleResizeHint) return;
    consoleResizeHint.classList.remove('visible');
}

function positionConsoleHint(height) {
    if (!consoleResizeHint || !previewArea) return;
    const resizerHeight = consoleResizer?.offsetHeight || 0;
    const areaHeight = previewArea.clientHeight || 0;
    const offsetFromBottom = (state.consoleVisible ? height : 0) + resizerHeight + 8;
    const top = Math.max(8, areaHeight - offsetFromBottom);
    consoleResizeHint.style.top = `${top}px`;
}

function clearConsole() {
    consoleOutput.innerHTML = '';
    showToast('Console cleared', 'success');
}

// Console Input - Execute JavaScript code
function setupConsoleInput() {
    const consoleInput = document.getElementById('consoleInput');
    if (!consoleInput) return;
    
    // Command history
    const commandHistory = [];
    let historyIndex = -1;
    
    consoleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const code = consoleInput.value.trim();
            
            if (code) {
                // Add to history
                commandHistory.push(code);
                historyIndex = commandHistory.length;
                
                // Display the command in console
                logToConsole('input', code);
                
                // Execute the code
                executeConsoleCode(code);
                
                // Clear input
                consoleInput.value = '';
            }
        } else if (e.key === 'ArrowUp') {
            // Navigate history up
            e.preventDefault();
            if (commandHistory.length > 0 && historyIndex > 0) {
                historyIndex--;
                consoleInput.value = commandHistory[historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            // Navigate history down
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                consoleInput.value = commandHistory[historyIndex];
            } else {
                historyIndex = commandHistory.length;
                consoleInput.value = '';
            }
        }
    });
}

function executeConsoleCode(code) {
    try {
        // Get the preview iframe
        const previewFrame = document.getElementById('previewFrame');
        if (!previewFrame || !previewFrame.contentWindow) {
            logToConsole('error', 'Preview frame not available');
            return;
        }
        
        // Execute code in the preview iframe context
        const result = previewFrame.contentWindow.eval(code);
        
        // Log the result
        if (result !== undefined) {
            logToConsole('result', result);
        }
    } catch (error) {
        logToConsole('error', error.message || String(error));
    }
}

function logToConsole(type, content) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    let logClass = 'log';
    let icon = '📝';
    let displayContent = content;
    
    switch(type) {
        case 'input':
            logClass = 'info';
            icon = '>';
            displayContent = content;
            break;
        case 'result':
            logClass = 'log';
            icon = '←';
            displayContent = formatConsoleOutput(content);
            break;
        case 'error':
            logClass = 'error';
            icon = '✖';
            displayContent = content;
            break;
        case 'warn':
            logClass = 'warn';
            icon = '⚠';
            displayContent = content;
            break;
        case 'info':
            logClass = 'info';
            icon = 'ℹ';
            displayContent = content;
            break;
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `console-log ${logClass}`;
    logEntry.innerHTML = `
        <span class="timestamp">${timestamp}</span>
        <span>${icon}</span>
        <span>${escapeHtml(String(displayContent))}</span>
    `;
    
    consoleOutput.appendChild(logEntry);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function formatConsoleOutput(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2);
        } catch (e) {
            return String(value);
        }
    }
    return String(value);
}

// ==================== AUTO-RUN ====================
function setupAutoRun() {
    // Auto-run is handled by debounce on code change
}

function toggleRunMode() {
    state.autoRun = !state.autoRun;
    
    const runModeText = document.getElementById('runModeText');
    const autoRunIndicator = document.getElementById('autoRunIndicator');
    const runModeToggle = document.querySelector('.run-mode-toggle');
    
    if (state.autoRun) {
        // Switch to Auto mode
        if (runModeText) runModeText.textContent = 'Run mode: Auto';
        if (autoRunIndicator) {
            autoRunIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Auto Run</span>';
            autoRunIndicator.classList.add('auto-mode');
        }
        if (runModeToggle) runModeToggle.classList.add('auto-mode');
        
        showToast('Auto-run enabled! Code runs on every change.', 'success');
        
        // Run code immediately when switching to auto
        updatePreview();
    } else {
        // Switch to Manual mode
        if (runModeText) runModeText.textContent = 'Run mode: Manual';
        if (autoRunIndicator) {
            autoRunIndicator.innerHTML = '<i class="fas fa-hand-paper"></i><span>Click Run</span>';
            autoRunIndicator.classList.remove('auto-mode');
        }
        if (runModeToggle) runModeToggle.classList.remove('auto-mode');
        
        showToast('Manual mode enabled. Click Run to update.', 'info');
    }
    
    schedulePersistState();
}

// Modify onCodeChange to support auto-run
const _originalOnCodeChangeForAutoRun = onCodeChange;
onCodeChange = function(fileId) {
    _originalOnCodeChangeForAutoRun(fileId);
    
    // Auto-run if enabled
    if (state.autoRun) {
        // Debounce auto-run to avoid too many updates
        clearTimeout(window.autoRunTimeout);
        window.autoRunTimeout = setTimeout(() => {
            updatePreview();
        }, 1000); // 1 second debounce
    }
};

// ==================== TOAST NOTIFICATION ====================
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `toast ${type} show`;
    
    const icon = toast.querySelector('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' :
                    type === 'error' ? 'fas fa-exclamation-circle' :
                    type === 'warning' ? 'fas fa-exclamation-triangle' :
                    'fas fa-info-circle';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// ==================== CLEAR ALL ====================
function clearAll() {
    if (confirm('Are you sure you want to clear all code?')) {
        resetWorkspaceToDefaults();
        localStorage.removeItem(APP_STATE_KEY);
        renderEditors();
        renderFileTabs();
        renderEditorTabs();
        updatePreview();
        clearConsole();
        schedulePersistState();
        showToast('All files cleared', 'success');
    }
}

// ==================== RESIZER (Editor/Preview) ====================
function setupResizer() {
    if (!mainResizer) return;
    
    let isActive = false;
    let initialX = 0;
    let initialEditorPercent = 50;

    function handleMouseDown(event) {
        if (!state.previewVisible) return;
        
        isActive = true;
        initialX = event.pageX;
        
        // Calculate current editor percentage
        const container = document.querySelector('.main-container');
        const totalWidth = container.offsetWidth - getLeftSidebarWidth();
        initialEditorPercent = (editorArea.offsetWidth / totalWidth) * 100;
        
        mainResizer.classList.add('active');
        document.body.classList.add('resizing');
        
        event.preventDefault();
        event.stopPropagation();
    }

    function handleMouseMove(event) {
        if (!isActive) return;
        
        const container = document.querySelector('.main-container');
        const totalWidth = container.offsetWidth - getLeftSidebarWidth();
        
        const currentX = event.pageX;
        const diffX = currentX - initialX;
        const diffPercent = (diffX / totalWidth) * 100;
        
        let newEditorPercent = initialEditorPercent + diffPercent;
        
        // Limit between 25% and 75%
        if (newEditorPercent < 25) newEditorPercent = 25;
        if (newEditorPercent > 75) newEditorPercent = 75;
        
        const newPreviewPercent = 100 - newEditorPercent;
        
        editorArea.style.width = newEditorPercent + '%';
        previewArea.style.width = newPreviewPercent + '%';
        
        state.previewWidthPercent = newPreviewPercent;
    }

    function handleMouseUp() {
        if (!isActive) return;
        
        isActive = false;
        mainResizer.classList.remove('active');
        document.body.classList.remove('resizing');
        
        schedulePersistState();
    }

    function handleDoubleClick() {
        editorArea.style.width = '50%';
        previewArea.style.width = '50%';
        state.previewWidthPercent = 50;
        schedulePersistState();
        showToast('Reset to 50/50 split', 'info');
    }

    mainResizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    mainResizer.addEventListener('dblclick', handleDoubleClick);
}

// ==================== RESIZER (Sidebar) ====================
function setupSidebarResizer() {
    if (!sidebarResizer) return;
    
    let isActive = false;
    let initialX = 0;
    let initialWidth = 250;

    function handleMouseDown(event) {
        if (!state.sidebarVisible) return;
        
        isActive = true;
        initialX = event.pageX;
        initialWidth = state.sidebarWidth;
        
        sidebarResizer.classList.add('active');
        document.body.classList.add('resizing');
        
        event.preventDefault();
        event.stopPropagation();
    }

    function handleMouseMove(event) {
        if (!isActive) return;
        
        const currentX = event.pageX;
        const diffX = currentX - initialX;
        
        let newWidth = initialWidth + diffX;
        
        // Limit between min and max
        if (newWidth < SIDEBAR_MIN_WIDTH) newWidth = SIDEBAR_MIN_WIDTH;
        if (newWidth > SIDEBAR_MAX_WIDTH) newWidth = SIDEBAR_MAX_WIDTH;
        
        state.sidebarWidth = newWidth;
        
        // Apply width directly
        const totalWidth = ACTIVITY_BAR_WIDTH + newWidth;
        leftSidebar.style.width = totalWidth + 'px';
        sidebar.style.width = newWidth + 'px';
    }

    function handleMouseUp() {
        if (!isActive) return;
        
        isActive = false;
        sidebarResizer.classList.remove('active');
        document.body.classList.remove('resizing');
        
        schedulePersistState();
    }

    function handleDoubleClick() {
        state.sidebarWidth = 250;
        applySidebarLayout();
        schedulePersistState();
        showToast('Sidebar reset to default', 'info');
    }

    sidebarResizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    sidebarResizer.addEventListener('dblclick', handleDoubleClick);
}

// ==================== KEYBOARD SHORTCUTS ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const target = e.target;

        // Ctrl/Cmd + Z - Undo
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            const handled = tryHistoryAction(target, 'undo');
            if (handled) {
                e.preventDefault();
                return;
            }
        }

        // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo
        if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
            const handled = tryHistoryAction(target, 'redo');
            if (handled) {
                e.preventDefault();
                return;
            }
        }

        // Ctrl/Cmd + B - Toggle current sidebar panel (VS Code style)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            switchSidebarTab(state.activeSidebarTab);
        }

        // Ctrl/Cmd + S - Run code
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            runCode();
        }
        
        // Ctrl/Cmd + Enter - Run code
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runCode();
        }

        // Ctrl/Cmd + Shift + P - Toggle preview
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            togglePreviewArea();
        }

        // Ctrl/Cmd + Shift + F - Format current file
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            formatCurrentFile();
        }
        
        // F5 - Refresh preview
        if (e.key === 'F5') {
            e.preventDefault();
            refreshPreview();
        }
        
        // F2 - Rename active file
        if (e.key === 'F2') {
            e.preventDefault();
            if (state.activeFileId) {
                startRenameFile(state.activeFileId);
            }
        }
        
        // Escape - Close modal
        if (e.key === 'Escape') {
            closeAddFileModal();
            closeInfoModal();
            closeSnippetsModal();
            closeCollabModal();
        }
    });
}

function tryHistoryAction(target, action) {
    if (!(target instanceof HTMLTextAreaElement) || !target.id.startsWith('code-')) return false;
    const fileId = Number(target.id.replace('code-', ''));
    return action === 'undo' ? undoInEditor(fileId) : redoInEditor(fileId);
}

// ==================== THEME SWITCHER ====================
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.theme);
    schedulePersistState();
    showToast(`${state.theme === 'dark' ? 'Dark' : 'Light'} theme activated`, 'success');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// ==================== CODE SNIPPETS ====================
const codeSnippets = {
    html: [
        {
            name: 'HTML5 Boilerplate',
            description: 'Complete HTML5 starter template',
            code: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>`
        },
        {
            name: 'Responsive Card',
            description: 'Modern card component',
            code: `<div class="card">
    <img src="https://via.placeholder.com/400x200" alt="Card image">
    <div class="card-body">
        <h3>Card Title</h3>
        <p>Card description goes here.</p>
        <button>Learn More</button>
    </div>
</div>`
        },
        {
            name: 'Navigation Bar',
            description: 'Responsive navbar',
            code: `<nav class="navbar">
    <div class="logo">Brand</div>
    <ul class="nav-links">
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#contact">Contact</a></li>
    </ul>
</nav>`
        },
        {
            name: 'Contact Form',
            description: 'Simple contact form',
            code: `<form class="contact-form">
    <input type="text" placeholder="Name" required>
    <input type="email" placeholder="Email" required>
    <textarea placeholder="Message" rows="5" required></textarea>
    <button type="submit">Send</button>
</form>`
        }
    ],
    css: [
        {
            name: 'Flexbox Center',
            description: 'Center content with flexbox',
            code: `.container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
}`
        },
        {
            name: 'Grid Layout',
            description: 'Responsive grid system',
            code: `.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    padding: 20px;
}`
        },
        {
            name: 'Glassmorphism',
            description: 'Modern glass effect',
            code: `.glass {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}`
        },
        {
            name: 'Button Hover',
            description: 'Smooth button animation',
            code: `.button {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}`
        },
        {
            name: 'Gradient Text',
            description: 'Colorful gradient text',
            code: `.gradient-text {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-size: 3rem;
    font-weight: bold;
}`
        }
    ],
    js: [
        {
            name: 'Fetch API',
            description: 'Get data from API',
            code: `async function fetchData() {
    try {
        const response = await fetch('https://api.example.com/data');
        const data = await response.json();
        console.log(data);
    } catch (error) {
        console.error('Error:', error);
    }
}

fetchData();`
        },
        {
            name: 'DOM Manipulation',
            description: 'Create and append elements',
            code: `const container = document.getElementById('container');

const newElement = document.createElement('div');
newElement.className = 'item';
newElement.textContent = 'New Item';
newElement.addEventListener('click', () => {
    alert('Clicked!');
});

container.appendChild(newElement);`
        },
        {
            name: 'Local Storage',
            description: 'Save and load data',
            code: `// Save data
const data = { name: 'John', age: 30 };
localStorage.setItem('userData', JSON.stringify(data));

// Load data
const savedData = JSON.parse(localStorage.getItem('userData'));
console.log(savedData);`
        },
        {
            name: 'Debounce Function',
            description: 'Limit function calls',
            code: `function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

const handleSearch = debounce((query) => {
    console.log('Searching for:', query);
}, 500);`
        },
        {
            name: 'Array Methods',
            description: 'Common array operations',
            code: `const numbers = [1, 2, 3, 4, 5];

// Map
const doubled = numbers.map(n => n * 2);

// Filter
const evens = numbers.filter(n => n % 2 === 0);

// Reduce
const sum = numbers.reduce((acc, n) => acc + n, 0);

console.log({ doubled, evens, sum });`
        }
    ],
    python: [
        {
            name: 'List Comprehension',
            description: 'Create lists efficiently',
            code: `# List comprehension
squares = [x**2 for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]

print(squares)
print(evens)`
        },
        {
            name: 'Dictionary Operations',
            description: 'Work with dictionaries',
            code: `# Dictionary operations
person = {
    'name': 'John',
    'age': 30,
    'city': 'New York'
}

# Get value with default
age = person.get('age', 0)

# Iterate
for key, value in person.items():
    print(f"{key}: {value}")`
        },
        {
            name: 'Function Decorator',
            description: 'Simple decorator example',
            code: `def timer_decorator(func):
    import time
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"Execution time: {end - start:.4f}s")
        return result
    return wrapper

@timer_decorator
def slow_function():
    import time
    time.sleep(1)
    return "Done"

slow_function()`
        },
        {
            name: 'Class Example',
            description: 'Basic class structure',
            code: `class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def greet(self):
        return f"Hello, I'm {self.name} and I'm {self.age} years old"
    
    def birthday(self):
        self.age += 1
        return f"Happy birthday! Now {self.age} years old"

person = Person("Alice", 25)
print(person.greet())
print(person.birthday())`
        }
    ]
};

function openSnippetsModal() {
    const modal = document.getElementById('snippetsModal');
    const grid = document.getElementById('snippetsGrid');
    
    grid.innerHTML = '';
    
    Object.entries(codeSnippets).forEach(([type, snippets]) => {
        snippets.forEach(snippet => {
            const card = document.createElement('div');
            card.className = 'snippet-card';
            card.onclick = () => insertSnippet(type, snippet.code);
            
            card.innerHTML = `
                <h4>
                    <span class="snippet-badge ${type}">${type.toUpperCase()}</span>
                    ${snippet.name}
                </h4>
                <p>${snippet.description}</p>
            `;
            
            grid.appendChild(card);
        });
    });
    
    modal.classList.add('active');
}

function closeSnippetsModal() {
    const modal = document.getElementById('snippetsModal');
    modal.classList.remove('active');
}

function insertSnippet(type, code) {
    const file = state.files.find(f => f.type === type);
    
    if (file) {
        file.content = code;
        state.activeFileId = file.id;
    } else {
        const newFile = {
            id: Date.now(),
            name: `snippet${languageConfig[type].extension}`,
            type: type,
            content: code
        };
        state.files.push(newFile);
        state.activeFileId = newFile.id;
    }
    
    renderFileTabs();
    renderEditorTabs();
    renderEditors();
    updatePreview();
    closeSnippetsModal();
    showToast('Snippet inserted!', 'success');
    schedulePersistState();
}

// ==================== EXPORT AS ZIP ====================
async function exportAllAsZip() {
    if (typeof JSZip === 'undefined') {
        showToast('JSZip library not loaded', 'error');
        return;
    }
    
    const zip = new JSZip();
    
    state.files.forEach(file => {
        zip.file(file.name, file.content);
    });
    
    try {
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Project exported as ZIP!', 'success');
    } catch (error) {
        showToast('Failed to create ZIP', 'error');
        console.error(error);
    }
}

// ==================== START APPLICATION ====================
init();

// ==================== MOBILE MENU ====================
function toggleMobileMenu() {
    const menu = document.getElementById('headerActions');
    const toggle = document.querySelector('.mobile-menu-toggle');
    
    if (menu) {
        menu.classList.toggle('active');
    }
    
    if (toggle) {
        toggle.classList.toggle('active');
    }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('leftSidebar');
    if (sidebar) {
        sidebar.classList.toggle('mobile-visible');
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('headerActions');
    const toggle = document.querySelector('.mobile-menu-toggle');
    
    if (menu && toggle && menu.classList.contains('active')) {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) {
            menu.classList.remove('active');
            toggle.classList.remove('active');
        }
    }
});

// Close mobile sidebar when selecting a file
const originalSwitchFile = switchFile;
switchFile = function(fileId) {
    originalSwitchFile(fileId);
    
    // Close sidebar on mobile after selecting file
    if (window.innerWidth <= 1024) {
        const sidebar = document.getElementById('leftSidebar');
        if (sidebar) {
            sidebar.classList.remove('mobile-visible');
        }
    }
};

// ==================== LIVE COLLABORATION ====================
let collabChannel = null;
let broadcastChannel = null;
let isBroadcastSyncEnabled = false;
let peerConnection = null;
let dataChannel = null;
let roomCode = null;
let isCollabConnected = false;
let peer = null;
let conn = null;

function openCollabModal() {
    const modal = document.getElementById('collabModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeCollabModal() {
    const modal = document.getElementById('collabModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function switchCollabTab(tab) {
    document.querySelectorAll('.collab-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.collab-panel').forEach(p => p.classList.remove('active'));
    
    const tabBtn = document.querySelector(`.collab-tab[onclick*="${tab}"]`);
    const panel = document.getElementById(`${tab}Panel`);
    
    if (tabBtn) tabBtn.classList.add('active');
    if (panel) panel.classList.add('active');
}

// ==================== BROADCAST CHANNEL (Same Browser Tabs) ====================
function toggleBroadcastSync() {
    if (isBroadcastSyncEnabled) {
        disableBroadcastSync();
    } else {
        enableBroadcastSync();
    }
}

function enableBroadcastSync() {
    if (!window.BroadcastChannel) {
        showCollabStatus('broadcast', 'BroadcastChannel not supported in this browser', 'error');
        return;
    }
    
    broadcastChannel = new BroadcastChannel('live_compiler_collab');
    
    broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data;
        
        if (type === 'sync-state') {
            // Don't sync if we're the sender
            if (data.senderId === getTabId()) return;
            
            state.files = data.files;
            state.activeFileId = data.activeFileId;
            renderFileTabs();
            renderEditorTabs();
            renderEditors();
            updatePreview();
            showCollabStatus('broadcast', `Synced from another tab`, 'success');
        }
        
        if (type === 'code-change') {
            if (data.senderId === getTabId()) return;
            
            const file = state.files.find(f => f.id === data.fileId);
            if (file) {
                file.content = data.content;
                const textarea = document.getElementById(`code-${data.fileId}`);
                if (textarea) {
                    textarea.value = data.content;
                    updateLineNumbers(data.fileId);
                }
                updatePreview();
            }
        }
    };
    
    isBroadcastSyncEnabled = true;
    document.getElementById('broadcastBtnText').textContent = 'Disable Tab Sync';
    document.getElementById('collabIcon').classList.add('connected');
    showCollabStatus('broadcast', 'Tab sync enabled! Open this page in another tab to collaborate.', 'success');
    
    // Broadcast current state
    broadcastSyncState();
}

function disableBroadcastSync() {
    if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
    }
    
    isBroadcastSyncEnabled = false;
    document.getElementById('broadcastBtnText').textContent = 'Enable Tab Sync';
    document.getElementById('collabIcon').classList.remove('connected');
    showCollabStatus('broadcast', 'Tab sync disabled', 'info');
}

function broadcastSyncState() {
    if (!broadcastChannel || !isBroadcastSyncEnabled) return;
    
    broadcastChannel.postMessage({
        type: 'sync-state',
        data: {
            senderId: getTabId(),
            files: state.files,
            activeFileId: state.activeFileId
        }
    });
}

function broadcastCodeChange(fileId, content) {
    if (!broadcastChannel || !isBroadcastSyncEnabled) return;
    
    broadcastChannel.postMessage({
        type: 'code-change',
        data: {
            senderId: getTabId(),
            fileId: fileId,
            content: content
        }
    });
}

function getTabId() {
    let tabId = sessionStorage.getItem('tabId');
    if (!tabId) {
        tabId = 'tab_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('tabId', tabId);
    }
    return tabId;
}

// ==================== WEBRTC P2P COLLABORATION (Using PeerJS) ====================

// Collaboration session storage
const COLLAB_SESSION_KEY = 'collabSessionData';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer = null;

function saveCollabSession(role, code) {
    try {
        sessionStorage.setItem(COLLAB_SESSION_KEY, JSON.stringify({
            role: role, // 'host' or 'guest'
            roomCode: code,
            timestamp: Date.now()
        }));
    } catch (err) {
        console.error('Failed to save collab session:', err);
    }
}

function getCollabSession() {
    try {
        const data = sessionStorage.getItem(COLLAB_SESSION_KEY);
        if (!data) return null;
        
        const session = JSON.parse(data);
        // Session expires after 1 hour
        if (Date.now() - session.timestamp > 3600000) {
            sessionStorage.removeItem(COLLAB_SESSION_KEY);
            return null;
        }
        return session;
    } catch (err) {
        return null;
    }
}

function clearCollabSession() {
    sessionStorage.removeItem(COLLAB_SESSION_KEY);
}

function attemptReconnect() {
    const session = getCollabSession();
    if (!session || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        showCollabStatus('webrtc', '❌ Reconnection failed. Please create/join room again.', 'error');
        clearCollabSession();
        return;
    }
    
    reconnectAttempts++;
    showCollabStatus('webrtc', `🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'info');
    
    reconnectTimer = setTimeout(() => {
        if (session.role === 'host') {
            createCollabRoom(session.roomCode);
        } else {
            document.getElementById('joinRoomCode').value = session.roomCode;
            joinCollabRoom();
        }
    }, 2000 * reconnectAttempts); // Exponential backoff
}

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase() + 
           Math.random().toString(36).substr(2, 6).toUpperCase();
}

function createCollabRoom(existingCode = null) {
    // Check if PeerJS is loaded
    if (typeof Peer === 'undefined') {
        showCollabStatus('webrtc', 'Loading PeerJS library... Please wait.', 'info');
        loadPeerJS().then(() => {
            showCollabStatus('webrtc', 'PeerJS loaded! Click Create Room again.', 'success');
        }).catch(err => {
            showCollabStatus('webrtc', 'Failed to load PeerJS. Please refresh the page.', 'error');
            console.error('PeerJS load error:', err);
        });
        return;
    }
    
    // Prompt for username if not already set
    let username = prompt('Enter your username for collaboration:');
    if (!username || !username.trim()) {
        showCollabStatus('webrtc', '❌ Username is required to create a room', 'error');
        return;
    }
    username = username.trim();
    
    try {
        roomCode = existingCode || generateRoomCode();
        
        // Create PeerJS peer with room code as ID
        peer = new Peer(roomCode, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });
        
        peer.on('open', (id) => {
            const display = document.getElementById('roomCodeDisplay');
            const codeEl = document.getElementById('roomCode');
            if (display && codeEl) {
                display.style.display = 'block';
                codeEl.textContent = id;
            }
            showCollabStatus('webrtc', `✅ Room created! Share code: ${id}`, 'success');
            saveCollabSession('host', id);
            reconnectAttempts = 0;
            
            // Auto-connect to chat with the same room code
            if (window.socketClient && window.socketClient.isConnected()) {
                window.socketClient.authenticate(username, id);
                showToast('Connected to chat room', 'success');
            }
        });
        
        peer.on('connection', (connection) => {
            conn = connection;
            setupPeerConnection();
            showCollabStatus('webrtc', '✅ Peer connected! Start collaborating.', 'success');
        });
        
        peer.on('disconnected', () => {
            showCollabStatus('webrtc', '⚠️ Connection lost. Attempting to reconnect...', 'info');
            attemptReconnect();
        });
        
        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            showCollabStatus('webrtc', `❌ Error: ${err.type} - ${err.message || 'Connection failed'}`, 'error');
            if (err.type === 'network' || err.type === 'disconnected') {
                attemptReconnect();
            }
        });
    } catch (err) {
        console.error('Failed to create room:', err);
        showCollabStatus('webrtc', '❌ Failed to create room. Please try again.', 'error');
    }
}

function joinCollabRoom() {
    // Check if PeerJS is loaded
    if (typeof Peer === 'undefined') {
        showCollabStatus('webrtc', 'Loading PeerJS library... Please wait.', 'info');
        loadPeerJS().then(() => {
            showCollabStatus('webrtc', 'PeerJS loaded! Try joining again.', 'success');
        }).catch(err => {
            showCollabStatus('webrtc', 'Failed to load PeerJS. Please refresh the page.', 'error');
            console.error('PeerJS load error:', err);
        });
        return;
    }
    
    const codeInput = document.getElementById('joinRoomCode');
    if (!codeInput) {
        console.error('Join room code input not found');
        return;
    }
    
    const code = codeInput.value.trim().toUpperCase();
    
    if (!code || code.length !== 12) {
        showCollabStatus('webrtc', '❌ Please enter a valid 12-character room code', 'error');
        return;
    }
    
    // Prompt for username if not already set
    let username = prompt('Enter your username for collaboration:');
    if (!username || !username.trim()) {
        showCollabStatus('webrtc', '❌ Username is required to join a room', 'error');
        return;
    }
    username = username.trim();
    
    try {
        // Create peer and connect to room
        peer = new Peer({
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });
        
        peer.on('open', () => {
            showCollabStatus('webrtc', '🔄 Connecting to room...', 'info');
            conn = peer.connect(code, { reliable: true });
            setupPeerConnection();
            saveCollabSession('guest', code);
            
            // Auto-connect to chat with the same room code
            if (window.socketClient && window.socketClient.isConnected()) {
                window.socketClient.authenticate(username, code);
                showToast('Connected to chat room', 'success');
            }
        });
        
        peer.on('disconnected', () => {
            showCollabStatus('webrtc', '⚠️ Connection lost. Attempting to reconnect...', 'info');
            attemptReconnect();
        });
        
        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (err.type === 'peer-unavailable') {
                showCollabStatus('webrtc', '❌ Room not found. Check the code and make sure the room is still open.', 'error');
            } else {
                showCollabStatus('webrtc', `❌ Error: ${err.type} - ${err.message || 'Connection failed'}`, 'error');
            }
            if (err.type === 'network' || err.type === 'disconnected') {
                attemptReconnect();
            }
        });
    } catch (err) {
        console.error('Failed to join room:', err);
        showCollabStatus('webrtc', '❌ Failed to join room. Please try again.', 'error');
    }
}

function disconnectCollab() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    if (conn) {
        conn.close();
        conn = null;
    }
    
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    isCollabConnected = false;
    document.getElementById('collabIcon').classList.remove('connected');
    clearCollabSession();
    reconnectAttempts = 0;
    
    // Also disconnect from chat
    if (window.socketClient) {
        window.socketClient.disconnect();
    }
    
    const display = document.getElementById('roomCodeDisplay');
    if (display) {
        display.style.display = 'none';
    }
    
    const actions = document.getElementById('collabActions');
    if (actions) {
        actions.style.display = 'none';
    }
    
    showCollabStatus('webrtc', 'Disconnected from collaboration session.', 'info');
}

function manualReconnect() {
    const session = getCollabSession();
    if (!session) {
        showCollabStatus('webrtc', '❌ No session to reconnect. Please create or join a room.', 'error');
        return;
    }
    
    reconnectAttempts = 0;
    showCollabStatus('webrtc', '🔄 Reconnecting...', 'info');
    
    if (session.role === 'host') {
        createCollabRoom(session.roomCode);
    } else {
        document.getElementById('joinRoomCode').value = session.roomCode;
        joinCollabRoom();
    }
}

function setupPeerConnection() {
    if (!conn) return;
    
    conn.on('open', () => {
        isCollabConnected = true;
        document.getElementById('collabIcon').classList.add('connected');
        showCollabStatus('webrtc', '✅ Connected! You can now collaborate in real-time.', 'success');
        reconnectAttempts = 0;
        
        // Show disconnect/reconnect buttons
        const actions = document.getElementById('collabActions');
        if (actions) {
            actions.style.display = 'block';
        }
        
        // Send current state
        sendCollabMessage({
            type: 'sync-state',
            data: {
                files: state.files,
                activeFileId: state.activeFileId
            }
        });
    });
    
    conn.on('data', (data) => {
        handleCollabMessage(data);
    });
    
    conn.on('close', () => {
        isCollabConnected = false;
        document.getElementById('collabIcon').classList.remove('connected');
        showCollabStatus('webrtc', 'Disconnected from peer.', 'info');
        
        const actions = document.getElementById('collabActions');
        if (actions) {
            actions.style.display = 'none';
        }
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        showCollabStatus('webrtc', 'Connection error occurred.', 'error');
    });
}

function loadPeerJS() {
    return new Promise((resolve, reject) => {
        if (typeof Peer !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
        script.onload = () => {
            console.log('PeerJS loaded successfully');
            resolve();
        };
        script.onerror = () => {
            reject(new Error('Failed to load PeerJS'));
        };
        document.head.appendChild(script);
    });
}

function sendCollabMessage(message) {
    if (conn && conn.open) {
        try {
            conn.send(message);
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    }
}

function handleCollabMessage(message) {
    if (!message || !message.type) return;
    
    const { type, data } = message;
    
    if (type === 'sync-state' && data) {
        state.files = data.files;
        state.activeFileId = data.activeFileId;
        renderFileTabs();
        renderEditorTabs();
        renderEditors();
        updatePreview();
        showToast('Synced from peer!', 'success');
    }
    
    if (type === 'code-change' && data) {
        const file = state.files.find(f => f.id === data.fileId);
        if (file) {
            file.content = data.content;
            
            // Update CodeMirror editor if exists
            const editor = editorInstances.get(data.fileId);
            if (editor) {
                const currentContent = editor.state.doc.toString();
                if (currentContent !== data.content) {
                    const transaction = editor.state.update({
                        changes: {
                            from: 0,
                            to: editor.state.doc.length,
                            insert: data.content
                        }
                    });
                    editor.dispatch(transaction);
                }
            } else {
                // Fallback to textarea
                const textarea = document.getElementById(`code-${data.fileId}`);
                if (textarea) {
                    textarea.value = data.content;
                    updateLineNumbers(data.fileId);
                }
            }
            updatePreview();
        }
    }
}

function sendCodeChange(fileId, content) {
    // Broadcast to same-browser tabs
    broadcastCodeChange(fileId, content);
    
    // Send via WebRTC if connected
    sendCollabMessage({
        type: 'code-change',
        data: {
            fileId: fileId,
            content: content
        }
    });
}

function copyRoomCode() {
    const code = document.getElementById('roomCode').textContent;
    if (!code) {
        showToast('No room code to copy', 'error');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        showToast('Room code copied!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy code', 'error');
    });
}

function showCollabStatus(panel, message, type) {
    const statusId = panel === 'webrtc' ? 'collabStatus' : 'broadcastStatus';
    const status = document.getElementById(statusId);
    if (status) {
        status.textContent = message;
        status.className = `collab-status ${type}`;
    } else {
        console.warn(`Status element ${statusId} not found`);
    }
}

// Override onCodeChange to broadcast changes
const _originalOnCodeChange = onCodeChange;
onCodeChange = function(fileId) {
    _originalOnCodeChange(fileId);
    
    const file = state.files.find(f => f.id === fileId);
    if (file) {
        sendCodeChange(fileId, file.content);
    }
    
    // Broadcast state to other tabs
    broadcastSyncState();
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (peer) {
        peer.destroy();
    }
    if (broadcastChannel) {
        broadcastChannel.close();
    }
});
// ==================== CHAT ====================
// All chat UI logic and onclick handlers live in socket-client.js.
// switchSidebarTab() (above) calls window.socketClient.clearNotifications()
// when the chat tab is opened.
