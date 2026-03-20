import { GoogleGenerativeAI } from "@google/generative-ai";

// Elements
const apiKeyInput = document.getElementById('api-key');
const languageSelect = document.getElementById('language-select');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');

const visualInput = document.getElementById('visual-input');
const audioInput = document.getElementById('audio-input');
const visualUploadBox = document.getElementById('visual-upload-box');
const audioUploadBox = document.getElementById('audio-upload-box');
const visualPreview = document.getElementById('visual-preview');
const audioPreview = document.getElementById('audio-preview');
const audioFilename = document.getElementById('audio-filename');
const analyzeBtn = document.getElementById('analyze-btn');

const inputLayer = document.getElementById('input-layer');
const loadingState = document.getElementById('loading-state');
const dashboard = document.getElementById('dashboard');
const resetBtn = document.getElementById('reset-btn');

// Dashboard UI elements
const actionCard = document.getElementById('immediate-action-card');
const actionIcon = document.getElementById('action-icon');
const actionText = document.getElementById('action-text');
const actionDetails = document.getElementById('action-details');
const actionSources = document.getElementById('action-sources');
const threatBlip = document.getElementById('threat-blip');
const threatDistance = document.getElementById('threat-distance');
const threatEta = document.getElementById('threat-eta');
const marketArrow = document.getElementById('market-arrow');
const marketAdvice = document.getElementById('market-advice');
const marketReason = document.getElementById('market-reason');

let visualFile = null;
let audioFile = null;

// Initialize
function init() {
    const savedKey = localStorage.getItem('agropulse_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
        settingsPanel.classList.add('hidden');
    } else {
        settingsPanel.classList.remove('hidden');
    }

    const savedLang = localStorage.getItem('agropulse_lang');
    if (savedLang) languageSelect.value = savedLang;
}

// Event Listeners
settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
    localStorage.setItem('agropulse_api_key', apiKeyInput.value.trim());
    localStorage.setItem('agropulse_lang', languageSelect.value);
    settingsPanel.classList.add('hidden');
    alert("Settings saved successfully.");
});

visualInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        visualFile = e.target.files[0];
        visualUploadBox.classList.add('has-file');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            visualPreview.innerHTML = `<img src="${e.target.result}" alt="Crop Preview"><span><i class="fa-solid fa-check"></i> Image Ready</span>`;
            visualPreview.classList.remove('hidden');
        };
        reader.readAsDataURL(visualFile);
        checkReady();
    }
});

audioInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        audioFile = e.target.files[0];
        audioUploadBox.classList.add('has-file');
        audioFilename.textContent = audioFile.name;
        audioPreview.classList.remove('hidden');
        checkReady();
    }
});

resetBtn.addEventListener('click', () => {
    visualFile = null;
    audioFile = null;
    
    // Reset visual
    visualInput.value = '';
    visualUploadBox.classList.remove('has-file');
    visualPreview.classList.add('hidden');
    visualPreview.innerHTML = '';
    
    // Reset audio
    audioInput.value = '';
    audioUploadBox.classList.remove('has-file');
    audioPreview.classList.add('hidden');
    
    dashboard.classList.add('hidden');
    inputLayer.classList.remove('hidden');
    analyzeBtn.classList.add('disabled');
    checkReady();
});

function checkReady() {
    if (visualFile || audioFile) {
        analyzeBtn.classList.remove('disabled');
    } else {
        analyzeBtn.classList.add('disabled');
    }
}

// Convert File to Generative Part
async function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Core Analysis Logic
analyzeBtn.addEventListener('click', async () => {
    if (analyzeBtn.classList.contains('disabled')) return;
    
    const apiKey = localStorage.getItem('agropulse_api_key');
    if (!apiKey) {
        alert("Please configure your Gemini API Key in the settings first.");
        settingsPanel.classList.remove('hidden');
        return;
    }

    const targetLanguage = localStorage.getItem('agropulse_lang') || 'English';

    inputLayer.querySelector('.upload-grid').classList.add('hidden');
    analyzeBtn.classList.add('hidden');
    loadingState.classList.remove('hidden');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Using 1.5 Pro to handle both image and audio multimodal inputs natively
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        const prompt = `
        You are the 'AgroPulse Universal Bridge', an AI proxy for rural farmers.
        You take unstructured "messy" data (photos of sick crops, audio snippets of local news) and output highly structured, life-saving agricultural actions.
        
        Analyze any provided images (for crop health, pests, blight, nutrient deficiency) AND/OR any provided audio files (for news about weather, pests, or market prices).
        If no image is provided, guess the context strictly from audio. If no audio, guess strictly from image.
        Synthesize the data into a clear emergency dashboard structure.

        IMPORTANT: Your response MUST be valid JSON only, without markdown formatting blocks (like \`\`\`json). The JSON must match the following schema:
        {
            "status": "DANGER" | "WARNING" | "SAFE",
            "action": {
                "headline": "A short, bold instruction (e.g., SPRAY NEEM OIL NOW, HARVEST IMMEDIATELY)",
                "details": "A 1-2 sentence explanation of why, considering both the crop condition and weather/threat factors.",
                "verification_source": "E.g., Local Radio Broadcast & Botanical Database"
            },
            "threat": {
                "has_threat": true or false,
                "distance_km": number (or 0 if none),
                "eta_hours": number (or 0 if none),
                "angle": number (0-360 degrees for UI radar mapping)
            },
            "market": {
                "advice": "SELL" | "HOLD" | "WARN",
                "reasoning": "Short context on current market based on the audio news."
            }
        }

        Translate ALL human-readable text (headline, details, verification_source, advice, reasoning) into ${targetLanguage}.
        `;

        const parts = [prompt];
        if (visualFile) {
            parts.push(await fileToGenerativePart(visualFile));
        }
        if (audioFile) {
            parts.push(await fileToGenerativePart(audioFile));
        }

        const result = await model.generateContent(parts);
        const responseText = result.response.text();
        
        // Clean JSON safely in case of markdown block formatting returned by model
        let cleanJsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJsonStr);

        updateDashboard(data);

        loadingState.classList.add('hidden');
        inputLayer.classList.add('hidden');
        inputLayer.querySelector('.upload-grid').classList.remove('hidden');
        analyzeBtn.classList.remove('hidden');
        dashboard.classList.remove('hidden');

    } catch (error) {
        console.error("Analysis Error:", error);
        alert("An error occurred during analysis. Check the console, verify your API key, and ensure the files are supported.");
        
        loadingState.classList.add('hidden');
        inputLayer.querySelector('.upload-grid').classList.remove('hidden');
        analyzeBtn.classList.remove('hidden');
    }
});

function updateDashboard(data) {
    // 1. Immediate Action
    actionCard.className = 'card status-card'; // reset
    actionText.textContent = data.action.headline;
    actionDetails.textContent = data.action.details;
    actionSources.textContent = data.action.verification_source;

    let uiStateClass = 'state-safe';
    let iconClass = 'fa-check-circle';
    
    if (data.status === 'DANGER') {
        uiStateClass = 'state-danger';
        iconClass = 'fa-skull-crossbones';
    } else if (data.status === 'WARNING') {
        uiStateClass = 'state-warning';
        iconClass = 'fa-triangle-exclamation';
    }
    
    actionCard.classList.add(uiStateClass);
    actionIcon.className = `fa-solid ${iconClass}`;

    // 2. Threat Map
    if (data.threat.has_threat) {
        threatBlip.classList.remove('hidden');
        // Simple trigonometric placement for the "blip" radar UI
        const rad = data.threat.angle * (Math.PI / 180);
        const distancePercent = Math.min((data.threat.distance_km / 100) * 50, 45); // Scale up to 45% radius
        const x = 50 + (distancePercent * Math.sin(rad));
        const y = 50 - (distancePercent * Math.cos(rad));
        
        threatBlip.style.left = `${x}%`;
        threatBlip.style.top = `${y}%`;
        
        threatDistance.textContent = `${data.threat.distance_km} km`;
        threatEta.textContent = `${data.threat.eta_hours} hrs`;
    } else {
        threatBlip.classList.add('hidden');
        threatDistance.textContent = `-- km`;
        threatEta.textContent = `-- hrs`;
    }

    // 3. Profit Optimizer
    marketAdvice.textContent = data.market.advice;
    marketReason.textContent = data.market.reasoning;
    
    marketArrow.className = 'indicator-arrow';
    if (data.market.advice === 'SELL') {
        marketArrow.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
        marketArrow.classList.add('up');
        marketAdvice.className = 'advice-sell';
    } else if (data.market.advice === 'HOLD') {
        marketArrow.innerHTML = '<i class="fa-solid fa-minus"></i>';
        marketArrow.classList.add('neutral');
        marketAdvice.className = 'advice-hold';
    } else {
        marketArrow.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
        marketArrow.classList.add('down');
        marketAdvice.className = 'advice-warn';
    }
}

// Startup
init();
