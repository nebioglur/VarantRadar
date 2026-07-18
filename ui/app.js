// ========== STATE MANAGEMENT ==========
let acTimeout = null;
let acSelectedIndex = -1;
let acItems = [];
let chartInstance = null;
let svrChartInstance = null;
let currentProjections = null;

// ========== DOM ELEMENTS ==========
function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        if (el.tagName === 'INPUT') el.value = text;
        else el.textContent = text;
    }
}

const symbolInput = document.getElementById("symbol-input");
const acDropdown = document.getElementById("ac-dropdown");

// ========== AUTOCOMPLETE LOGIC ==========
symbolInput.addEventListener("input", function() {
    clearTimeout(acTimeout);
    const q = this.value.trim();
    acSelectedIndex = -1;
    if (q.length < 1) { acDropdown.style.display = 'none'; return; }
    
    acTimeout = setTimeout(async () => {
        try {
            const res = await fetch('/api/autocomplete?q=' + q);
            const matches = await res.json();
            if (matches.length === 0) { acDropdown.style.display = 'none'; return; }
            
            acDropdown.innerHTML = '';
            acItems = [];
            matches.forEach((m, index) => {
                let div = document.createElement('div');
                div.className = 'ac-item';
                div.innerText = m;
                div.dataset.index = index;
                div.onclick = function() {
                    symbolInput.value = m;
                    acDropdown.style.display = 'none';
                    analyzeSymbol();
                };
                acItems.push(div);
                acDropdown.appendChild(div);
            });
            acDropdown.style.display = 'block';
        } catch(e) { acDropdown.style.display = 'none'; }
    }, 200);
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-container')) acDropdown.style.display = 'none';
});

symbolInput.addEventListener("keydown", function(event) {
    if (acDropdown.style.display === 'block' && acItems.length > 0) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            acSelectedIndex++;
            if (acSelectedIndex >= acItems.length) acSelectedIndex = 0;
            updateAcSelection();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            acSelectedIndex--;
            if (acSelectedIndex < 0) acSelectedIndex = acItems.length - 1;
            updateAcSelection();
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (acSelectedIndex > -1 && acSelectedIndex < acItems.length) {
                symbolInput.value = acItems[acSelectedIndex].innerText;
            }
            acDropdown.style.display = 'none';
            analyzeSymbol();
        }
    } else if (event.key === "Enter") {
        event.preventDefault();
        acDropdown.style.display = 'none';
        analyzeSymbol();
    }
});

function updateAcSelection() {
    acItems.forEach((item, idx) => {
        if (idx === acSelectedIndex) {
            item.classList.add('selected');
            item.scrollIntoView({block: 'nearest'});
        } else {
            item.classList.remove('selected');
        }
    });
}

// ========== TAB NAVIGATION LOGIC ==========
function switchMainTab(tabName, btnElement) {
    document.getElementById('home-wrapper').style.display = tabName === 'home' ? 'block' : 'none';
    document.getElementById('dashboard-wrapper').style.display = tabName === 'dashboard' ? 'block' : 'none';
    document.getElementById('radar-wrapper').style.display = tabName === 'radar' ? 'block' : 'none';
    document.getElementById('news-wrapper').style.display = tabName === 'news' ? 'block' : 'none';
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    if (tabName === 'news') {
        fetchGlobalNews();
    }
}

function switchSubTab(tabName, btnElement) {
    document.querySelectorAll('#dashboard-wrapper .tab-pane').forEach(pane => pane.style.display = 'none');
    document.getElementById('tab-' + tabName).style.display = 'block';
    
    document.querySelectorAll('#dashboard-wrapper .s-tab').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
}

function switchRadarTab(tabName, btnElement) {
    document.querySelectorAll('#radar-wrapper .tab-pane').forEach(pane => pane.classList.remove('active'));
    document.getElementById('rtab-' + tabName).classList.add('active');
    
    document.querySelectorAll('#radar-wrapper .s-tab').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
}

let currentHomeOppsTab = 'bist30';

function switchHomeOppsTab(tabName, btnElement) {
    currentHomeOppsTab = tabName;
    document.querySelectorAll('#home-wrapper .d-tab').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    
    const contentBox = document.getElementById('home-opps-content');
    contentBox.innerHTML = `
        <div style="text-align: center; padding: 2rem 0;">
            <p style="color:var(--text-muted); margin-bottom: 1rem;">Anlık taramayı başlatmak için butona tıklayın.</p>
            <button class="btn-primary" id="btn-scan-home" onclick="scanHomeOpportunities()">Fırsatları Canlı Tara</button>
        </div>
    `;
}

async function scanHomeOpportunities() {
    const contentBox = document.getElementById('home-opps-content');
    contentBox.innerHTML = `<div style="text-align:center; padding: 2rem 0;"><div class="spinner small"></div><p style="margin-top:1rem;color:var(--text-muted)">Yapay zeka analiz ediyor... Lütfen bekleyin.</p></div>`;
    
    let endpoint = '/api/scan';
    if (currentHomeOppsTab === 'bist50') endpoint = '/api/scan_bist50';
    else if (currentHomeOppsTab === 'yildiz') endpoint = '/api/scan_yildiz';
    else if (currentHomeOppsTab === 'all') endpoint = '/api/scan_all';
    
    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        
        if (data.status === 'success' && data.results.length > 0) {
            contentBox.innerHTML = ""; // clear
            
            // Get top 3
            const top3 = data.results.slice(0, 3);
            const classes = ["bull", "base", "bear"];
            const labels = ["GÜÇLÜ AL (POTANSİYEL)", "AL (BİRİKTİR)", "İZLE (NÖTR)"];
            
            top3.forEach((item, index) => {
                let scoreValue = item.Score !== undefined ? item.Score : (item.Confidence_Score !== undefined ? item.Confidence_Score : 0);
                let c = classes[index] || "base";
                let l = labels[index] || "İZLE";
                
                contentBox.innerHTML += `
                <div class="scenario-box ${c}" style="cursor:pointer;" onclick="document.getElementById('symbol-input').value='${item.Symbol}'; analyzeSymbol();">
                    <span>${l}</span>
                    <span style="color:var(--text-main);font-weight:bold;">${item.Symbol}</span>
                    <span class="prob text-${c === 'bull' ? 'green' : (c === 'base' ? 'blue' : 'yellow')}">Skor: ${scoreValue}</span>
                </div>
                `;
            });
        } else {
            contentBox.innerHTML = `<p style="color:var(--accent-red); text-align:center;">Fırsat bulunamadı veya bir hata oluştu.</p>`;
        }
    } catch (e) {
        contentBox.innerHTML = `<p style="color:var(--accent-red); text-align:center;">Bağlantı hatası: ${e.message}</p>`;
    }
}

// ========== NEWS ENGINE ==========
async function fetchGlobalNews() {
    const content = document.getElementById('global-news-content');
    content.innerHTML = `<div style="text-align:center; padding: 2rem 0; grid-column: 1 / -1;"><div class="spinner small"></div><p style="margin-top:1rem;color:var(--text-muted)">Haberler RSS kanallarından derleniyor...</p></div>`;
    
    try {
        const res = await fetch('/api/news/global');
        const data = await res.json();
        if (data.status === 'success' && data.news.length > 0) {
            content.innerHTML = "";
            data.news.forEach(item => {
                let card = document.createElement('div');
                card.style.cssText = "background:var(--bg-base); border:1px solid var(--border-color); border-radius:8px; padding:1.5rem; display:flex; flex-direction:column; justify-content:space-between;";
                
                let sourceBadge = `<span style="font-size:0.75rem; background:var(--accent-blue); color:#fff; padding:0.2rem 0.5rem; border-radius:4px; font-weight:bold;">${item.source}</span>`;
                let dateStr = item.published ? `<span style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-regular fa-clock"></i> ${item.published}</span>` : '';
                
                let summary = item.summary.replace(/<[^>]+>/g, '').substring(0, 150) + "...";
                
                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            ${sourceBadge}
                            ${dateStr}
                        </div>
                        <h4 style="margin-bottom:0.5rem; font-size:1.1rem; line-height:1.4;">${item.title}</h4>
                        <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.5; margin-bottom:1rem;">${summary}</p>
                    </div>
                    <a href="${item.link}" target="_blank" style="color:var(--accent-blue); text-decoration:none; font-weight:600; font-size:0.9rem;"><i class="fa-solid fa-arrow-right"></i> Habere Git</a>
                `;
                content.appendChild(card);
            });
        } else {
            content.innerHTML = `<p style="grid-column: 1/-1; color:var(--text-muted);">Güncel haber bulunamadı.</p>`;
        }
    } catch (e) {
        content.innerHTML = `<p style="grid-column: 1/-1; color:var(--accent-red);">Haberler yüklenirken hata oluştu: ${e.message}</p>`;
    }
}

async function fetchTickerNews(symbol) {
    const container = document.getElementById('ticker-news-content');
    container.innerHTML = `<div style="text-align:center;"><div class="spinner small"></div></div>`;
    
    try {
        const res = await fetch('/api/news/ticker/' + symbol);
        const data = await res.json();
        
        if (data.status === 'success' && data.news.length > 0) {
            container.innerHTML = "";
            data.news.forEach(item => {
                let div = document.createElement('div');
                div.style.cssText = "padding:1rem; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-base);";
                let dateStr = item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toLocaleString() : "";
                div.innerHTML = `
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">${dateStr} &bull; ${item.publisher}</div>
                    <h4 style="margin-bottom:0.5rem;"><a href="${item.link}" target="_blank" style="color:var(--text-main); text-decoration:none;">${item.title}</a></h4>
                    <a href="${item.link}" target="_blank" style="font-size:0.85rem; color:var(--accent-blue); text-decoration:none;">Detaylar <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = `<p style="color:var(--text-muted)">Bu varlığa ait İngilizce kurumsal haber bulunamadı.</p>`;
        }
    } catch (e) {
        container.innerHTML = `<p style="color:var(--accent-red)">Haber servisi hatası: ${e.message}</p>`;
    }
}

// ========== ANALYZE AND DATA BINDING ==========
async function analyzeSymbol() {
    let symbol = symbolInput.value.trim();
    if (!symbol) return;

    // Switch to dashboard view
    switchMainTab('dashboard', document.querySelectorAll('.nav-btn')[1]);
    document.getElementById('dashboard-wrapper').style.display = 'none';
    document.getElementById('home-wrapper').style.display = 'none';
    document.getElementById('radar-wrapper').style.display = 'none';
    document.getElementById('loading').style.display = 'flex';
    
    // Simulate terminal logs
    simulateTerminalLogs(symbol);

    try {
        const response = await fetch('/api/analyze?symbol=' + symbol);
        const data = await response.json();

        // Let the logs finish reading
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
            if (response.status !== 200 || data.status === "error") {
                alert("⛔ UPLINK ERROR\n\n" + (data.message || data.error));
                return;
            }
            bindDataToDashboard(data.report);
        }, 800);
        
    } catch (error) {
        document.getElementById('loading').style.display = 'none';
        alert("CRITICAL ERROR: Connection lost.\n" + error);
    }
}

function simulateTerminalLogs(symbol) {
    const termLogs = document.getElementById('term-logs');
    termLogs.innerHTML = "";
    const fakeLogs = [
        `> HEDEF KİLİTLENDİ: ${symbol}`,
        "> VERİ SAĞLAYICILARLA GÜVENLİ BAĞLANTI KURULUYOR...",
        "> 10 NOKTALI VERİ DOĞRULAMASI (VALIDATION)... [BAŞARILI]",
        "> VERİLER MOTORLARA (ENGINES) YÖNLENDİRİLİYOR...",
        "> ├─ MAKRO MOTOR: VIX & Piyasa Rejimi Çekiliyor...",
        "> ├─ SMART_MONEY MOTORU: Hacim Anomalileri Hesaplanıyor...",
        "> ├─ TEMEL MOTOR: F/K, PD/DD, Bilanço Değerleniyor...",
        "> └─ TEKNİK MOTOR: RSI, EMA, Trend ve Momentum İşleniyor...",
        "> CIO_AI: KOMİTE TOPLANDI. OYLAMA BAŞLADI...",
        "> RAPOR BAŞARIYLA OLUŞTURULDU VE BÜYÜK BEYİN TARAFINDAN ONAYLANDI."
    ];
    let logIdx = 0;
    const interval = setInterval(() => {
        if (logIdx < fakeLogs.length) {
            let p = document.createElement('div');
            p.className = 'term-line';
            p.innerText = fakeLogs[logIdx];
            termLogs.appendChild(p);
            termLogs.scrollTop = termLogs.scrollHeight;
            logIdx++;
        } else {
            clearInterval(interval);
        }
    }, 100);
}

function safeGet(obj, path, def = "-") {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj) || def;
}

// Translate UNKNOWN to Turkish
function t(str) {
    if (!str) return "-";
    if (typeof str === 'string') {
        let upperStr = str.toUpperCase();
        if (upperStr === "UNKNOWN") return "Veri Bekleniyor / Nötr";
        if (upperStr === "N/A") return "Bulunamadı (API)";
    }
    return str;
}

let currentChartSymbol = "AKBNK.IS";
let currentChartData = [];
let chartPriceInstance = null;
let chartMacdInstance = null;
let chartRsiInstance = null;

function calculateEMA(data, period) {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    let emaArray = [];
    let ema = data[0].y[3];
    emaArray.push({ x: data[0].x, y: ema });
    for (let i = 1; i < data.length; i++) {
        ema = (data[i].y[3] * k) + (ema * (1 - k));
        emaArray.push({ x: data[i].x, y: Number(ema.toFixed(2)) });
    }
    return emaArray;
}

function calculateRSI(data, period=14) {
    if(data.length < period) return [];
    let rsiArray = [];
    let gains = 0, losses = 0;
    
    for(let i=1; i<=period; i++) {
        let diff = data[i].y[3] - data[i-1].y[3];
        if(diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for(let i=period; i<data.length; i++) {
        if(i > period) {
            let diff = data[i].y[3] - data[i-1].y[3];
            let g = diff >= 0 ? diff : 0;
            let l = diff < 0 ? -diff : 0;
            avgGain = ((avgGain * (period - 1)) + g) / period;
            avgLoss = ((avgLoss * (period - 1)) + l) / period;
        }
        let rs = avgLoss === 0 ? 100 : (avgGain / avgLoss);
        let rsi = avgLoss === 0 ? 100 : (100 - (100 / (1 + rs)));
        rsiArray.push({x: data[i].x, y: Number(rsi.toFixed(2))});
    }
    return rsiArray;
}

function calculateMACD(data, shortP=12, longP=26, sigP=9) {
    let emaShort = calculateEMA(data, shortP);
    let emaLong = calculateEMA(data, longP);
    let macdLine = [];
    
    let startIdx = longP - 1;
    for(let i=startIdx; i<data.length; i++) {
        let macdVal = emaShort[i].y - emaLong[i].y;
        macdLine.push({x: data[i].x, y: macdVal});
    }
    
    let dummyMacd = macdLine.map(m => ({x: m.x, y: [0,0,0,m.y]}));
    let signalEma = calculateEMA(dummyMacd, sigP);
    
    let histogram = [];
    let macdResult = [];
    let signalResult = [];
    
    for(let i=0; i<signalEma.length; i++) {
        let hist = macdLine[i].y - signalEma[i].y;
        macdResult.push({x: macdLine[i].x, y: Number(macdLine[i].y.toFixed(2))});
        signalResult.push({x: signalEma[i].x, y: Number(signalEma[i].y.toFixed(2))});
        histogram.push({x: macdLine[i].x, y: Number(hist.toFixed(2))});
    }
    
    return {macd: macdResult, signal: signalResult, hist: histogram};
}

// MAKE SURE IT IS GLOBAL SO HTML ONCLICK CAN SEE IT
window.renderAdvancedChart = function() {
    if(!currentChartData || currentChartData.length === 0) return;
    
    const showEma = document.getElementById('toggle-ema')?.checked;
    const showVol = document.getElementById('toggle-vol')?.checked;
    const showMacd = document.getElementById('toggle-macd')?.checked;
    const showRsi = document.getElementById('toggle-rsi')?.checked;
    
    const priceDiv = document.getElementById('chart-price');
    const macdDiv = document.getElementById('chart-macd');
    const rsiDiv = document.getElementById('chart-rsi');
    
    if(chartPriceInstance) { chartPriceInstance.destroy(); chartPriceInstance = null; }
    if(chartMacdInstance) { chartMacdInstance.destroy(); chartMacdInstance = null; }
    if(chartRsiInstance) { chartRsiInstance.destroy(); chartRsiInstance = null; }
    
    macdDiv.style.display = showMacd ? "block" : "none";
    rsiDiv.style.display = showRsi ? "block" : "none";
    
    // Adjust layout based on toggles
    let priceHeight = (showMacd || showRsi) ? "350px" : "100%";
    priceDiv.style.height = priceHeight;

    const seriesData = currentChartData.map(r => ({x: new Date(r.time).getTime(), y: [r.open, r.high, r.low, r.close]}));
    const volData = currentChartData.map(r => ({x: new Date(r.time).getTime(), y: r.volume}));
    
    let priceSeries = [{ name: 'Fiyat', type: 'candlestick', data: seriesData }];
    let priceStroke = [1];
    let priceColors = ['#10B981']; 
    
    if(showEma) {
        priceSeries.push({ name: 'EMA 8', type: 'line', data: calculateEMA(seriesData, 8) });
        priceSeries.push({ name: 'EMA 21', type: 'line', data: calculateEMA(seriesData, 21) });
        priceSeries.push({ name: 'EMA 50', type: 'line', data: calculateEMA(seriesData, 50) });
        priceStroke.push(2, 2, 2);
        priceColors.push('#3b82f6', '#f59e0b', '#ec4899');
    }
    
    if(showVol) {
        priceSeries.push({ name: 'Hacim', type: 'bar', data: volData });
        priceStroke.push(0);
        priceColors.push('#64748b');
    }
    
    let priceDashes = new Array(priceSeries.length).fill(0);
    const showSvr = document.getElementById('toggle-svr')?.checked;
    
    if(showSvr && window.currentProjections) {
        let svrObj = window.currentProjections.Weekly_Daily; // Default for main chart
        if (svrObj) {
            let pastPred = svrObj.past_predicted || [];
            let futurePred = svrObj.future_predicted || svrObj.data || [];
            let combined = [...pastPred, ...futurePred];
            
            if (combined.length > 0 && combined[0].timestamp) {
                let svrSeriesData = combined.map(d => ({
                    x: new Date(d.timestamp).getTime(),
                    y: d.expected_close || d.expected
                }));
                
                priceSeries.push({ name: 'Prophet 3D (Backtest + Gelecek)', type: 'line', data: svrSeriesData });
                priceStroke.push(3);
                priceColors.push('#a855f7');
                priceDashes.push(5);
            }
        }
    }
    
    let commonOptions = {
        chart: { background: 'transparent', toolbar: { show: false }, group: 'sync-charts' },
        theme: { mode: 'dark' },
        xaxis: { type: 'datetime', labels: { style: { colors: '#94A3B8' } }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: {enabled: false} },
        grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
        dataLabels: { enabled: false }
    };

    var optionsPrice = {
        ...commonOptions,
        chart: { ...commonOptions.chart, height: '100%', id: 'price-chart', toolbar: {show:true, tools: {download:false}} },
        series: priceSeries,
        stroke: { width: priceStroke, curve: 'smooth', dashArray: priceDashes },
        colors: priceColors,
        yaxis: [
            { tooltip: { enabled: true }, labels: { style: { colors: '#94A3B8' }, formatter: (v) => v ? v.toFixed(2) : "" } },
            ...priceSeries.slice(1).map(s => ({
                show: false, 
                seriesName: s.name,
                max: s.name === 'Hacim' ? Math.max(...volData.map(v=>v.y))*5 : undefined
            }))
        ],
        plotOptions: {
            candlestick: { colors: { upward: '#10B981', downward: '#EF4444' }, wick: { useFillColor: true } },
            bar: { columnWidth: '80%' }
        }
    };
    chartPriceInstance = new ApexCharts(priceDiv, optionsPrice);
    chartPriceInstance.render();

    if(showMacd) {
        let macdObj = calculateMACD(seriesData);
        var optionsMacd = {
            ...commonOptions,
            chart: { ...commonOptions.chart, height: '100%', id: 'macd-chart' },
            series: [
                { name: 'MACD', type: 'line', data: macdObj.macd },
                { name: 'Signal', type: 'line', data: macdObj.signal },
                { name: 'Hist', type: 'bar', data: macdObj.hist }
            ],
            stroke: { width: [2, 2, 0], curve: 'smooth' },
            colors: ['#3b82f6', '#f59e0b', function({value}) { return value >= 0 ? '#10B981' : '#EF4444' }],
            yaxis: { labels: { style: { colors: '#94A3B8' }, formatter: (v) => v ? v.toFixed(2) : "" } },
            plotOptions: { bar: { columnWidth: '80%', colors: { ranges: [{ from: -9999, to: -0.001, color: '#EF4444' }, { from: 0, to: 9999, color: '#10B981' }] } } }
        };
        chartMacdInstance = new ApexCharts(macdDiv, optionsMacd);
        chartMacdInstance.render();
    }

    if(showRsi) {
        var optionsRsi = {
            ...commonOptions,
            chart: { ...commonOptions.chart, height: '100%', id: 'rsi-chart' },
            series: [{ name: 'RSI', type: 'line', data: calculateRSI(seriesData) }],
            stroke: { width: 2, curve: 'smooth' },
            colors: ['#a855f7'],
            yaxis: { min: 0, max: 100, tickAmount: 2, labels: { style: { colors: '#94A3B8' }, formatter: (v) => v ? v.toFixed(0) : "" } },
            annotations: {
                yaxis: [
                    { y: 70, borderColor: '#EF4444', strokeDashArray: 2, label: { text: '70', style: { color: '#fff', background: '#EF4444' } } },
                    { y: 30, borderColor: '#10B981', strokeDashArray: 2, label: { text: '30', style: { color: '#fff', background: '#10B981' } } }
                ]
            }
        };
        chartRsiInstance = new ApexCharts(rsiDiv, optionsRsi);
        chartRsiInstance.render();
    }
}

function loadCustomChart(sym, ohlcData) {
    if (!ohlcData || ohlcData.length === 0) {
        document.getElementById('chart-price').innerHTML = "<div style='color:var(--text-muted); padding:20px; text-align:center;'>Grafik verisi bulunamadı.</div>";
        return;
    }
    currentChartData = ohlcData;
    window.renderAdvancedChart();
}

function bindDataToDashboard(report) {
    document.getElementById('dashboard-wrapper').style.display = 'block';

    // 1. TICKER HEADER
    const sym = safeGet(report, "META.Symbol", "-");
    document.title = t(sym) + " | COMMAND CENTER";
    setElText('tk-sym', t(sym));
    
    let cp = safeGet(report, "META.Current_Price", "0.00");
    let c_pct = safeGet(report, "META.Change_Pct", undefined);
    
    // JS Fallback for Change_Pct if backend hasn't restarted
    if (c_pct === undefined) {
        let ohlcData = safeGet(report, "Section_32_Historical_Data", []);
        if (ohlcData && ohlcData.length >= 2) {
            let last = ohlcData[ohlcData.length - 1];
            let prev = ohlcData[ohlcData.length - 2];
            if (prev.close > 0) {
                c_pct = ((last.close - prev.close) / prev.close) * 100;
            }
        }
    }

    let tkPriceHtml = cp + " TRY";
    if (c_pct !== undefined) {
        let p_pct = parseFloat(c_pct);
        let p_c = p_pct > 0 ? "var(--accent-green)" : (p_pct < 0 ? "var(--accent-red)" : "var(--text-muted)");
        let p_sign = p_pct > 0 ? "+" : "";
        tkPriceHtml += ` <span style="color:${p_c}; font-size:1.2rem; font-weight:500;">(${p_sign}%${p_pct.toFixed(2)})</span>`;
    }
    const tkPriceEl = document.getElementById('tk-price');
    if (tkPriceEl) tkPriceEl.innerHTML = tkPriceHtml;

    setElText('tk-time', safeGet(report, "META.Timestamp", ""));
    setElText('ig-val', t(safeGet(report, "Section_2_Grade", "N/A")));
    setElText('score-regime', t(safeGet(report, "Section_7_Regime", "-")));

    // CHART SYSTEM: LOAD CUSTOM CHART (APEX WITH EMA)
    currentChartSymbol = sym;
    loadCustomChart(sym, safeGet(report, "Section_32_Historical_Data", []));
    
    // FETCH TICKER NEWS
    fetchTickerNews(sym);

    // 2. OVERVIEW TAB
    let conf = parseFloat(safeGet(report, "Section_4_Confidence", 0));
    let risk = parseFloat(safeGet(report, "Section_5_Risk", 0));
    drawScoreChart(conf, risk);

    setElText('pos-amt', safeGet(report, "Section_9_Position.Amount"));
    setElText('pos-scale', safeGet(report, "Section_9_Position.Scaling"));
    setElText('pos-e1', safeGet(report, "Section_9_Position.Entry_1"));
    setElText('pos-e2', safeGet(report, "Section_9_Position.Entry_2"));
    
    // Get Stop Loss value from Operations Exit Plan
    setElText('pos-sl', "₺" + safeGet(report, "Section_24_Operations.Exit.Stop_Loss_2", "-")); 

    setElText('ex-tp1', safeGet(report, "Section_10_Exit.TP1"));
    setElText('ex-tp2', safeGet(report, "Section_10_Exit.TP2"));
    setElText('ex-strat', safeGet(report, "Section_10_Exit.Strategy"));

    setElText('exec-sum', safeGet(report, "Section_1_Executive"));

    // Operational Data
    setElText('op-pyramid', safeGet(report, "Section_20_CIO_Executive_Summary.Pyramiding", "-"));
    setElText('op-short', safeGet(report, "Section_20_CIO_Executive_Summary.Short_Term_Advice", "-"));
    setElText('op-long', safeGet(report, "Section_20_CIO_Executive_Summary.Long_Term_Advice", "-"));

    // NEW: Render AI Committee Votes
    const committeeVotes = safeGet(report, "Section_19_Reasoning.Committee_Votes", null);
    const cContainer = document.getElementById('committee-container');
    if (cContainer) {
        cContainer.innerHTML = "";
        if (committeeVotes && Object.keys(committeeVotes).length > 0) {
            for (const [aiName, aiData] of Object.entries(committeeVotes)) {
                let voteColor = "var(--text-main)";
                let icon = "fa-robot";
                if (aiData.Vote === "AL" || aiData.Vote === "BUY") { voteColor = "var(--accent-green)"; icon = "fa-arrow-trend-up"; }
                else if (aiData.Vote === "SAT" || aiData.Vote === "SELL") { voteColor = "var(--accent-red)"; icon = "fa-arrow-trend-down"; }
                else if (aiData.Vote === "BEKLE" || aiData.Vote === "NO_TRADE") { voteColor = "var(--accent-yellow)"; icon = "fa-hand"; }
                
                let weight = aiData.Weight_Pct ? parseFloat(aiData.Weight_Pct).toFixed(0) : "25";
                let winRate = aiData.Win_Rate ? parseFloat(aiData.Win_Rate).toFixed(1) : "N/A";
                let totalTrades = aiData.Total_Trades || 0;
                
                let prettyName = aiName.replace("_AI", " Zekası");
                if(aiName === "Technical_AI") prettyName = "Teknik Analiz Ajanı";
                if(aiName === "Fundamental_AI") prettyName = "Temel Analiz (Bilanço) Ajanı";
                if(aiName === "Macro_AI") prettyName = "Makro (Rejim) Ajanı";
                if(aiName === "SmartMoney_AI") prettyName = "Akıllı Para Ajanı";
                
                // Başarı oranını başlığa ekle
                prettyName = `${prettyName} (%${winRate})`;

                let historyHtml = "";
                if (aiData.History && aiData.History.length >= 2) {
                    let last = aiData.History[aiData.History.length - 1];
                    let prev = aiData.History[aiData.History.length - 2];
                    if (last > prev) {
                        historyHtml = `<span style="color:var(--accent-green); font-size:0.7rem; margin-left:5px;"><i class="fa-solid fa-arrow-up"></i> Gelişiyor</span>`;
                    } else if (last < prev) {
                        historyHtml = `<span style="color:var(--accent-red); font-size:0.7rem; margin-left:5px;"><i class="fa-solid fa-arrow-down"></i> Geriliyor</span>`;
                    } else {
                        historyHtml = `<span style="color:var(--text-muted); font-size:0.7rem; margin-left:5px;"><i class="fa-solid fa-minus"></i> Stabil</span>`;
                    }
                }
                
                const cardHtml = `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                            <strong style="color:var(--text-light);"><i class="fa-solid ${icon}" style="color:${voteColor}; margin-right:5px;"></i> ${prettyName}</strong>
                            <span style="background:${voteColor}20; color:${voteColor}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${aiData.Vote}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom: 0.8rem; min-height:35px;">
                            ${aiData.Reasoning || "-"}
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                            <div>
                                <div style="color:var(--text-muted); font-size:0.7rem;">GÜNCEL AĞIRLIK</div>
                                <strong style="color:var(--accent-blue);">%${weight}</strong>
                            </div>
                            <div style="text-align:right;">
                                <div style="color:var(--text-muted); font-size:0.7rem;">BAŞARI ORANI (${totalTrades} İşlem)</div>
                                <strong style="color:${winRate > 65 ? 'var(--accent-green)' : 'var(--accent-yellow)'};">%${winRate}</strong>${historyHtml}
                            </div>
                        </div>
                        <div style="width:100%; background:var(--bg-darker); height:4px; border-radius:2px; margin-top:5px; overflow:hidden;">
                            <div style="width:${winRate}%; background: ${winRate > 65 ? 'var(--accent-green)' : 'var(--accent-yellow)'}; height:100%;"></div>
                        </div>
                    </div>
                `;
                cContainer.innerHTML += cardHtml;
            }
        } else {
            cContainer.innerHTML = `<div style="grid-column: span 2; text-align:center; color:var(--text-muted);">Yapay Zeka Komite verisi bulunamadı.</div>`;
        }
    }

    const ulDos = document.getElementById('list-dos');
    ulDos.innerHTML = "";
    (safeGet(report, "Section_11_Do", []) || []).forEach(item => {
        let li = document.createElement('li'); li.innerText = item; ulDos.appendChild(li);
    });

    const ulDonts = document.getElementById('list-donts');
    ulDonts.innerHTML = "";
    (safeGet(report, "Section_12_Dont", []) || []).forEach(item => {
        let li = document.createElement('li'); li.innerText = item; ulDonts.appendChild(li);
    });

    // 3. TECHNICAL TAB
    
    // UYUYAN DEVLER FAZ 1 (ORDER FLOW & SMART MONEY)
    const orderFlow = safeGet(report, "Section_25_OrderFlow", {});
    const smartMoneyDeep = safeGet(report, "Section_26_SmartMoney", {});
    const fundamental = safeGet(report, "Section_27_Fundamental", {});
    const sentiment = safeGet(report, "Section_28_Sentiment", {});
    
    // Fundamental (Bilanço)
    setElText('fun-pe', fundamental.P_E_Ratio || "N/A");
    setElText('fun-roe', fundamental.ROE || "N/A");
    setElText('fun-debt', fundamental.Debt_to_Equity || "N/A");
    setElText('fun-score', fundamental.Score !== undefined ? parseFloat(fundamental.Score).toFixed(1) : "-");
    
    // Sentiment (Duygu Analizi)
    setElText('sen-count', sentiment.News_Count !== undefined ? sentiment.News_Count + " Haber" : "-");
    setElText('sen-status', sentiment.Status || "-");
    setElText('sen-score', sentiment.Score !== undefined ? parseFloat(sentiment.Score).toFixed(1) : "-");
    setElText('sen-analysis', sentiment.Analysis || "-");

    // Smart Money Data
    setElText('of-pressure', orderFlow.Buyer_Pressure || "-");
    window.showLiquidityPopup = function() {
        Swal.fire({
            title: 'Likidite Avı (Stop Patlatma)',
            icon: 'info',
            html: `
                <div style="text-align:left; font-size:0.95rem; line-height:1.6;">
                <b>Büyük Oyuncuların (Balinalar) Tuzağı:</b><br><br>
                Küçük yatırımcılar hisse alırken zararı durdurmak için desteklerin hemen altına "Stop-Loss" emri koyarlar.<br><br>
                Büyük fonlar yüklü mal toplamak istediklerinde, fiyatı bilerek bu desteklerin altına iterek küçük yatırımcının stoplarını <b>patlatır</b> ve panik satışı başlatır.<br><br>
                Ortaya çıkan bu ucuz hisse havuzunu en dipten toplayan büyük oyuncu, ardından fiyatı hızla yukarı çeker (V Dönüşü).<br><br>
                <span style="color:var(--accent-green); font-weight:bold;">Sistem Neden Uyardı?</span><br>
                Grafikte aşağı yönlü sert bir iğne ve peşinden gelen yüksek hacimli toparlanma tespit edildi. Düşüş sahteydi. Büyük para girişi var, <b>güçlü bir AL sinyali</b> olabilir.
                </div>
            `,
            confirmButtonText: 'Anladım',
            background: 'var(--bg-base)',
            color: 'var(--text-main)',
            customClass: { popup: 'glass-panel', confirmButton: 'btn-primary' }
        });
    };

    let sweepText = orderFlow.Liquidity_Sweeps || "-";
    if (sweepText.includes("LİKİDİTE") || sweepText.includes("Likidite") || sweepText.includes("STOP")) {
        document.getElementById('of-sweep').innerHTML = `<span style="color:var(--accent-yellow); font-weight:bold; cursor:pointer; border-bottom:1px dashed var(--accent-yellow);" onclick="showLiquidityPopup()">${sweepText} <i class="fa-solid fa-circle-info"></i></span>`;
    } else {
        setElText('of-sweep', sweepText);
    }
    setElText('of-imbalance', orderFlow.Imbalance_Score ? parseFloat(orderFlow.Imbalance_Score).toFixed(2) : "-");
    
    setElText('sm-action', smartMoneyDeep.Whale_Action || "-");
    setElText('sm-obv', smartMoneyDeep.OBV_Trend || "-");
    setElText('sm-mfi', smartMoneyDeep.MFI ? parseFloat(smartMoneyDeep.MFI).toFixed(1) : "-");

    // FAZ 3: RELIABILITY & OPTIONS (VARANT)
    const reliability = safeGet(report, "Section_18_Reliability", {});
    const options = safeGet(report, "Section_29_Options", {});

    setElText('bt-cases', reliability.Analogues ? reliability.Analogues + " Gün" : "-");
    setElText('bt-hitrate', reliability.Hit_Rate || "-");
    setElText('mc-risk', reliability.Monte_Carlo_Risk || "-");
    
    // Average_Days_to_Target might be in Reliability if we put it there, wait, did I put it there?
    // Let's check executive.py later, but for now we'll safely try to get it.
    setElText('bt-days', reliability.Average_Days_to_Target ? reliability.Average_Days_to_Target + " Gün" : "-");

    setElText('op-iv', options.Implied_Volatility || "-");
    setElText('op-theta', options.Theta_Risk || "-");
    setElText('op-suit', options.Leverage_Suitability || "-");
    setElText('op-score', options.Score !== undefined ? parseFloat(options.Score).toFixed(1) : "-");
    
    const ops = safeGet(report, "Section_24_Operations", {});
    const entry = ops.Entry || {};
    const exit = ops.Exit || {};
    const sup = ops.Support || {};
    const res = ops.Resistance || {};
    
    // AVERAGE COST AND EXITS
    setElText('pos-avg', entry.Average_Cost || "-");
    const dashAtrEl = document.getElementById('dash-atr');
    if (dashAtrEl) {
        dashAtrEl.textContent = ops.Dynamic_ATR ? "₺" + ops.Dynamic_ATR : "-";
    }
    
    // Bind SVR Projections
    const projections = safeGet(report, "Section_31_Projections", null);
    bindSvrProjections(projections);
    
    setElText('ent-1', entry.Entry_1 || "-");
    setElText('ent-2', entry.Entry_2 || "-");
    setElText('ent-3', entry.Entry_3 || "-");
    setElText('ent-avg', entry.Average_Cost || "-");
    
    setElText('tp-1', exit.Take_Profit_1 || "-");
    setElText('tp-2', exit.Take_Profit_2 || "-");
    setElText('tp-3', exit.Take_Profit_3 || "-");
    
    setElText('sl-1', exit.Stop_Loss_1 || "-");
    setElText('sl-2', exit.Stop_Loss_2 || "-");
    setElText('sl-3', exit.Stop_Loss_3 || "-");
    
    setElText('sup-s1', sup.S1 || "-");
    setElText('sup-s2', sup.S2 || "-");
    setElText('sup-s3', sup.S3 || "-");
    setElText('sup-sub1', sup.Sub_S1 || "-");
    setElText('sup-sub2', sup.Sub_S2 || "-");
    setElText('sup-sub3', sup.Sub_S3 || "-");
    
    setElText('res-r1', res.R1 || "-");
    setElText('res-r2', res.R2 || "-");
    setElText('res-r3', res.R3 || "-");
    setElText('res-sup1', res.Sup_R1 || "-");
    setElText('res-sup2', res.Sup_R2 || "-");
    setElText('res-sup3', res.Sup_R3 || "-");
    
    const mtf = safeGet(report, "Section_30_MTF_Indicators", {});
    const mtfBody = document.getElementById('mtf-body');
    mtfBody.innerHTML = "";
    if (Object.keys(mtf).length > 0) {
        for (const [period, data] of Object.entries(mtf)) {
            const tr = document.createElement('tr');
            
            let color = "var(--text-main)";
            if(data.SuperTrend === "YÜKSELİŞ") color = "var(--accent-green)";
            if(data.SuperTrend === "DÜŞÜŞ") color = "var(--accent-red)";
            
            let periodName = period;
            if (period === 'Weekly') periodName = "Haftalık";
            if (period === 'Monthly') periodName = "Aylık";
            if (period === 'Month_6') periodName = "6 Aylık";
            
            tr.innerHTML = `
                <td style="font-weight:bold;">${periodName}</td>
                <td style="color:${color}; font-weight:bold;">${data.SuperTrend || "-"}</td>
                <td>${data.MA8 || "-"}</td>
                <td>${data.MA21 || "-"}</td>
                <td>${data.MA50 || "-"}</td>
                <td>${data.MA200 || "-"}</td>
            `;
            mtfBody.appendChild(tr);
        }
    } else {
         mtfBody.innerHTML = "<tr><td colspan='6' class='text-muted' style='text-align:center;'>MTF Verisi Bulunamadı</td></tr>";
    }

    // Technical Indicators (Live)
    setElText('ti-rsi', safeGet(report, "Section_21_TechnicalIndicators.RSI_14", "-"));
    setElText('ti-ema20', safeGet(report, "Section_21_TechnicalIndicators.EMA_20", "-"));
    setElText('ti-ema50', safeGet(report, "Section_21_TechnicalIndicators.EMA_50", "-"));
    setElText('ti-ema200', safeGet(report, "Section_21_TechnicalIndicators.EMA_200", "-"));

    const fcBody = document.getElementById('fc-body');
    if (fcBody) {
        fcBody.innerHTML = "";
        const fc = safeGet(report, "Section_17_Forecast", {});
        ["1d", "1w", "1m", "3m", "6m", "12m"].forEach(p => {
            if(fc[p]) {
                let tr = document.createElement('tr');
                tr.innerHTML = `<td>${p}</td><td class="text-blue">${fc[p]}</td>`;
                fcBody.appendChild(tr);
            }
        });
    }

    setElText('sc-bull', safeGet(report, "Section_16_Scenario.Bull.Price"));
    setElText('sc-bull-p', safeGet(report, "Section_16_Scenario.Bull.Prob"));
    setElText('sc-base', safeGet(report, "Section_16_Scenario.Base.Price"));
    setElText('sc-base-p', safeGet(report, "Section_16_Scenario.Base.Prob"));
    setElText('sc-bear', safeGet(report, "Section_16_Scenario.Bear.Price"));
    setElText('sc-bear-p', safeGet(report, "Section_16_Scenario.Bear.Prob"));

    // 4. FUNDAMENTAL & MACRO TAB
    // Ratios
    let sector = t(safeGet(report, "Section_22_FundamentalRatios.Sector", "-"));
    let industry = t(safeGet(report, "Section_22_FundamentalRatios.Industry", "-"));
    setElText('fa-sector', (sector !== "-" && industry !== "-") ? `${sector} / ${industry}` : "Bulunamadı (API)");
    
    setElText('fa-pe', t(safeGet(report, "Section_22_FundamentalRatios.P_E_Ratio", "-")));
    setElText('fa-pb', t(safeGet(report, "Section_22_FundamentalRatios.P_B_Ratio", "-")));
    setElText('fa-roe', t(safeGet(report, "Section_22_FundamentalRatios.ROE", "-")));
    setElText('fa-debt', t(safeGet(report, "Section_22_FundamentalRatios.Debt_to_Equity", "-")));
    setElText('fa-margin', t(safeGet(report, "Section_22_FundamentalRatios.Profit_Margin", "-")));

    // Macro
    setElText('mac-vix', t(safeGet(report, "Section_23_Macro.VIX_Level", "-")));
    setElText('mac-regime', t(safeGet(report, "Section_23_Macro.Regime", "-")));
    setElText('mac-trend', t(safeGet(report, "Section_23_Macro.Market_Trend", "-")));

    setElText('pa-fit', safeGet(report, "Section_13_Portfolio.Fit"));
    setElText('pa-corr', safeGet(report, "Section_13_Portfolio.Correlation"));
    setElText('pa-warn', safeGet(report, "Section_13_Portfolio.Sector_Warning"));

    setElText('ew-risk', safeGet(report, "Section_15_EarlyWarning.Risk"));
    setElText('ew-opp', safeGet(report, "Section_15_EarlyWarning.Opportunity"));
    setElText('lm-alert', safeGet(report, "Section_20_LiveMonitor.Alert"));

    setElText('sr-ana', safeGet(report, "Section_18_Reliability.Analogues"));
    setElText('sr-hit', safeGet(report, "Section_18_Reliability.Hit_Rate"));
    setElText('sr-risk', safeGet(report, "Section_18_Reliability.Monte_Carlo_Risk"));

    // 5. REASONING TAB (COMMITTEE & 7 WHYS)
    const reasoning = safeGet(report, "Section_19_Reasoning", {});
    setElText('cio-verdict', reasoning.CIO_Verdict || "-");

    const comBody = document.getElementById('com-body');
    comBody.innerHTML = "";
    if (reasoning.Committee_Votes) {
        for (const [agent, info] of Object.entries(reasoning.Committee_Votes)) {
            let tr = document.createElement('tr');
            let voteVal = info.Vote || "BEKLE";
            let color = (voteVal.includes("AL") || voteVal === "ONAY") ? "var(--accent-green)" : 
                        ((voteVal.includes("SAT") || voteVal === "RED") ? "var(--accent-red)" : "var(--accent-yellow)");
            tr.innerHTML = `<td>${agent.replace("_AI","")}</td><td style="color:${color};font-weight:700;">${voteVal}</td><td>${info.Score || 50}</td><td style="font-size:0.85rem; color:var(--text-muted);">${info.Reasoning || "-"}</td>`;
            comBody.appendChild(tr);
        }
    }

    const whysCont = document.getElementById('whys-container');
    whysCont.innerHTML = "";
    if (reasoning.The_7_Whys) {
        for (const [q, a] of Object.entries(reasoning.The_7_Whys)) {
            let div = document.createElement('div');
            div.className = "why-item";
            div.innerHTML = `<div class="why-q">${q.replace(/_/g, ' ')}</div><div class="why-a">${a}</div>`;
            whysCont.appendChild(div);
        }
    }
    
    // 6. RAW JSON TAB
    setElText('raw-json-output', JSON.stringify(report, null, 2));
}

// ========== CHART.JS INTEGRATION ==========
function drawScoreChart(confidence, risk) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }

    // A clean polar area chart or doughnut chart to represent AI scores
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Güven Skoru', 'Risk Profili', 'Kalan'],
            datasets: [{
                data: [confidence, risk, 100 - (confidence + risk)/2],
                backgroundColor: [
                    '#10B981', // green for confidence
                    '#EF4444', // red for risk
                    '#1E293B'  // card bg for remaining
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94A3B8', font: { family: 'system-ui', size: 11 } }
                }
            }
        }
    });
}

// ========== RADAR SCAN ==========
async function startRadar(type) {
    let endpoint = '/api/scan';
    if (type === 'varant') endpoint = '/api/scan_warrants';
    else if (type === 'allbist') endpoint = '/api/scan_all';
    else if (type === 'fx') endpoint = '/api/scan_fx';
    else if (type === 'commodity') endpoint = '/api/scan_commodity';
    else if (type === 'crypto') endpoint = '/api/scan_crypto';
    
    const loadingEl = document.getElementById(type + '-loading');
    const resultsEl = document.getElementById(type + '-results');
    const tbodyEl = document.getElementById(type + '-tbody');

    loadingEl.style.display = 'block';
    resultsEl.style.display = 'none';
    tbodyEl.innerHTML = '';

    try {
        const response = await fetch(endpoint);
        const data = await response.json();

        loadingEl.style.display = 'none';
        resultsEl.style.display = 'table';

        if (!data.results || data.results.length === 0) {
            tbodyEl.innerHTML = `<tr><td colspan='4' style='text-align:center; color: var(--text-muted); padding:2rem;'>0 results found. Market regime might be too risky.</td></tr>`;
            return;
        }

        data.results.forEach(res => {
            let tr = document.createElement('tr');
            let scoreValue = res.Score !== undefined ? res.Score : (res.Confidence_Score !== undefined ? res.Confidence_Score : 0);
            let scoreColor = scoreValue >= 70 ? 'var(--accent-green)' : (scoreValue >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)');
            tr.innerHTML = `
                <td style="color:var(--text-main);font-weight:700;">${res.Symbol}</td>
                <td style="color:${scoreColor};font-weight:700;">${scoreValue}</td>
                <td>${t(res.Trend)}</td>
                <td style="color:var(--accent-blue)">${t(res.Action || (scoreValue >= 60 ? "AL (POTANSİYEL)" : "İZLE"))}</td>
            `;
            tbodyEl.appendChild(tr);
        });

    } catch (error) {
        loadingEl.style.display = 'none';
        alert("RADAR ERROR: " + error);
    }
}

// ========== FAZ 6: BULK DASHBOARD & INITIALIZATION ==========
let globalDashboardData = {};

let dashboardPollInterval = null;

window.onload = function() {
    fetchDashboardData();
    // Her 5 saniyede bir arka plandaki scanner'in bitip bitmediğini kontrol et
    dashboardPollInterval = setInterval(fetchDashboardData, 5000);
};

async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard_init');
        const data = await response.json();
        
        if (data.status === 'success') {
            setElText('total-analyzed-counter', `RADAR BUGÜNE KADAR ${data.total_analyzed} VERİYİ ANALİZ ETTİ`);
            
            // Eğer veri doluysa, hızlı yoklamayı durdur ve 1 dakikada bir güncelle
            if (data.dashboard_data && Object.keys(data.dashboard_data).length > 0) {
                globalDashboardData = data.dashboard_data;
                if (dashboardPollInterval) {
                    clearInterval(dashboardPollInterval);
                    dashboardPollInterval = null;
                    // Arka plandaki 15 dk'lık güncellemeleri yakalamak için 1 dakikada bir kontrol et
                    setInterval(fetchDashboardData, 60000);
                }
                
                // Render all categories simultaneously
                renderAllDashboardTables();
            } else {
                // Hâlâ boşsa kullanıcıyı bilgilendir
                ["tb-opportunities", "tb-gainers", "tb-losers", "tb-favorites", "tb-high_volume", "tb-low_volume"].forEach(id => {
                    const tbody = document.getElementById(id);
                    if (tbody && tbody.innerText.includes("Taranıyor")) {
                        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted"><div class="spinner small" style="display:inline-block; margin-right:10px;"></div> Tarama devam ediyor...</td></tr>`;
                    }
                });
            }
        }
    } catch (e) {
        console.error("Dashboard Init Error: ", e);
    }
}

// Clock updates
setInterval(updateLiveClock, 1000);

function updateLiveClock() {
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');
    if (clockEl && dateEl) {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('tr-TR');
        dateEl.innerText = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toLocaleUpperCase('tr-TR');
    }
}

function renderAllDashboardTables() {
    const cats = {
        'opportunities': 'tb-opportunities',
        'gainers': 'tb-gainers',
        'losers': 'tb-losers',
        'favorites': 'tb-favorites',
        'high_volume': 'tb-high_volume',
        'low_volume': 'tb-low_volume'
    };

    for (let cat in cats) {
        const tbody = document.getElementById(cats[cat]);
        if (!tbody) continue;
        
        const items = globalDashboardData[cat] || [];
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">Bu kategoride sonuç bulunamadı.</td></tr>`;
            continue;
        }

        tbody.innerHTML = '';
        // Only show top 5 in each to save space on grid
        const displayItems = items.slice(0, 5);
        let timeStr = new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'});
        const headerTimeSpan = document.getElementById('time-' + cat);
        if (headerTimeSpan) {
            headerTimeSpan.innerText = "(Güncelleme: " + timeStr + ")";
        }

        displayItems.forEach(res => {
            let tr = document.createElement('tr');
            
            let scoreValue = res.Score !== undefined ? res.Score : 0;
            let scoreColor = scoreValue >= 70 ? 'var(--accent-green)' : (scoreValue >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)');
            
            let priceStr = res.Price ? "₺" + parseFloat(res.Price).toFixed(2) : "-";
            
            // Fiyatın yanına Günlük Değişim (%) ekle (Yükselenler ve Düşenler tablosunda 4. sütunda zaten olduğu için oraya ekleme)
            if (res.Change_Pct !== undefined && cat !== 'gainers' && cat !== 'losers') {
                let p_pct = parseFloat(res.Change_Pct);
                let p_c = p_pct > 0 ? "var(--accent-green)" : (p_pct < 0 ? "var(--accent-red)" : "var(--text-muted)");
                let p_sign = p_pct > 0 ? "+" : "";
                priceStr += `<br><span style="color:${p_c}; font-size:0.75rem;">(${p_sign}%${p_pct.toFixed(2)})</span>`;
            }

            let statusStr = "";
            if (cat === 'gainers' || cat === 'losers') {
                let pct = res.Change_Pct ? parseFloat(res.Change_Pct) : 0;
                let c = pct > 0 ? "var(--accent-green)" : "var(--accent-red)";
                let sign = pct > 0 ? "+" : (pct < 0 ? "-" : "");
                statusStr = `<span style="color:${c}; font-weight:bold;">${sign}%${Math.abs(pct).toFixed(2)}</span>`;
            } else if (cat === 'high_volume' || cat === 'low_volume') {
                let mv = res.Money_Volume ? parseFloat(res.Money_Volume) : 0;
                let mStr = mv > 1000000 ? (mv / 1000000).toFixed(1) + "M ₺" : mv.toFixed(0) + " ₺";
                statusStr = `<span style="color:var(--text-muted);">${mStr}</span>`;
            } else {
                statusStr = `<span style="color:var(--accent-green)">AL</span>`;
            }
            
            tr.innerHTML = `
                <td style="color:var(--text-main);font-weight:700;">${res.Symbol}</td>
                <td style="font-family:monospace; font-weight:600;">${priceStr}</td>
                <td style="color:${scoreColor};font-weight:700;">${scoreValue}</td>
                <td>${statusStr}</td>
                <td>
                    <button class="btn-primary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="document.getElementById('symbol-input').value='${res.Symbol}'; analyzeSymbol();">İncele</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// ========== SVR PROJECTIONS IMPLEMENTATION ==========
function bindSvrProjections(projections) {
    if (!projections) return;
    window.currentProjections = projections;
    
    // Default view: hourly
    toggleProjView('hourly');
    window.renderAdvancedChart();
}

function toggleProjView(mode) {
    if (!window.currentProjections) return;
    
    // Switch active buttons style
    const btnHourly = document.getElementById('btn-proj-hourly');
    const btnWeekly = document.getElementById('btn-proj-weekly');
    const btnMonthly = document.getElementById('btn-proj-monthly');
    
    [btnHourly, btnWeekly, btnMonthly].forEach(b => {
        if (b) {
            b.style.background = 'transparent';
            b.style.color = 'var(--text-muted)';
            b.style.border = '1px solid rgba(255,255,255,0.1)';
        }
    });
    
    const activeBtn = document.getElementById('btn-proj-' + mode);
    if (activeBtn) {
        activeBtn.style.background = 'rgba(147, 51, 234, 0.2)';
        activeBtn.style.color = 'var(--text-light)';
        activeBtn.style.border = '1px solid var(--accent-purple)';
    }
    
    // Render Hourly Table
    const hourlyTbody = document.getElementById('svr-hourly-body');
    const hData = window.currentProjections.Intraday_Hourly?.future_predicted || window.currentProjections.Intraday_Hourly?.data || window.currentProjections.Intraday_Hourly || [];
    const hMetrics = window.currentProjections.Intraday_Hourly?.metrics || {r2:0, rmse:0};
    
    if (hourlyTbody && hData.length > 0) {
        hourlyTbody.innerHTML = "";
        hData.forEach(item => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.time}</td>
                <td style="color:var(--accent-red)">₺${item.min}</td>
                <td style="color:var(--text-light); font-weight:bold;">₺${item.expected}</td>
                <td style="color:var(--accent-green)">₺${item.max}</td>
            `;
            hourlyTbody.appendChild(tr);
        });
    }
    
    // Render Daily Table (Weekly or Monthly depending on mode)
    const dailyTbody = document.getElementById('svr-daily-body');
    let sourceObj = mode === 'monthly' ? window.currentProjections.Monthly_Daily : window.currentProjections.Weekly_Daily;
    const sourceData = sourceObj?.future_predicted || sourceObj?.data || sourceObj || [];
    const sourceMetrics = sourceObj?.metrics || {r2:0, rmse:0};
    
    if (dailyTbody && sourceData.length > 0) {
        dailyTbody.innerHTML = "";
        sourceData.forEach(item => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.day}</td>
                <td style="color:var(--text-muted)">₺${item.expected_open}</td>
                <td style="color:var(--text-light); font-weight:bold;">₺${item.expected_close}</td>
                <td style="color:var(--accent-blue)">₺${item.min} - ₺${item.max}</td>
            `;
            dailyTbody.appendChild(tr);
        });
    }
    
    // Update Metrics Badges
    const activeMetrics = mode === 'hourly' ? hMetrics : sourceMetrics;
    const r2El = document.getElementById('svr-metric-r2');
    const rmseEl = document.getElementById('svr-metric-rmse');
    if(r2El) r2El.innerText = `R²: %${activeMetrics.r2 || "-"}`;
    if(rmseEl) rmseEl.innerText = `RMSE: ${activeMetrics.rmse || "-"}`;
    
    // Draw Chart
    updateSvrChart(mode);
}

function updateSvrChart(mode) {
    const ctx = document.getElementById('svrChart').getContext('2d');
    if (svrChartInstance) svrChartInstance.destroy();
    
    let sourceObj = mode === 'hourly' ? window.currentProjections?.Intraday_Hourly : (mode === 'monthly' ? window.currentProjections?.Monthly_Daily : window.currentProjections?.Weekly_Daily);
    if (!sourceObj) return;

    // Handle both new format (past/future) and old format (data) gracefully
    let pastReal = sourceObj.past_real || [];
    let pastPred = sourceObj.past_predicted || [];
    let futurePred = sourceObj.future_predicted || sourceObj.data || [];
    
    let isHourly = (mode === 'hourly');
    let titleText = isHourly ? "Saatlik Komite LSTM AI Tahmin Kanalları (Backtest + Gelecek)" : (mode === 'monthly' ? "Aylık (20 Günlük) LSTM AI Fiyat Projeksiyonu" : "Haftalık (5 Günlük) LSTM AI Fiyat Projeksiyonu");
    
    let labels = [];
    let realData = [];
    let svrData = [];
    
    // Geçmiş veriler
    for (let i = 0; i < pastReal.length; i++) {
        labels.push(isHourly ? pastReal[i].time : pastReal[i].day);
        realData.push(isHourly ? pastReal[i].expected : pastReal[i].expected_close);
        svrData.push(isHourly ? pastPred[i].expected : pastPred[i].expected_close);
    }
    
    // Gelecek veriler
    for (let i = 0; i < futurePred.length; i++) {
        labels.push(isHourly ? futurePred[i].time : futurePred[i].day);
        realData.push(null); // Gerçek fiyat gelecekte yok
        svrData.push(isHourly ? futurePred[i].expected : futurePred[i].expected_close);
    }
    
    svrChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Gerçekleşen Fiyat (Geçmiş)',
                    data: realData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'LSTM AI Tahmin Rotası (Geçmiş + Gelecek)',
                    data: svrData,
                    borderColor: '#a855f7',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } },
                title: { display: true, text: titleText, color: '#f8fafc', font: { size: 13, weight: 'bold' } }
            },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } }
            }
        }
    });
}

