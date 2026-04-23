// ── CLOCK ──
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('clock').textContent = h + ':' + m;
}
updateClock();
setInterval(updateClock, 10000);

// ── NAVIGATION ──
let currentScreen = 's-home';
let currentNav = 'nav-home';
const history = [];

function goTo(screenId) {
  if (screenId === currentScreen) return;
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  prev.classList.add('slide-out');
  next.classList.add('active');
  setTimeout(() => prev.classList.remove('active','slide-out'), 380);
  // câmera: desliga ao sair, liga ao entrar
  if (currentScreen === 's-cam') stopCamera();
  history.push(currentScreen);
  currentScreen = screenId;
  if (screenId === 's-cam') startCamera();
  // sync nav
  const navMap = { 's-home':'nav-home','s-cam':'nav-cam','s-resumo':'nav-resumo','s-inet':'nav-inet','s-config':'nav-config' };
  if (navMap[screenId]) setActiveNav(navMap[screenId]);
}

function goBack() {
  if (history.length === 0) return;
  const prev = history.pop();
  const curr = document.getElementById(currentScreen);
  const target = document.getElementById(prev);
  curr.classList.remove('active');
  target.classList.add('active');
  if (currentScreen === 's-cam') stopCamera();
  currentScreen = prev;
  if (prev === 's-cam') startCamera();
  const navMap = { 's-home':'nav-home','s-cam':'nav-cam','s-resumo':'nav-resumo','s-inet':'nav-inet','s-config':'nav-config' };
  if (navMap[prev]) setActiveNav(navMap[prev]);
}

function setActiveNav(navId) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  document.getElementById(navId).classList.add('on');
  currentNav = navId;
}

function navTo(screenId, navId) {
  history.length = 0;
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (prev === next) return;
  if (currentScreen === 's-cam') stopCamera();
  prev.classList.remove('active');
  next.classList.add('active');
  currentScreen = screenId;
  if (screenId === 's-cam') startCamera();
  setActiveNav(navId);
  if (screenId === 's-resumo') document.getElementById('badge-resumo').classList.remove('show');
}

// ── MODE TOGGLE ──
let modeOn = false;
let modeSeconds = 0;
let modeTimer = null;

function toggleMode() {
  modeOn = !modeOn;
  const toggle = document.getElementById('main-toggle');
  const modeText = document.getElementById('mode-text');
  const focusRing = document.getElementById('focus-ring');

  toggle.classList.toggle('on', modeOn);
  modeText.textContent = modeOn ? 'Ativado' : 'Desativado';
  modeText.classList.toggle('on', modeOn);
  focusRing.classList.toggle('on', modeOn);

  if (modeOn) {
    modeSeconds = 0;
    modeTimer = setInterval(() => {
      modeSeconds++;
      const h = Math.floor(modeSeconds / 3600);
      const m = Math.floor((modeSeconds % 3600) / 60);
      const s = modeSeconds % 60;
      let display = '';
      if (h > 0) display = h + 'h ' + m + 'm';
      else if (m > 0) display = m + 'm ' + s + 's';
      else display = s + 's';
      document.getElementById('stat-time').textContent = display;
    }, 1000);
    showNotif('Modo Estudo ativado! 🎓');
  } else {
    clearInterval(modeTimer);
    document.getElementById('stat-time').textContent = '0h';
    showNotif('Modo Estudo desativado');
  }
}

// ── CAMERA REAL ──
const GEMINI_KEY = 'AIzaSyDWRecM1lWj1lT0Y7HmVLu34kkOqhmA8YE';
let cameraStream = null;

async function startCamera() {
  const video = document.getElementById('cam-video');
  const fallback = document.getElementById('vf-fallback');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    cameraStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    if (fallback) fallback.style.display = 'none';
  } catch (err) {
    console.warn('Câmera não disponível:', err);
    video.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

async function captureFrame() {
  const video = document.getElementById('cam-video');
  const canvas = document.getElementById('cam-canvas');

  // Se não tem stream ativo, retorna null (vai cair no fallback)
  if (!video.srcObject) return null;

  // Espera o vídeo estar realmente pronto (até 3s)
  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('video timeout')), 3000);
      video.addEventListener('canplay', () => { clearTimeout(timeout); resolve(); }, { once: true });
    }).catch(() => null);
  }

  // Ainda não pronto após espera
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function analyzeWithGemini(base64Image) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  const prompt = `Você é um assistente de estudos. Analise esta imagem de um quadro ou caderno escolar e retorne um JSON com exatamente esta estrutura (sem markdown, apenas JSON puro):
{
  "materia": "nome da matéria identificada",
  "topico": "nome do tópico principal",
  "conceito": "explicação do conceito principal em 2-3 frases",
  "pontos": [
    {"titulo": "título do ponto 1", "texto": "explicação"},
    {"titulo": "título do ponto 2", "texto": "explicação"},
    {"titulo": "título do ponto 3", "texto": "explicação"}
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
Se não conseguir identificar conteúdo escolar, use materia:"Geral" e resuma o que vê.`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  // limpa possível markdown ```json ... ```
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function populateResumoFromAI(aiData, elapsedSec) {
  // Header
  const sub = `${aiData.materia} · ${aiData.topico} · agora`;
  const subEl = document.getElementById('resumo-sub');
  if (subEl) subEl.textContent = sub;

  // Photo name
  const photoEl = document.getElementById('resumo-photo-name');
  if (photoEl) photoEl.textContent = `Quadro_${aiData.materia.replace(/\s/g,'')}_IA.jpg`;

  // Stats
  const precEl = document.getElementById('resumo-precision');
  if (precEl) precEl.textContent = '98%';
  const timeEl = document.getElementById('resumo-time');
  if (timeEl) timeEl.textContent = elapsedSec + 's';
  const cntEl = document.getElementById('resumo-concepts-count');
  if (cntEl) cntEl.textContent = aiData.pontos?.length || 3;

  // Conceito principal
  const conceptEl = document.getElementById('resumo-concept');
  if (conceptEl) conceptEl.innerHTML = aiData.conceito || '';

  // Pontos-chave
  const kpList = document.getElementById('resumo-keypoints');
  if (kpList && aiData.pontos) {
    kpList.innerHTML = '';
    aiData.pontos.forEach((pt, i) => {
      kpList.innerHTML += `
        <div class="kp-item">
          <div class="kp-num">${i + 1}</div>
          <div class="kp-text"><em>${pt.titulo}</em> — ${pt.texto}</div>
        </div>`;
    });
  }

  // Tags
  const tagCloud = document.getElementById('resumo-tags');
  if (tagCloud && aiData.tags) {
    const colors = ['purple', 'green', 'yellow'];
    tagCloud.innerHTML = aiData.tags.map((tag, i) =>
      `<span class="tag ${colors[i % 3]}">${tag}</span>`
    ).join('');
  }
}

// ── CAMERA / SHOOT ──
async function shootPhoto() {
  const overlay  = document.getElementById('ai-overlay');
  const shutter  = document.getElementById('shutter-inner');
  const procText = document.getElementById('ai-proc-text');
  const procSub  = document.getElementById('ai-proc-sub');

  // Flash visual
  shutter.style.background = '#fff';
  shutter.style.boxShadow  = '0 0 30px rgba(255,255,255,0.8)';
  setTimeout(() => { shutter.style.background = ''; shutter.style.boxShadow = ''; }, 150);

  // Mostra overlay imediatamente
  overlay.classList.add('show');
  if (procText) procText.textContent = 'Capturando imagem...';
  if (procSub)  procSub.textContent  = 'Aguarde um momento';

  const t0 = Date.now();

  try {
    // Captura frame (agora async, espera vídeo ficar pronto)
    const base64 = await captureFrame();

    let aiData;

    if (base64) {
      // CÂMERA REAL: chama Gemini Vision
      if (procText) procText.textContent = 'Analisando com Gemini IA';
      if (procSub)  procSub.textContent  = 'Lendo conteúdo do quadro...';
      aiData = await analyzeWithGemini(base64);
    } else {
      // FALLBACK: câmera não capturou, usa mock
      if (procText) procText.textContent = 'Processando com IA';
      if (procSub)  procSub.textContent  = 'Usando modo demonstração...';
      await new Promise(r => setTimeout(r, 2000));
      aiData = {
        materia: 'Física', topico: 'Leis de Newton',
        conceito: 'As <strong>3 Leis de Newton</strong> descrevem o movimento dos corpos e a relação entre força e aceleração. São a base da mecânica clássica.',
        pontos: [
          { titulo: '1ª Lei (Inércia)',       texto: 'Um corpo em repouso permanece em repouso a menos que uma força atue sobre ele.' },
          { titulo: '2ª Lei (F = ma)',         texto: 'A força resultante é igual à massa multiplicada pela aceleração.' },
          { titulo: '3ª Lei (Ação e Reação)', texto: 'Para toda ação existe uma reação de mesma intensidade e sentido oposto.' }
        ],
        tags: ['Inércia', 'F = ma', 'Ação-reação', 'Mecânica', 'Aceleração']
      };
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    populateResumoFromAI(aiData, elapsed);

    overlay.classList.remove('show');
    document.getElementById('badge-resumo').classList.add('show');
    goTo('s-resumo');
    showNotif('Resumo gerado com IA! ✨');

  } catch (err) {
    console.error('Erro ao processar:', err);
    overlay.classList.remove('show');

    let msg = 'Erro ao processar. Tente novamente.';
    if (err.message && err.message.includes('429')) msg = 'Limite da API atingido. Tente em 1 minuto.';
    else if (err.message && err.message.includes('400')) msg = 'Imagem muito escura ou ilegível. Tente novamente.';
    else if (err.message && err.message.includes('fetch')) msg = 'Sem conexão com a internet.';
    else if (err.message && err.message.includes('JSON')) msg = 'Resposta inesperada da IA. Tente novamente.';

    showNotif(msg, '❌');
  }
}

// ── DYNAMIC ISLAND NOTIFICATIONS ──
let notifTimeout;
const diIcons = {
  'estudo': '🎓', 'desativado': '✋', 'resumo': '✨',
  'salvo': '💾', 'flash': '⚡', 'padr': '🔔'
};
function showNotif(msg, icon) {
  const island = document.getElementById('di-island');
  const textEl  = document.getElementById('di-text');
  const iconEl  = document.getElementById('di-icon');
  // pick icon automatically if not given
  if (!icon) {
    const key = Object.keys(diIcons).find(k => msg.toLowerCase().includes(k));
    icon = key ? diIcons[key] : '🔔';
  }
  iconEl.textContent = icon;
  textEl.textContent = msg;
  island.classList.remove('di-hide');
  island.classList.add('di-show');
  clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => {
    island.classList.remove('di-show');
    island.classList.add('di-hide');
  }, 3400);
}
function hideNotif() {
  const island = document.getElementById('di-island');
  island.classList.remove('di-show');
  island.classList.add('di-hide');
}

// ── SLIDER ──
function updateSlider(val) {
  const h = Math.floor(val / 60);
  const m = val % 60;
  document.getElementById('slider-val').textContent = m === 0 ? h + 'h' : h + 'h ' + m + 'm';
}

// ── CONFIG TOGGLE ──
function toggleCR(el) {
  el.classList.toggle('on');
  const ball = el.querySelector('.toggle-ball');
  ball.style.transform = el.classList.contains('on') ? 'translateX(20px)' : 'translateX(0)';
}

// ── IDIOMA DO RESUMO ──
let selectedLang = { code: 'PT-BR', name: 'Português Brasileiro' };

function openLangModal() {
  document.getElementById('lang-overlay').classList.add('show');
  document.getElementById('lang-sheet').classList.add('show');
  // highlight current
  document.querySelectorAll('.lang-item').forEach(el => {
    const isSelected = el.dataset.code === selectedLang.code;
    el.classList.toggle('lang-item-active', isSelected);
    el.querySelector('.lang-check').textContent = isSelected ? '✓' : '';
  });
}

function closeLangModal() {
  document.getElementById('lang-overlay').classList.remove('show');
  document.getElementById('lang-sheet').classList.remove('show');
}

function selectLang(el) {
  // remove previous
  document.querySelectorAll('.lang-item').forEach(i => {
    i.classList.remove('lang-item-active');
    i.querySelector('.lang-check').textContent = '';
  });
  // set new
  el.classList.add('lang-item-active');
  el.querySelector('.lang-check').textContent = '✓';
  selectedLang = { code: el.dataset.code, name: el.dataset.name };
  // update config row display immediately
  document.getElementById('lang-val').textContent = selectedLang.code;
  document.getElementById('lang-desc').textContent = selectedLang.name;
  // small haptic-like flash
  el.style.transition = 'background 0.1s';
}

// ── DYNAMIC GREETING ──
(function() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Bom dia 👋' : h < 18 ? 'Boa tarde 👋' : 'Boa noite 👋';
  const el = document.querySelector('.home-greeting');
  if (el) el.textContent = greet;
})();

// ── TOPIC DETAILS ──
let currentTopicName = '';

document.body.addEventListener('click', (e) => {
  const topicoItem = e.target.closest('.topico-item');
  if (topicoItem) {
    const nameEl = topicoItem.querySelector('.topico-name');
    const iconEl = topicoItem.querySelector('.topico-icon');
    if (nameEl && iconEl) {
      const title = nameEl.textContent;
      const iconStr = iconEl.textContent;
      const colorStr = iconEl.style.color;
      const bgStr = iconEl.style.background;
      
      currentTopicName = title;
      
      const topicTitle = document.getElementById('topic-title');
      const topicIcon = document.getElementById('topic-icon');
      const topicDot = document.getElementById('topic-resumo-dot');
      
      if (topicTitle) topicTitle.textContent = title;
      if (topicIcon) {
        topicIcon.textContent = iconStr;
        topicIcon.style.color = colorStr || 'var(--text)';
        topicIcon.style.background = bgStr || 'rgba(255,255,255,0.05)';
      }
      if (topicDot) {
        topicDot.style.background = colorStr || 'var(--accent)';
      }
      
      goTo('s-topico');
    }
  }
});

// ── DATA: RESUMOS POR TÓPICO ──
const topicToSubject = {
  "Geometria Plana": "Matemática", "Funções Quadráticas": "Matemática", "Trigonometria": "Matemática", "Análise Combinatória": "Matemática",
  "Leis de Newton": "Física", "Eletromagnetismo": "Física", "Termodinâmica": "Física", "Ondulatória": "Física",
  "Citologia": "Biologia", "Genética": "Biologia", "Ecologia": "Biologia", "Microbiologia": "Biologia",
  "Tabela Periódica": "Química", "Ligações Químicas": "Química", "Reações Químicas": "Química", "Química Orgânica": "Química"
};

const resumosByTopic = {
  "Leis de Newton": {
    concept: 'As <strong>3 Leis de Newton</strong> descrevem o movimento dos corpos e a relação entre força e aceleração. São a base da mecânica clássica e fundamentais para compreender o comportamento de objetos no espaço.',
    points: [
      { title: "1ª Lei (Inércia)", text: "Um corpo em repouso permanece em repouso, e em movimento permanece em movimento, a menos que uma força aja sobre ele." },
      { title: "2ª Lei (F = ma)", text: "A força resultante é igual à massa multiplicada pela aceleração. Quanto maior a força, maior a aceleração." },
      { title: "3ª Lei (Ação e Reação)", text: "Para toda ação existe uma reação de mesma intensidade, direção e sentido oposto." }
    ],
    tags: ["Inércia", "F = ma", "Ação-reação", "Mecânica", "Aceleração", "Força resultante"]
  },
  "Eletromagnetismo": {
    concept: 'O <strong>Eletromagnetismo</strong> estuda a relação entre cargas elétricas, campos elétricos e magnéticos. Unifica eletricidade e magnetismo, sendo fundamental para entender desde circuitos até ondas de rádio.',
    points: [
      { title: "Campo Elétrico", text: "Região onde uma carga elétrica exerce força sobre outras cargas. Representado por linhas de campo que saem de cargas positivas." },
      { title: "Lei de Coulomb", text: "A força entre duas cargas é proporcional ao produto das cargas e inversamente proporcional ao quadrado da distância: F = k·q₁q₂/d²." },
      { title: "Indução Eletromagnética", text: "A variação do fluxo magnético gera uma força eletromotriz (Lei de Faraday), base de geradores e transformadores." }
    ],
    tags: ["Campo elétrico", "Coulomb", "Faraday", "Corrente", "Ímã", "Indução"]
  },
  "Termodinâmica": {
    concept: 'A <strong>Termodinâmica</strong> estuda as transformações de energia envolvendo calor e trabalho. Suas leis regem desde motores térmicos até processos naturais de troca de energia.',
    points: [
      { title: "1ª Lei (Conservação)", text: "A energia interna de um sistema varia conforme o calor recebido e o trabalho realizado: ΔU = Q − W." },
      { title: "2ª Lei (Entropia)", text: "Em processos naturais, a entropia do universo tende a aumentar. É impossível converter todo calor em trabalho." },
      { title: "Escalas de Temperatura", text: "Celsius (°C), Fahrenheit (°F) e Kelvin (K) são as principais. O zero absoluto é 0 K = −273,15 °C." }
    ],
    tags: ["Calor", "Entropia", "ΔU = Q−W", "Kelvin", "Máquina térmica", "Zero absoluto"]
  },
  "Ondulatória": {
    concept: 'A <strong>Ondulatória</strong> estuda as ondas — perturbações que transportam energia sem transportar matéria. Abrange desde ondas sonoras até ondas eletromagnéticas como a luz.',
    points: [
      { title: "Equação Fundamental", text: "A velocidade de uma onda é o produto da frequência pelo comprimento de onda: v = λ · f." },
      { title: "Tipos de Onda", text: "Transversais (vibração perpendicular, ex: luz) e Longitudinais (vibração paralela, ex: som)." },
      { title: "Efeito Doppler", text: "A frequência percebida varia quando há movimento relativo entre fonte e observador (ex: sirene de ambulância)." }
    ],
    tags: ["Frequência", "Comprimento de onda", "Doppler", "Ressonância", "Som", "Transversal"]
  },
  "Geometria Plana": {
    concept: 'A <strong>Geometria Plana</strong> estuda as propriedades e medidas de figuras bidimensionais como triângulos, círculos, quadrados e polígonos. É a base para cálculos de área e perímetro.',
    points: [
      { title: "Teorema de Pitágoras", text: "Em um triângulo retângulo, o quadrado da hipotenusa é igual à soma dos quadrados dos catetos: a² = b² + c²." },
      { title: "Áreas Fundamentais", text: "Triângulo: (b×h)/2 · Retângulo: b×h · Círculo: π·r² — fórmulas essenciais para resolver problemas." },
      { title: "Ângulos Internos", text: "A soma dos ângulos internos de um triângulo é 180°. Para polígonos de n lados: (n−2)×180°." }
    ],
    tags: ["Pitágoras", "Área", "Perímetro", "Triângulo", "Círculo", "Ângulos"]
  },
  "Funções Quadráticas": {
    concept: 'As <strong>Funções Quadráticas</strong> (f(x) = ax² + bx + c) geram parábolas e são essenciais para modelar trajetórias, otimizações e resolver equações do 2º grau.',
    points: [
      { title: "Fórmula de Bhaskara", text: "x = (−b ± √Δ) / 2a, onde Δ = b² − 4ac. Permite encontrar as raízes da equação quadrática." },
      { title: "Discriminante (Δ)", text: "Δ > 0: duas raízes reais · Δ = 0: uma raiz real · Δ < 0: sem raízes reais." },
      { title: "Vértice da Parábola", text: "xv = −b/2a e yv = −Δ/4a. O vértice é o ponto máximo (a<0) ou mínimo (a>0) da função." }
    ],
    tags: ["Bhaskara", "Parábola", "Δ (delta)", "Raízes", "Vértice", "Coeficientes"]
  },
  "Trigonometria": {
    concept: 'A <strong>Trigonometria</strong> estuda as relações entre ângulos e lados de triângulos. Seno, cosseno e tangente são as funções fundamentais, aplicadas em cálculos de distância, engenharia e física.',
    points: [
      { title: "Razões Trigonométricas", text: "sen = cateto oposto / hipotenusa · cos = cateto adjacente / hipotenusa · tan = cateto oposto / cateto adjacente." },
      { title: "Relação Fundamental", text: "sen²(x) + cos²(x) = 1 — válida para qualquer ângulo." },
      { title: "Ângulos Notáveis", text: "sen(30°)=1/2 · cos(60°)=1/2 · tan(45°)=1 · sen(90°)=1 · cos(0°)=1." }
    ],
    tags: ["Seno", "Cosseno", "Tangente", "Hipotenusa", "Círculo trigonométrico", "30° 45° 60°"]
  },
  "Análise Combinatória": {
    concept: 'A <strong>Análise Combinatória</strong> estuda métodos de contagem para determinar o número de possibilidades em situações diversas, sem precisar listar todas.',
    points: [
      { title: "Princípio Fundamental", text: "Se um evento pode ocorrer de m formas e outro de n formas, ambos juntos ocorrem de m × n formas." },
      { title: "Permutação vs Combinação", text: "Permutação: a ordem importa (Pn = n!). Combinação: a ordem não importa (C(n,p) = n!/[p!·(n−p)!])." },
      { title: "Fatorial", text: "n! = n × (n−1) × ... × 2 × 1. Exemplo: 5! = 120. Por definição, 0! = 1." }
    ],
    tags: ["Fatorial", "Permutação", "Combinação", "Arranjo", "Contagem", "n!"]
  },
  "Citologia": {
    concept: 'A <strong>Citologia</strong> estuda as células — unidades básicas da vida. Compreender suas organelas e processos de divisão é essencial para toda a biologia.',
    points: [
      { title: "Organelas Principais", text: "Mitocôndria (energia/ATP) · Núcleo (DNA) · Ribossomos (proteínas) · Complexo de Golgi (empacotamento)." },
      { title: "Mitose e Meiose", text: "Mitose: 2 células iguais (crescimento). Meiose: 4 células haploides (gametas)." },
      { title: "Célula Animal vs Vegetal", text: "Vegetal: parede celular + cloroplastos + vacúolo central. Animal: centríolos e lisossomos mais abundantes." }
    ],
    tags: ["Mitocôndria", "Núcleo", "Mitose", "Meiose", "Membrana", "ATP"]
  },
  "Genética": {
    concept: 'A <strong>Genética</strong> estuda a hereditariedade e a variação dos organismos. Mendel estabeleceu as leis fundamentais que explicam como características são transmitidas de pais para filhos.',
    points: [
      { title: "1ª Lei de Mendel", text: "Lei da Segregação: os dois alelos de um gene se separam durante a formação dos gametas." },
      { title: "Genótipo e Fenótipo", text: "Genótipo = composição genética (AA, Aa, aa). Fenótipo = característica observável (cor, forma, etc)." },
      { title: "Dominância e Recessividade", text: "Alelo dominante se expressa em Aa (heterozigoto). Recessivo só aparece em aa (homozigoto recessivo)." }
    ],
    tags: ["DNA", "Mendel", "Alelos", "Genótipo", "Fenótipo", "Cromossomo"]
  },
  "Ecologia": {
    concept: 'A <strong>Ecologia</strong> estuda as interações entre os seres vivos e o ambiente. Conceitos como cadeia alimentar, ciclos biogeoquímicos e relações ecológicas são fundamentais.',
    points: [
      { title: "Cadeia Alimentar", text: "Produtores → Consumidores primários → Consumidores secundários → Decompositores. A energia diminui a cada nível." },
      { title: "Ecossistema", text: "Conjunto de comunidade biótica (seres vivos) + fatores abióticos (água, luz, solo, temperatura)." },
      { title: "Relações Ecológicas", text: "Mutualismo (ambos ganham) · Parasitismo (um ganha, outro perde) · Competição (ambos perdem recursos)." }
    ],
    tags: ["Cadeia alimentar", "Ecossistema", "Bioma", "Mutualismo", "Efeito estufa", "Nicho"]
  },
  "Microbiologia": {
    concept: 'A <strong>Microbiologia</strong> estuda microrganismos como bactérias, vírus, fungos e protozoários. Essencial para compreender doenças, vacinas e o papel dos microrganismos na natureza.',
    points: [
      { title: "Bactérias e Vírus", text: "Bactérias são procariontes unicelulares. Vírus são acelulares e dependem de um hospedeiro para se replicar." },
      { title: "Vacinas e Antibióticos", text: "Vacinas estimulam imunidade (prevenção). Antibióticos combatem bactérias, mas NÃO funcionam contra vírus." },
      { title: "Fungos", text: "Eucariontes heterotróficos. Podem ser unicelulares (leveduras) ou pluricelulares (cogumelos). Importantes na decomposição." }
    ],
    tags: ["Bactérias", "Vírus", "Vacina", "Antibiótico", "Fungos", "Procarionte"]
  },
  "Tabela Periódica": {
    concept: 'A <strong>Tabela Periódica</strong> organiza todos os elementos químicos por número atômico crescente, agrupando elementos com propriedades semelhantes em famílias e períodos.',
    points: [
      { title: "Organização", text: "18 colunas (grupos/famílias) e 7 linhas (períodos). Metais à esquerda, ametais à direita, gases nobres no grupo 18." },
      { title: "Número Atômico (Z)", text: "Define o elemento. É o número de prótons no núcleo. Ex: H=1, C=6, O=8, Fe=26." },
      { title: "Propriedades Periódicas", text: "Eletronegatividade e energia de ionização aumentam da esquerda para a direita e de baixo para cima." }
    ],
    tags: ["Número atômico", "Metais", "Ametais", "Gases nobres", "Eletronegatividade", "Períodos"]
  },
  "Ligações Químicas": {
    concept: 'As <strong>Ligações Químicas</strong> são forças que mantêm átomos unidos em moléculas e compostos. Os três tipos principais são iônica, covalente e metálica.',
    points: [
      { title: "Ligação Iônica", text: "Transferência de elétrons entre metal e ametal, formando cátions (+) e ânions (−) que se atraem." },
      { title: "Ligação Covalente", text: "Compartilhamento de pares de elétrons entre ametais. Pode ser simples, dupla ou tripla." },
      { title: "Regra do Octeto", text: "Os átomos tendem a completar 8 elétrons na camada de valência para atingir estabilidade." }
    ],
    tags: ["Iônica", "Covalente", "Metálica", "Octeto", "Geometria molecular", "Elétrons"]
  },
  "Reações Químicas": {
    concept: 'As <strong>Reações Químicas</strong> são processos onde substâncias se transformam em outras com propriedades diferentes. A Lei de Lavoisier garante que a massa se conserva.',
    points: [
      { title: "Lei de Lavoisier", text: "Na natureza nada se cria, nada se perde, tudo se transforma. A massa total dos reagentes = massa dos produtos." },
      { title: "Tipos de Reações", text: "Síntese (A+B→AB) · Decomposição (AB→A+B) · Simples troca · Dupla troca." },
      { title: "Energia nas Reações", text: "Exotérmica: libera calor (combustão). Endotérmica: absorve calor (fotossíntese)." }
    ],
    tags: ["Lavoisier", "Balanceamento", "Exotérmica", "Endotérmica", "Síntese", "Reagentes"]
  },
  "Química Orgânica": {
    concept: 'A <strong>Química Orgânica</strong> estuda compostos de carbono — a base da vida e de produtos como plásticos, medicamentos e combustíveis. O carbono forma 4 ligações e cadeias variadas.',
    points: [
      { title: "Hidrocarbonetos", text: "Compostos de C e H apenas. Alcanos (simples), Alcenos (dupla C=C) e Alcinos (tripla C≡C)." },
      { title: "Grupos Funcionais", text: "-OH (álcool) · -COOH (ácido carboxílico) · -NH₂ (amina) · C=O (cetona/aldeído). Definem propriedades." },
      { title: "Isomeria", text: "Compostos com mesma fórmula molecular, mas estruturas diferentes, resultando em propriedades distintas." }
    ],
    tags: ["Carbono", "Hidrocarboneto", "Álcool", "Grupo funcional", "Isomeria", "Cadeia carbônica"]
  }
};

// ── FUNÇÃO: ABRIR RESUMO DINÂMICO ──
function openResumo() {
  const topic = currentTopicName;
  const data = resumosByTopic[topic];
  const subject = topicToSubject[topic] || 'Tópico';

  if (data) {
    // Header subtitle
    document.getElementById('resumo-sub').textContent = `${subject} · ${topic} · agora`;
    // Photo name
    document.getElementById('resumo-photo-name').textContent = `Quadro_${subject.replace(/\s/g,'')}_${topic.replace(/\s/g,'')}.jpg`;
    // Concepts count
    document.getElementById('resumo-concepts-count').textContent = data.points.length;
    // Concept text
    document.getElementById('resumo-concept').innerHTML = data.concept;
    // Key points
    const kpList = document.getElementById('resumo-keypoints');
    kpList.innerHTML = '';
    data.points.forEach((pt, i) => {
      kpList.innerHTML += `
        <div class="kp-item">
          <div class="kp-num">${i + 1}</div>
          <div class="kp-text"><em>${pt.title}</em> — ${pt.text}</div>
        </div>`;
    });
    // Tags
    const tagCloud = document.getElementById('resumo-tags');
    const tagColors = ['purple', 'green', 'yellow'];
    tagCloud.innerHTML = data.tags.map((tag, i) =>
      `<span class="tag ${tagColors[i % 3]}">${tag}</span>`
    ).join('');
  }

  goTo('s-resumo');
}

// ── DATA: FLASHCARDS POR TÓPICO ──
const flashcardsByTopic = {
  "Leis de Newton": [
    { q: "O que diz a 1ª Lei de Newton (Inércia)?", a: "Um corpo em repouso permanece em repouso e em movimento permanece em movimento, a menos que uma força atue sobre ele." },
    { q: "Qual a fórmula da 2ª Lei de Newton?", a: "Força Resultante = massa × aceleração\n(F = m · a)" },
    { q: "O que diz a 3ª Lei de Newton (Ação e Reação)?", a: "Para toda força de ação, existe uma força de reação com a mesma intensidade, mesma direção, mas sentidos opostos." },
    { q: "O que é Trabalho (T) na Física?", a: "É a energia transferida para um corpo por aplicar uma força ao longo de um deslocamento. T = F · d" },
    { q: "Qual a unidade de medida padrão da Força no SI?", a: "Newton (N)" },
    { q: "O que caracteriza um Movimento Retilíneo Uniforme (MRU)?", a: "É um movimento em linha reta onde a velocidade é sempre constante e a aceleração é zero." }
  ],
  "Eletromagnetismo": [
    { q: "O que é um campo elétrico?", a: "É a região ao redor de uma carga elétrica onde outra carga sofre a influência de uma força elétrica." },
    { q: "Qual a fórmula da Lei de Coulomb?", a: "F = k · (q₁ · q₂) / d²\nOnde k é a constante eletrostática, q são as cargas e d a distância." },
    { q: "O que é um campo magnético?", a: "É a região ao redor de um ímã ou corrente elétrica onde forças magnéticas podem ser observadas." },
    { q: "O que diz a Lei de Faraday?", a: "A variação do fluxo magnético através de uma espira gera uma força eletromotriz (fem) induzida." },
    { q: "Qual a unidade de carga elétrica no SI?", a: "Coulomb (C)" },
    { q: "O que é corrente elétrica?", a: "É o fluxo ordenado de cargas elétricas (geralmente elétrons) através de um condutor. Unidade: Ampère (A)." }
  ],
  "Termodinâmica": [
    { q: "O que é temperatura?", a: "É a medida da agitação térmica (energia cinética média) das moléculas de um corpo." },
    { q: "Qual a diferença entre calor e temperatura?", a: "Calor é a energia térmica em trânsito entre corpos com temperaturas diferentes. Temperatura é a medida da agitação molecular." },
    { q: "O que diz a 1ª Lei da Termodinâmica?", a: "A energia interna de um sistema varia conforme o calor recebido e o trabalho realizado: ΔU = Q - W" },
    { q: "O que diz a 2ª Lei da Termodinâmica?", a: "É impossível construir uma máquina térmica que converta todo calor em trabalho. A entropia de um sistema isolado tende a aumentar." },
    { q: "O que é entropia?", a: "É a medida da desordem ou aleatoriedade de um sistema termodinâmico. Em processos naturais, a entropia tende a aumentar." },
    { q: "Quais são as escalas termométricas mais usadas?", a: "Celsius (°C), Fahrenheit (°F) e Kelvin (K). A relação é: K = °C + 273,15" }
  ],
  "Ondulatória": [
    { q: "O que é uma onda?", a: "É uma perturbação que se propaga transportando energia sem transportar matéria." },
    { q: "Qual a diferença entre onda transversal e longitudinal?", a: "Na transversal, a vibração é perpendicular à propagação (ex.: luz). Na longitudinal, a vibração é paralela à propagação (ex.: som)." },
    { q: "O que é frequência de uma onda?", a: "É o número de oscilações completas por segundo. Unidade: Hertz (Hz)." },
    { q: "Qual a relação entre velocidade, frequência e comprimento de onda?", a: "v = λ · f (velocidade = comprimento de onda × frequência)" },
    { q: "O que é o efeito Doppler?", a: "É a variação aparente da frequência de uma onda quando há movimento relativo entre a fonte emissora e o observador." },
    { q: "O que é ressonância?", a: "Ocorre quando um corpo é submetido a vibrações na sua frequência natural, causando aumento significativo na amplitude." }
  ],
  // ── MATEMÁTICA ──
  "Geometria Plana": [
    { q: "Qual a fórmula da área de um triângulo?", a: "A = (base × altura) / 2" },
    { q: "Qual a soma dos ângulos internos de um triângulo?", a: "180° (sempre, independente do tipo de triângulo)." },
    { q: "O que diz o Teorema de Pitágoras?", a: "Em um triângulo retângulo, o quadrado da hipotenusa é igual à soma dos quadrados dos catetos: a² = b² + c²" },
    { q: "Qual a fórmula da área de um círculo?", a: "A = π · r² (onde r é o raio)" },
    { q: "O que é o perímetro de uma figura?", a: "É a soma de todos os lados (ou comprimento da borda) da figura geométrica." },
    { q: "Qual a fórmula do comprimento de uma circunferência?", a: "C = 2 · π · r (onde r é o raio)" }
  ],
  "Funções Quadráticas": [
    { q: "Qual a forma geral de uma função quadrática?", a: "f(x) = ax² + bx + c, onde a ≠ 0" },
    { q: "O que é o discriminante (Δ) e para que serve?", a: "Δ = b² - 4ac. Determina o número de raízes reais: Δ>0 (duas), Δ=0 (uma), Δ<0 (nenhuma)." },
    { q: "Qual a fórmula de Bhaskara?", a: "x = (-b ± √Δ) / 2a, onde Δ = b² - 4ac" },
    { q: "Como encontrar o vértice de uma parábola?", a: "xv = -b / 2a e yv = -Δ / 4a" },
    { q: "Quando a parábola tem concavidade para cima?", a: "Quando o coeficiente 'a' é positivo (a > 0)." },
    { q: "O que são as raízes de uma função quadrática?", a: "São os valores de x onde f(x) = 0, ou seja, os pontos em que a parábola cruza o eixo x." }
  ],
  "Trigonometria": [
    { q: "Quais são as razões trigonométricas básicas?", a: "Seno = cateto oposto / hipotenusa\nCosseno = cateto adjacente / hipotenusa\nTangente = cateto oposto / cateto adjacente" },
    { q: "Quanto vale sen(30°)?", a: "sen(30°) = 1/2 = 0,5" },
    { q: "Quanto vale cos(60°)?", a: "cos(60°) = 1/2 = 0,5" },
    { q: "Qual a relação fundamental da trigonometria?", a: "sen²(x) + cos²(x) = 1 (para qualquer ângulo x)" },
    { q: "O que é o círculo trigonométrico?", a: "É um círculo de raio 1 centrado na origem, usado para definir seno e cosseno para qualquer ângulo." },
    { q: "Quanto vale tan(45°)?", a: "tan(45°) = 1" }
  ],
  "Análise Combinatória": [
    { q: "O que é fatorial de n (n!)?", a: "É o produto de todos os inteiros de 1 até n. Ex: 5! = 5×4×3×2×1 = 120. E 0! = 1." },
    { q: "Qual a diferença entre permutação e combinação?", a: "Na permutação a ordem importa. Na combinação a ordem NÃO importa." },
    { q: "Qual a fórmula da permutação simples?", a: "Pn = n! (o número de maneiras de ordenar n elementos)" },
    { q: "Qual a fórmula do arranjo simples?", a: "A(n,p) = n! / (n-p)!" },
    { q: "Qual a fórmula da combinação simples?", a: "C(n,p) = n! / [p! · (n-p)!]" },
    { q: "O que é o Princípio Fundamental da Contagem?", a: "Se um evento pode ocorrer de m maneiras e outro de n maneiras, ambos juntos podem ocorrer de m × n maneiras." }
  ],
  // ── BIOLOGIA ──
  "Citologia": [
    { q: "O que é uma célula?", a: "É a unidade básica, estrutural e funcional de todos os seres vivos." },
    { q: "Qual a diferença entre célula animal e vegetal?", a: "A célula vegetal possui parede celular, cloroplastos e vacúolo central, que a célula animal não possui." },
    { q: "O que é mitose?", a: "É a divisão celular que gera duas células-filhas idênticas, com o mesmo número de cromossomos da célula-mãe." },
    { q: "O que é meiose?", a: "É a divisão celular que gera quatro células-filhas com metade dos cromossomos (células haploides). Ocorre na formação de gametas." },
    { q: "Qual a função da mitocôndria?", a: "É a organela responsável pela respiração celular, produzindo energia (ATP) para a célula." },
    { q: "O que é o núcleo celular?", a: "É a organela que contém o material genético (DNA) e controla as atividades da célula." }
  ],
  "Genética": [
    { q: "O que é um gene?", a: "É um segmento de DNA que contém as instruções para produzir uma proteína ou RNA funcional." },
    { q: "O que são alelos dominantes e recessivos?", a: "Dominante se expressa mesmo em heterozigose (Aa). Recessivo só se expressa em homozigose (aa)." },
    { q: "Qual a 1ª Lei de Mendel?", a: "Lei da Segregação: cada indivíduo possui dois alelos para uma característica, que se separam na formação dos gametas." },
    { q: "O que é genótipo e fenótipo?", a: "Genótipo é a composição genética (ex: Aa). Fenótipo é a característica observável que resulta do genótipo + ambiente." },
    { q: "O que é heterozigoto?", a: "É um indivíduo que possui dois alelos diferentes para uma mesma característica (ex: Aa)." },
    { q: "O que é DNA?", a: "Ácido Desoxirribonucleico, molécula de dupla hélice que armazena a informação genética de todos os seres vivos." }
  ],
  "Ecologia": [
    { q: "O que é um ecossistema?", a: "É o conjunto formado pelos seres vivos (comunidade biótica) e o ambiente físico (fatores abióticos) em que vivem, interagindo entre si." },
    { q: "O que é uma cadeia alimentar?", a: "É a sequência linear de organismos onde cada um serve de alimento para o seguinte: produtores → consumidores → decompositores." },
    { q: "O que são produtores em uma cadeia alimentar?", a: "São organismos autótrofos (como plantas e algas) que produzem seu próprio alimento pela fotossíntese." },
    { q: "O que é nicho ecológico?", a: "É o papel funcional de uma espécie no ecossistema, incluindo alimentação, habitat, reprodução e interações." },
    { q: "O que é o efeito estufa?", a: "É o fenômeno natural em que gases na atmosfera retêm calor, mantendo a Terra aquecida. O excesso intensifica o aquecimento global." },
    { q: "O que é uma relação ecológica de mutualismo?", a: "É uma interação entre duas espécies em que ambas se beneficiam. Exemplo: abelhas e flores (polinização)." }
  ],
  "Microbiologia": [
    { q: "O que são bactérias?", a: "São organismos unicelulares procariontes (sem núcleo definido), podendo ser benéficas ou patogênicas." },
    { q: "O que são vírus?", a: "São agentes infecciosos acelulares que precisam de uma célula hospedeira para se reproduzir. Não são considerados seres vivos por muitos cientistas." },
    { q: "O que é um antibiótico?", a: "É uma substância que mata ou inibe o crescimento de bactérias. Não funciona contra vírus." },
    { q: "O que são fungos?", a: "São organismos eucariontes, unicelulares ou pluricelulares, heterotróficos. Exemplos: leveduras, cogumelos e bolores." },
    { q: "O que é uma vacina?", a: "É uma preparação biológica que estimula o sistema imunológico a produzir anticorpos contra um patógeno específico, gerando imunidade." },
    { q: "Qual a diferença entre procarionte e eucarionte?", a: "Procariontes não possuem núcleo organizado nem organelas membranosas (ex: bactérias). Eucariontes possuem (ex: animais, plantas)." }
  ],
  // ── QUÍMICA ──
  "Tabela Periódica": [
    { q: "Como a Tabela Periódica está organizada?", a: "Em 18 colunas (grupos/famílias) e 7 linhas (períodos), ordenada por número atômico crescente." },
    { q: "O que é o número atômico (Z)?", a: "É o número de prótons no núcleo do átomo. Define qual elemento químico é." },
    { q: "O que são metais, ametais e semimetais?", a: "Metais: bons condutores, brilho metálico. Ametais: maus condutores, quebradiços. Semimetais: propriedades intermediárias." },
    { q: "O que é um gás nobre?", a: "São elementos do grupo 18, com camada de valência completa, extremamente estáveis e pouco reativos (He, Ne, Ar, Kr, Xe, Rn)." },
    { q: "O que é eletronegatividade?", a: "É a tendência de um átomo em atrair elétrons em uma ligação química. O flúor (F) é o mais eletronegativo." },
    { q: "O que é a camada de valência?", a: "É a última camada eletrônica de um átomo, que determina suas propriedades químicas e ligações." }
  ],
  "Ligações Químicas": [
    { q: "O que é uma ligação iônica?", a: "É a ligação formada pela transferência de elétrons entre um metal e um ametal, gerando íons (cátions e ânions) que se atraem." },
    { q: "O que é uma ligação covalente?", a: "É a ligação formada pelo compartilhamento de pares de elétrons entre dois átomos (geralmente ametais)." },
    { q: "O que é uma ligação metálica?", a: "É a ligação entre átomos metálicos, onde os elétrons de valência são compartilhados em um 'mar de elétrons'." },
    { q: "O que é a regra do octeto?", a: "Os átomos tendem a se ligar de forma a completar 8 elétrons na camada de valência, atingindo estabilidade." },
    { q: "Qual a diferença entre ligação sigma e pi?", a: "Sigma (σ): sobreposição frontal, mais forte. Pi (π): sobreposição lateral, mais fraca. Ligações duplas têm 1σ + 1π." },
    { q: "O que é geometria molecular?", a: "É a forma tridimensional que a molécula assume no espaço. Exemplos: linear, angular, trigonal, tetraédrica." }
  ],
  "Reações Químicas": [
    { q: "O que é uma reação química?", a: "É um processo em que substâncias (reagentes) se transformam em novas substâncias (produtos) com propriedades diferentes." },
    { q: "O que é balanceamento de equações?", a: "É ajustar os coeficientes para que o número de átomos de cada elemento seja igual nos reagentes e nos produtos (Lei de Lavoisier)." },
    { q: "O que diz a Lei de Lavoisier?", a: "Na natureza, nada se cria, nada se perde, tudo se transforma. A massa dos reagentes é igual à massa dos produtos." },
    { q: "O que é uma reação exotérmica?", a: "É uma reação que libera energia (calor) para o meio ambiente. Exemplo: combustão." },
    { q: "O que é uma reação endotérmica?", a: "É uma reação que absorve energia (calor) do meio ambiente. Exemplo: fotossíntese." },
    { q: "Quais são os tipos básicos de reações químicas?", a: "Síntese (A+B→AB), Decomposição (AB→A+B), Simples-troca (A+BC→AC+B) e Dupla-troca (AB+CD→AD+CB)." }
  ],
  "Química Orgânica": [
    { q: "O que estuda a Química Orgânica?", a: "É o ramo da química que estuda os compostos de carbono, suas estruturas, propriedades e reações." },
    { q: "O que são hidrocarbonetos?", a: "São compostos formados apenas por carbono e hidrogênio. Exemplos: metano (CH₄), eteno (C₂H₄), benzeno (C₆H₆)." },
    { q: "O que é uma cadeia carbônica?", a: "É a sequência de átomos de carbono ligados entre si que forma o esqueleto das moléculas orgânicas." },
    { q: "O que é um grupo funcional?", a: "É um átomo ou grupo de átomos que confere propriedades químicas específicas à molécula. Ex: -OH (álcool), -COOH (ácido carboxílico)." },
    { q: "Qual a diferença entre alcano, alceno e alcino?", a: "Alcano: só ligações simples. Alceno: uma ligação dupla C=C. Alcino: uma ligação tripla C≡C." },
    { q: "O que é isomeria?", a: "É o fenômeno em que compostos têm a mesma fórmula molecular, mas estruturas diferentes, resultando em propriedades diferentes." }
  ]
};

// ── DATA: EXAMES POR TÓPICO ──
const examsByTopic = {
  "Leis de Newton": [
    {
      q: "Qual é a fórmula fundamental da 2ª Lei de Newton?",
      opts: ["E = mc²", "F = m · a", "V = v0 + at", "P = m · g"],
      ans: 1
    },
    {
      q: "Se a força resultante sobre um corpo é zero, o que acontece com ele?",
      opts: ["Ele acelera rapidamente", "Ele para imediatamente", "Mantém velocidade constante (MRU)", "Aumenta de peso"],
      ans: 2
    },
    {
      q: "A 3ª Lei de Newton (Ação e Reação) afirma que as forças de ação e reação:",
      opts: ["Atuam no mesmo corpo", "Têm intensidades diferentes", "Atuam em corpos diferentes e sentidos opostos", "Se anulam mutuamente"],
      ans: 2
    },
    {
      q: "A inércia de um corpo está diretamente ligada a qual grandeza?",
      opts: ["Velocidade", "Aceleração", "Volume", "Massa"],
      ans: 3
    },
    {
      q: "Qual a unidade de Força no Sistema Internacional (SI)?",
      opts: ["Joule (J)", "Newton (N)", "Watt (W)", "Pascal (Pa)"],
      ans: 1
    }
  ],
  "Eletromagnetismo": [
    {
      q: "Qual a fórmula da Lei de Coulomb para a força entre duas cargas?",
      opts: ["F = m · a", "F = k · q₁q₂ / d²", "F = q · v · B", "F = μ₀ · I / 2πr"],
      ans: 1
    },
    {
      q: "Qual é a unidade de carga elétrica no Sistema Internacional?",
      opts: ["Volt (V)", "Ampère (A)", "Coulomb (C)", "Ohm (Ω)"],
      ans: 2
    },
    {
      q: "A Lei de Faraday trata sobre qual fenômeno?",
      opts: ["Atração entre cargas", "Indução eletromagnética", "Resistência elétrica", "Pressão nos fluidos"],
      ans: 1
    },
    {
      q: "O que acontece quando um condutor percorrido por corrente é colocado em um campo magnético?",
      opts: ["Nada, ele permanece parado", "Surge uma força magnética sobre o condutor", "A corrente para de fluir", "O campo magnético desaparece"],
      ans: 1
    },
    {
      q: "Qual dos itens NÃO é um exemplo de onda eletromagnética?",
      opts: ["Luz visível", "Raios X", "Ondas de rádio", "Som"],
      ans: 3
    }
  ],
  "Termodinâmica": [
    {
      q: "A 1ª Lei da Termodinâmica é essencialmente uma aplicação de qual princípio?",
      opts: ["Conservação da quantidade de movimento", "Conservação da energia", "Ação e Reação", "Princípio de Arquimedes"],
      ans: 1
    },
    {
      q: "Qual a fórmula da 1ª Lei da Termodinâmica?",
      opts: ["ΔU = Q - W", "F = m · a", "E = mc²", "P · V = n · R · T"],
      ans: 0
    },
    {
      q: "A 2ª Lei da Termodinâmica afirma que em processos naturais, a entropia:",
      opts: ["Sempre diminui", "Permanece constante", "Tende a aumentar", "É sempre zero"],
      ans: 2
    },
    {
      q: "Qual é o zero absoluto na escala Kelvin?",
      opts: ["0 K (≈ -273,15 °C)", "100 K", "273 K", "-100 K"],
      ans: 0
    },
    {
      q: "Uma máquina térmica ideal (Carnot) tem rendimento de 100%?",
      opts: ["Sim, sempre que bem projetada", "Não, é impossível pela 2ª Lei", "Sim, desde que use gás ideal", "Depende da temperatura ambiente"],
      ans: 1
    }
  ],
  "Ondulatória": [
    {
      q: "Qual a relação correta entre velocidade (v), frequência (f) e comprimento de onda (λ)?",
      opts: ["v = λ / f", "v = λ · f", "v = f / λ", "v = λ + f"],
      ans: 1
    },
    {
      q: "O som é um exemplo de qual tipo de onda?",
      opts: ["Transversal", "Eletromagnética", "Longitudinal", "Estacionária"],
      ans: 2
    },
    {
      q: "O efeito Doppler descreve a variação de qual característica da onda?",
      opts: ["Amplitude", "Velocidade de propagação", "Frequência percebida pelo observador", "Comprimento do meio"],
      ans: 2
    },
    {
      q: "O que acontece na ressonância?",
      opts: ["A onda desaparece completamente", "A amplitude aumenta muito ao igualar a frequência natural", "A frequência diminui pela metade", "A onda muda de longitudinal para transversal"],
      ans: 1
    },
    {
      q: "Ondas eletromagnéticas podem se propagar no vácuo?",
      opts: ["Não, precisam de um meio material", "Sim, não precisam de meio material", "Apenas ondas de rádio podem", "Apenas a luz visível pode"],
      ans: 1
    }
  ],
  // ── MATEMÁTICA ──
  "Geometria Plana": [
    {
      q: "Qual a fórmula da área de um triângulo?",
      opts: ["A = base × altura", "A = (base × altura) / 2", "A = π · r²", "A = lado²"],
      ans: 1
    },
    {
      q: "Quanto vale a soma dos ângulos internos de um triângulo?",
      opts: ["90°", "360°", "180°", "270°"],
      ans: 2
    },
    {
      q: "No Teorema de Pitágoras (a² = b² + c²), 'a' representa:",
      opts: ["O menor cateto", "O cateto adjacente", "A hipotenusa", "A altura do triângulo"],
      ans: 2
    },
    {
      q: "Qual a fórmula da área de um círculo?",
      opts: ["A = 2πr", "A = πd", "A = πr²", "A = r²/π"],
      ans: 2
    },
    {
      q: "Um quadrado com lado 5 cm tem perímetro igual a:",
      opts: ["10 cm", "25 cm", "20 cm", "15 cm"],
      ans: 2
    }
  ],
  "Funções Quadráticas": [
    {
      q: "Qual a forma geral de uma função quadrática?",
      opts: ["f(x) = ax + b", "f(x) = ax² + bx + c", "f(x) = a/x", "f(x) = aˣ"],
      ans: 1
    },
    {
      q: "Se Δ < 0 na fórmula de Bhaskara, a equação possui:",
      opts: ["Duas raízes reais", "Uma raiz real", "Nenhuma raiz real", "Infinitas raízes"],
      ans: 2
    },
    {
      q: "Quando a > 0 em f(x) = ax² + bx + c, a parábola tem:",
      opts: ["Concavidade para baixo", "Concavidade para cima", "Formato de reta", "Formato circular"],
      ans: 1
    },
    {
      q: "A fórmula do vértice xv de uma parábola é:",
      opts: ["xv = b / 2a", "xv = -b / 2a", "xv = -Δ / 4a", "xv = 2a / b"],
      ans: 1
    },
    {
      q: "Qual o discriminante (Δ) da equação x² - 5x + 6 = 0?",
      opts: ["Δ = 49", "Δ = 1", "Δ = -1", "Δ = 11"],
      ans: 1
    }
  ],
  "Trigonometria": [
    {
      q: "Qual o valor de sen(30°)?",
      opts: ["√3/2", "1/2", "√2/2", "1"],
      ans: 1
    },
    {
      q: "Qual a relação fundamental da trigonometria?",
      opts: ["sen(x) + cos(x) = 1", "sen²(x) + cos²(x) = 1", "tan(x) = sen(x) + cos(x)", "sen(x) · cos(x) = 1"],
      ans: 1
    },
    {
      q: "A tangente de um ângulo é definida como:",
      opts: ["Cateto adjacente / hipotenusa", "Hipotenusa / cateto oposto", "Cateto oposto / cateto adjacente", "Cateto oposto / hipotenusa"],
      ans: 2
    },
    {
      q: "Quanto vale cos(0°)?",
      opts: ["0", "1/2", "1", "-1"],
      ans: 2
    },
    {
      q: "No círculo trigonométrico, o ângulo de 90° corresponde a qual ponto?",
      opts: ["(1, 0)", "(0, 1)", "(-1, 0)", "(0, -1)"],
      ans: 1
    }
  ],
  "Análise Combinatória": [
    {
      q: "Quanto vale 5! (fatorial de 5)?",
      opts: ["25", "60", "120", "720"],
      ans: 2
    },
    {
      q: "Qual a diferença fundamental entre permutação e combinação?",
      opts: ["Na permutação há repetição", "Na combinação a ordem importa", "Na permutação a ordem importa", "Não há diferença"],
      ans: 2
    },
    {
      q: "De quantas maneiras 3 pessoas podem se sentar em 3 cadeiras?",
      opts: ["3", "6", "9", "27"],
      ans: 1
    },
    {
      q: "O valor de C(5,2) — combinação de 5 elementos tomados 2 a 2 — é:",
      opts: ["20", "10", "5", "25"],
      ans: 1
    },
    {
      q: "Pelo Princípio Fundamental da Contagem, se tenho 3 camisas e 4 calças, posso montar quantas combinações?",
      opts: ["7", "12", "1", "24"],
      ans: 1
    }
  ],
  // ── BIOLOGIA ──
  "Citologia": [
    {
      q: "Qual organela é responsável pela respiração celular e produção de ATP?",
      opts: ["Ribossomo", "Complexo de Golgi", "Mitocôndria", "Lisossomo"],
      ans: 2
    },
    {
      q: "A mitose produz quantas células-filhas e com quantos cromossomos?",
      opts: ["4 células haploides", "2 células diploides (idênticas)", "2 células haploides", "4 células diploides"],
      ans: 1
    },
    {
      q: "Qual estrutura está presente na célula vegetal, mas NÃO na animal?",
      opts: ["Membrana plasmática", "Mitocôndria", "Parede celular", "Ribossomo"],
      ans: 2
    },
    {
      q: "Onde fica armazenado o DNA na célula eucarionte?",
      opts: ["No citoplasma", "Na membrana", "No núcleo", "No ribossomo"],
      ans: 2
    },
    {
      q: "A meiose é importante porque:",
      opts: ["Repara tecidos danificados", "Produz gametas com metade dos cromossomos", "Duplica o número de cromossomos", "Produz células idênticas à célula-mãe"],
      ans: 1
    }
  ],
  "Genética": [
    {
      q: "Na 1ª Lei de Mendel, o que acontece na formação dos gametas?",
      opts: ["Os alelos se duplicam", "Os alelos se segregam (separam)", "Os alelos se fundem", "Novos alelos são criados"],
      ans: 1
    },
    {
      q: "Um indivíduo heterozigoto Aa cruzado com outro Aa gera qual proporção fenotípica?",
      opts: ["100% dominante", "3 dominantes : 1 recessivo", "1 dominante : 1 recessivo", "100% recessivo"],
      ans: 1
    },
    {
      q: "O que é genótipo?",
      opts: ["A aparência do organismo", "A composição genética (alelos)", "O ambiente onde vive", "A espécie do organismo"],
      ans: 1
    },
    {
      q: "O DNA é formado por qual tipo de monômero?",
      opts: ["Aminoácidos", "Lipídios", "Nucleotídeos", "Monossacarídeos"],
      ans: 2
    },
    {
      q: "Se um alelo é recessivo, ele só se manifesta quando:",
      opts: ["Está em heterozigose (Aa)", "Está em homozigose recessiva (aa)", "Está ligado ao cromossomo Y", "O ambiente o permite"],
      ans: 1
    }
  ],
  "Ecologia": [
    {
      q: "Quem ocupa o primeiro nível trófico de uma cadeia alimentar?",
      opts: ["Consumidores primários", "Decompositores", "Produtores", "Consumidores secundários"],
      ans: 2
    },
    {
      q: "O que é um ecossistema?",
      opts: ["Apenas os seres vivos de um lugar", "Apenas os fatores abióticos", "O conjunto de seres vivos e ambiente físico interagindo", "Uma espécie e seu habitat"],
      ans: 2
    },
    {
      q: "O efeito estufa é causado principalmente por quais gases?",
      opts: ["O₂ e N₂", "CO₂ e CH₄", "H₂ e He", "Ar e Ne"],
      ans: 1
    },
    {
      q: "Qual relação ecológica ocorre entre abelhas e flores?",
      opts: ["Parasitismo", "Competição", "Mutualismo", "Predação"],
      ans: 2
    },
    {
      q: "A pirâmide de energia mostra que:",
      opts: ["A energia aumenta a cada nível trófico", "A energia se mantém constante", "A energia diminui a cada nível trófico", "Só o último nível tem energia"],
      ans: 2
    }
  ],
  "Microbiologia": [
    {
      q: "Bactérias são organismos de qual tipo celular?",
      opts: ["Eucariontes", "Procariontes", "Acelulares", "Pluricelulares"],
      ans: 1
    },
    {
      q: "Por que antibióticos NÃO funcionam contra vírus?",
      opts: ["Vírus são muito grandes", "Vírus não possuem estrutura celular própria", "Vírus são mais fortes que bactérias", "Antibióticos não existem"],
      ans: 1
    },
    {
      q: "Qual a principal função de uma vacina?",
      opts: ["Curar uma doença em andamento", "Matar todos os vírus do corpo", "Estimular o sistema imunológico a produzir anticorpos", "Substituir os antibióticos"],
      ans: 2
    },
    {
      q: "Os fungos são organismos:",
      opts: ["Procariontes e autótrofos", "Eucariontes e heterotróficos", "Acelulares", "Procariontes e heterotróficos"],
      ans: 1
    },
    {
      q: "Qual a principal diferença entre célula procarionte e eucarionte?",
      opts: ["Procariontes são maiores", "Eucariontes não têm DNA", "Procariontes não possuem núcleo organizado", "Eucariontes não têm ribossomos"],
      ans: 2
    }
  ],
  // ── QUÍMICA ──
  "Tabela Periódica": [
    {
      q: "O número atômico (Z) de um elemento indica:",
      opts: ["O número de nêutrons", "O número de prótons", "A massa atômica", "O número de elétrons de valência"],
      ans: 1
    },
    {
      q: "Os gases nobres (grupo 18) são pouco reativos porque:",
      opts: ["São muito leves", "Possuem camada de valência completa", "Não possuem elétrons", "São todos radioativos"],
      ans: 1
    },
    {
      q: "Qual é o elemento mais eletronegativo da Tabela Periódica?",
      opts: ["Oxigênio (O)", "Cloro (Cl)", "Flúor (F)", "Nitrogênio (N)"],
      ans: 2
    },
    {
      q: "Na Tabela Periódica, os períodos representam:",
      opts: ["Famílias de elementos", "Camadas eletrônicas (linhas horizontais)", "Colunas verticais", "Elementos radioativos"],
      ans: 1
    },
    {
      q: "Metais geralmente são bons condutores de:",
      opts: ["Apenas calor", "Apenas eletricidade", "Calor e eletricidade", "Nenhuma das alternativas"],
      ans: 2
    }
  ],
  "Ligações Químicas": [
    {
      q: "A ligação iônica ocorre tipicamente entre:",
      opts: ["Dois ametais", "Um metal e um ametal", "Dois metais", "Dois gases nobres"],
      ans: 1
    },
    {
      q: "Na ligação covalente, os átomos:",
      opts: ["Transferem elétrons", "Compartilham elétrons", "Perdem todos os elétrons", "Ganham prótons"],
      ans: 1
    },
    {
      q: "A regra do octeto diz que os átomos tendem a ter quantos elétrons na camada de valência?",
      opts: ["2", "6", "8", "10"],
      ans: 2
    },
    {
      q: "Na ligação metálica, os elétrons de valência:",
      opts: ["Ficam presos a cada átomo", "São compartilhados em um 'mar de elétrons'", "São perdidos completamente", "Formam ligações covalentes polares"],
      ans: 1
    },
    {
      q: "Uma molécula de água (H₂O) possui geometria:",
      opts: ["Linear", "Trigonal plana", "Angular (em V)", "Tetraédrica"],
      ans: 2
    }
  ],
  "Reações Químicas": [
    {
      q: "A Lei de Lavoisier afirma que:",
      opts: ["A energia nunca se conserva", "A massa dos reagentes é igual à dos produtos", "Os átomos podem ser criados", "As reações são sempre espontâneas"],
      ans: 1
    },
    {
      q: "Uma reação exotérmica é aquela que:",
      opts: ["Absorve calor do ambiente", "Libera calor para o ambiente", "Não envolve energia", "Só ocorre a altas pressões"],
      ans: 1
    },
    {
      q: "Na reação A + B → AB, temos uma reação de:",
      opts: ["Decomposição", "Síntese (adição)", "Simples troca", "Dupla troca"],
      ans: 1
    },
    {
      q: "Balancear uma equação química significa:",
      opts: ["Adicionar mais reagentes", "Igualar o número de átomos de cada elemento nos dois lados", "Mudar os produtos", "Aumentar a temperatura"],
      ans: 1
    },
    {
      q: "A fotossíntese é um exemplo de reação:",
      opts: ["Exotérmica", "Endotérmica", "Nuclear", "De simples troca"],
      ans: 1
    }
  ],
  "Química Orgânica": [
    {
      q: "A Química Orgânica estuda compostos baseados em qual elemento?",
      opts: ["Oxigênio", "Hidrogênio", "Carbono", "Nitrogênio"],
      ans: 2
    },
    {
      q: "Hidrocarbonetos são compostos formados apenas por:",
      opts: ["C e O", "C e N", "C e H", "H e O"],
      ans: 2
    },
    {
      q: "Qual a diferença entre alcano e alceno?",
      opts: ["Alcano tem ligação dupla, alceno tem simples", "Alcano tem só ligações simples, alceno tem ligação dupla", "São iguais", "Alcano tem nitrogênio"],
      ans: 1
    },
    {
      q: "O grupo funcional -OH caracteriza qual classe de compostos?",
      opts: ["Ácidos carboxílicos", "Éteres", "Álcoois", "Aminas"],
      ans: 2
    },
    {
      q: "Isomeria ocorre quando compostos possuem:",
      opts: ["Mesma fórmula molecular, mas estruturas diferentes", "Fórmulas moleculares diferentes", "O mesmo ponto de fusão", "A mesma estrutura"],
      ans: 0
    }
  ]
};

// Variáveis de compatibilidade (usada pelo estado atual)
let flashcardsData = flashcardsByTopic["Leis de Newton"];
let examData = examsByTopic["Leis de Newton"];

// ── FLASHCARDS LOGIC ──
let fcCurrent = 1;
let fcTotal = flashcardsData.length;

function startFlashcards() {
  // Carrega flashcards do tópico atual
  if (currentTopicName && flashcardsByTopic[currentTopicName]) {
    flashcardsData = flashcardsByTopic[currentTopicName];
  }
  fcTotal = flashcardsData.length;
  fcCurrent = 1;
  // Atualiza subtítulo com nome do tópico
  const fcSub = document.getElementById('fc-topic-sub');
  if (fcSub) fcSub.textContent = `Flashcards · ${currentTopicName || 'Tópico atual'}`;
  updateFlashcardUI();
  goTo('s-flashcards');
}

function updateFlashcardUI() {
  document.getElementById('fc-progress').textContent = `Cartão ${fcCurrent} de ${fcTotal}`;
  document.getElementById('active-flashcard').classList.remove('flipped');
  
  const currentCard = flashcardsData[fcCurrent - 1];
  document.getElementById('fc-q').textContent = currentCard.q;
  document.getElementById('fc-a').textContent = currentCard.a;
}

function flipCard() {
  const card = document.getElementById('active-flashcard');
  if (!card.classList.contains('flipped')) {
    card.classList.add('flipped');
  }
}

function nextCard(event, isCorrect) {
  event.stopPropagation(); // prevent flip toggle
  if (fcCurrent >= fcTotal) {
    showNotif('Revisão concluída! 🎉');
    goBack();
    return;
  }
  fcCurrent++;
  updateFlashcardUI();
}

// ── EXAM LOGIC ──
let exCurrent = 1;
let exTotal = examData.length;
let exScore = 0;
let exResults = []; 

function startExam() {
  // Carrega exame do tópico atual
  if (currentTopicName && examsByTopic[currentTopicName]) {
    examData = examsByTopic[currentTopicName];
  }
  exTotal = examData.length;
  exCurrent = 1;
  exScore = 0;
  exResults = [];
  // Atualiza subtítulo com nome do tópico
  const exSub = document.getElementById('ex-topic-sub');
  if (exSub) exSub.textContent = `Simulado · ${currentTopicName || 'Exercícios práticos'}`;
  updateExamUI();
  goTo('s-exam');
}

function updateExamUI() {
  const qData = examData[exCurrent - 1];
  
  document.getElementById('ex-prog-text').textContent = `Questão ${exCurrent}/${exTotal}`;
  document.getElementById('ex-prog-fill').style.width = `${(exCurrent / exTotal) * 100}%`;
  
  document.getElementById('ex-qnum').textContent = `Questão ${exCurrent}`;
  document.getElementById('ex-qtext').textContent = qData.q;
  
  const optionsDiv = document.getElementById('ex-options');
  optionsDiv.innerHTML = '';
  optionsDiv.style.pointerEvents = 'auto'; // re-enable clicking
  
  const letters = ['A', 'B', 'C', 'D'];
  qData.opts.forEach((optText, index) => {
    const isCorrect = (index === qData.ans);
    const letter = letters[index];
    
    const optEl = document.createElement('div');
    optEl.className = 'ex-option';
    optEl.onclick = () => selectOption(optEl, isCorrect, qData.ans, index);
    
    optEl.innerHTML = `
      <div class="ex-opt-letter">${letter}</div>
      <div class="ex-opt-text">${optText}</div>
    `;
    
    optionsDiv.appendChild(optEl);
  });
  
  document.getElementById('ex-next-btn').classList.remove('show');
}

function selectOption(el, isCorrect, correctIdx, chosenIdx) {
  const optionsDiv = document.getElementById('ex-options');
  optionsDiv.style.pointerEvents = 'none'; // prevent multiple clicks
  
  const allOpts = optionsDiv.querySelectorAll('.ex-option');
  
  if (isCorrect) {
    el.classList.add('correct');
    exScore++;
  } else {
    el.classList.add('wrong');
    allOpts[correctIdx].classList.add('correct');
  }
  
  exResults.push({
    q: examData[exCurrent - 1].q,
    chosen: chosenIdx,
    correct: correctIdx,
    isCorrect: isCorrect
  });
  
  const nextBtn = document.getElementById('ex-next-btn');
  if (exCurrent === exTotal) {
    nextBtn.textContent = 'Ver Resultado';
  } else {
    nextBtn.textContent = 'Próxima questão';
  }
  nextBtn.classList.add('show');
}

function nextQuestion() {
  if (exCurrent >= exTotal) {
    finishExam();
  } else {
    exCurrent++;
    updateExamUI();
  }
}

function finishExam() {
  document.getElementById('res-score').textContent = `${exScore}/${exTotal}`;
  
  let pct = exScore / exTotal;
  let titleText = 'Bom trabalho!';
  if (pct === 1) titleText = 'Perfeito! 🏆';
  else if (pct < 0.5) titleText = 'Continue praticando! 💪';
  
  document.getElementById('res-title-text').textContent = titleText;
  
  const resList = document.getElementById('res-list');
  resList.innerHTML = '';
  
  exResults.forEach((res, i) => {
    const itemEl = document.createElement('div');
    itemEl.style.display = 'flex';
    itemEl.style.gap = '10px';
    itemEl.style.background = 'var(--surface)';
    itemEl.style.padding = '12px';
    itemEl.style.borderRadius = '12px';
    itemEl.style.border = '1px solid var(--border)';
    
    const iconColor = res.isCorrect ? 'var(--green)' : 'var(--red)';
    const iconMark = res.isCorrect ? '✓' : '✗';
    const bg = res.isCorrect ? 'rgba(0,223,162,0.1)' : 'rgba(255,79,106,0.1)';
    
    itemEl.innerHTML = `
      <div style="width:24px;height:24px;border-radius:6px;background:${bg};color:${iconColor};display:flex;align-items:center;justify-content:center;font-weight:bold;flex-shrink:0;margin-top:2px;">
        ${iconMark}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;">Questão ${i + 1}</div>
        <div style="font-size:11px;color:var(--text3);line-height:1.4;">${res.q}</div>
      </div>
    `;
    
    resList.appendChild(itemEl);
  });
  
  goTo('s-exam-result');
}

// ── THEME TOGGLE ──
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const toggleBtn = document.getElementById('theme-toggle');
  const toggleDesc = document.getElementById('theme-desc');
  
  if (current === 'light') {
    html.removeAttribute('data-theme');
    toggleBtn.classList.remove('on');
    if(toggleDesc) toggleDesc.textContent = 'Modo Escuro';
  } else {
    html.setAttribute('data-theme', 'light');
    toggleBtn.classList.add('on');
    if(toggleDesc) toggleDesc.textContent = 'Modo Claro';
  }
}
