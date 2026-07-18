import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sys

# Ana dizindeki main.py'deki fonksiyonu Ã§aÄŸÄ±racaÄŸÄ±z
from main import run_simulation_api
from decision.exceptions import InsufficientConfidenceError

# Scanner iÃ§in gerekenler
from scanner.universal_scanner import UniversalScanner
from data.pipeline import DataPipeline
from data.providers.yfinance_provider import YFinanceProvider
from config.bist_symbols import BIST_SYMBOLS, BIST30_SYMBOLS, BIST50_SYMBOLS, YILDIZ_SYMBOLS, FX_SYMBOLS, COMMODITY_SYMBOLS, CRYPTO_SYMBOLS
import feedparser
import threading
import time
import json
import os

STATS_FILE = "stats.json"
GLOBAL_OPPORTUNITIES_CACHE = []

def load_stats():
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r") as f:
                return json.load(f)
        except:
            return {"total_analyzed": 0}
    return {"total_analyzed": 0}

def save_stats(stats):
    try:
        with open(STATS_FILE, "w") as f:
            json.dump(stats, f)
    except Exception as e:
        print(f"Stats save error: {e}")

CACHE_FILE = "dashboard_cache.json"

def load_dashboard_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_dashboard_cache(data):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Cache save error: {e}")

GLOBAL_DASHBOARD_CACHE = load_dashboard_cache()
def background_scanner():
    """Arka planda çalışıp periyodik olarak TÜM BIST fırsatlarını tarar ve belleğe alır."""
    global GLOBAL_DASHBOARD_CACHE
    pipeline = DataPipeline()
    scanner = UniversalScanner(pipeline)
    
    # Hızlı Başlangıç (Fast Start): Eğer cache boşsa kullanıcıyı bekletmemek için sadece BIST 50'yi anında tara
    if not GLOBAL_DASHBOARD_CACHE:
        try:
            print("[BACKGROUND] Hızlı Başlangıç (Fast Start) - Sadece BIST 50 taranıyor...")
            fast_results = scanner.scan_pool_bulk(BIST50_SYMBOLS)
            GLOBAL_DASHBOARD_CACHE = fast_results
            save_dashboard_cache(fast_results)
            print("[BACKGROUND] Hızlı Başlangıç tamamlandı. Kullanıcı arayüzü artık dolu.")
        except Exception as e:
            print(f"[BACKGROUND] Hızlı Başlangıç Hatası: {e}")

    while True:
        try:
            print("[BACKGROUND] Tüm BIST hisseleri için Kapsamlı (Bulk) Data indiriliyor...")
            
            # 550 hisseyi tek bir pakette indir:
            results = scanner.scan_pool_bulk(BIST_SYMBOLS)
            GLOBAL_DASHBOARD_CACHE = results
            save_dashboard_cache(results)
            
            print(f"[BACKGROUND] Kapsamlı Tarama tamamlandı. Veriler önbelleğe ve diske kaydedildi.")
            
        except Exception as e:
            print(f"[BACKGROUND] Bulk Tarama hatası: {e}")
            
        # Dinlen (15 dakika)
        time.sleep(900)

# Varant Sembolleri (Örnek Liste - IS Warrant yapısı)
WARRANT_SYMBOLS = [
    "GARAN-240726-C-130.IS", "GARAN-240726-P-120.IS",
    "THYAO-240726-C-350.IS", "THYAO-240726-P-300.IS",
    "ASELS-240726-C-80.IS", "ASELS-240726-P-60.IS",
    "TUPRS-240726-C-200.IS", "TUPRS-240726-P-150.IS",
    "AKBNK-240726-C-60.IS", "AKBNK-240726-P-50.IS",
    "EREGL-240726-C-60.IS", "EREGL-240726-P-45.IS",
    "SAHOL-240726-C-90.IS", "SAHOL-240726-P-75.IS",
    "BIMAS-240726-C-600.IS", "BIMAS-240726-P-500.IS",
    "KCHOL-240726-C-250.IS", "KCHOL-240726-P-200.IS",
    "SISE-240726-C-100.IS", "SISE-240726-P-80.IS",
]

# Tüm sembol listesi (autocomplete için)
ALL_SYMBOLS = [s.replace('.IS','') for s in BIST_SYMBOLS] + [w.replace('.IS','') for w in WARRANT_SYMBOLS] + FX_SYMBOLS + COMMODITY_SYMBOLS + CRYPTO_SYMBOLS

app = Flask(__name__, static_folder='ui')
CORS(app) # GeliÅŸtirme aÅŸamasÄ± iÃ§in Cross-Origin izin verilir

@app.route('/')
def serve_ui():
    """VarsayÄ±lan olarak index.html'i aÃ§ar"""
    return send_from_directory('ui', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """CSS ve JS dosyalarÄ±nÄ± UI klasÃ¶rÃ¼nden sunar"""
    return send_from_directory('ui', path)

import math
import numpy as np
import pandas as pd

def sanitize_for_json(obj):
    """
    Sözlük veya liste içindeki tüm NumPy tiplerini ve NaN değerlerini 
    JSON ile uyumlu standart Python tiplerine (None vb.) çevirir.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, float) or isinstance(obj, np.floating):
        if math.isnan(obj) or np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    elif pd.isna(obj): # pd.NaT veya pandas NA
        return None
    return obj

@app.route('/api/analyze', methods=['GET'])
def api_analyze():
    """Ana analiz uÃ§ noktasÄ± (Ã–rn: /api/analyze?symbol=AAPL)"""
    symbol = request.args.get('symbol', 'AAPL').upper()
    
    # Türk hisseleri (Örn: EFOR, AHSGY, SASA, GARAN) 4 veya 5 harfli olabilir.
    # Eğer sonu .IS ile bitmiyorsa ve döviz/kripto değilse otomatik .IS ekliyoruz.
    if "." not in symbol:
        if symbol not in FX_SYMBOLS and symbol not in CRYPTO_SYMBOLS and symbol not in COMMODITY_SYMBOLS:
            symbol = f"{symbol}.IS"
        
    try:
        # main.py iÃ§erisindeki o devasa 13 soruluk dÃ¶ngÃ¼yÃ¼ baÅŸlat
        report = run_simulation_api(symbol)
        
        # Analiz sayacını artır
        stats = load_stats()
        stats["total_analyzed"] = stats.get("total_analyzed", 0) + 1
        save_stats(stats)
        
        if "error" in report:
            return jsonify({"status": "error", "message": report["error"]}), 400
            
        # JSON'a çevrilirken hata vermemesi için NaN'ları ve Numpy tiplerini temizle
        safe_report = sanitize_for_json(report)
        
        return jsonify({
            "status": "success",
            "symbol": symbol,
            "report": safe_report
        })
        
    except InsufficientConfidenceError as e:
        # DeÄŸiÅŸtirilemez Ä°lke (BÃ¶lÃ¼m 18) Devreye Girdi
        return jsonify({
            "status": "rejected",
            "symbol": symbol,
            "message": str(e)
        }), 403
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/autocomplete', methods=['GET'])
def api_autocomplete():
    """Hisse veya Varant sembolünün ilk harflerine göre eşleşen listesini döndürür."""
    q = request.args.get('q', '').upper()
    if len(q) < 1:
        return jsonify([])
    matches = [s for s in ALL_SYMBOLS if s.startswith(q)][:15]
    return jsonify(matches)

@app.route('/api/dashboard_init', methods=['GET'])
def api_dashboard_init():
    """Ön yüz ilk açıldığında gösterilecek Fırsatları ve Sayaçları döner."""
    stats = load_stats()
    return jsonify({
        "status": "success",
        "total_analyzed": stats.get("total_analyzed", 0),
        "dashboard_data": GLOBAL_DASHBOARD_CACHE
    })

@app.route('/api/pool_info', methods=['GET'])
def pool_info():
    """Önyüze radar havuzunun boyutunu döndürür."""
    pool = BIST30_SYMBOLS
    return jsonify({"status": "success", "pool_size": len(pool), "pool": pool})

@app.route('/api/scan', methods=['GET'])
def api_scan():
    """Hisse Radarı: BIST30 listesini tarar."""
    pool = BIST30_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_warrants', methods=['GET'])
def api_scan_warrants():
    """Varant Radarı: Varant listesini tarar."""
    pool = WARRANT_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_bist50', methods=['GET'])
def api_scan_bist50():
    pool = BIST50_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_yildiz', methods=['GET'])
def api_scan_yildiz():
    pool = YILDIZ_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_all', methods=['GET'])
def api_scan_all():
    pool = BIST_SYMBOLS # Artık Bulk Scan sayesinde tüm hisseleri saniyeler içinde tarayabilir.
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_fx', methods=['GET'])
def api_scan_fx():
    pool = FX_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_commodity', methods=['GET'])
def api_scan_commodity():
    pool = COMMODITY_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/scan_crypto', methods=['GET'])
def api_scan_crypto():
    pool = CRYPTO_SYMBOLS
    try:
        pipeline = DataPipeline()
        scanner = UniversalScanner(pipeline)
        results = scanner.scan_pool_bulk(pool).get("opportunities", [])
        return jsonify({"status": "success", "count": len(results), "results": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/api/health', methods=['GET'])
def api_health():
    """Tüm veri sağlayıcılarının sağlık durumunu döndürür."""
    try:
        pipeline = DataPipeline()
        health_report = pipeline.get_health_report()
        return jsonify({"status": "success", "data": health_report})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/news/global', methods=['GET'])
def api_news_global():
    feeds = [
        "https://www.haberturk.com/rss/ekonomi.xml",
        "https://www.trthaber.com/ekonomi_articles.rss"
    ]
    news_items = []
    try:
        for feed_url in feeds:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:15]:
                news_items.append({
                    "title": entry.get("title", ""),
                    "summary": entry.get("summary", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": "Habertürk" if "haberturk" in feed_url else "TRT Haber"
                })
        return jsonify({"status": "success", "news": news_items})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/news/ticker/<symbol>', methods=['GET'])
def api_news_ticker(symbol):
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        news = ticker.news
        if not news:
            news = []
        return jsonify({"status": "success", "news": news})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    """Ayarları getiren ve güncelleyen API ucu."""
    # Bu endpoint'ler normalde bir yetkilendirme (API Key vb.) ile korunmalıdır.
    from database.db_manager import DBManager
    from services.notification_manager import NotificationManager

    if request.method == 'GET':
        try:
            notif = NotificationManager()
            db = DBManager()
            gemini_key = db.get_setting('gemini_api_key')
            
            return jsonify({
                "status": "success",
                "telegram_token": notif.telegram_token,
                "telegram_chat_id": notif.telegram_chat_id,
                "gemini_api_key": gemini_key
            })
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    if request.method == 'POST':
        try:
            data = request.json
            notif = NotificationManager()
            notif.update_settings(data.get('telegram_token'), data.get('telegram_chat_id'))
            
            db = DBManager()
            db.save_setting('gemini_api_key', data.get('gemini_api_key'))
            return jsonify({"status": "success", "message": "Ayarlar başarıyla kaydedildi."})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Flask restart sorunu yaşamaması için arka plan tarayıcı thread'ini başlat
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        t = threading.Thread(target=background_scanner, daemon=True)
        t.start()

    print("🛠️ VarantRadar Pro Web Server Başlatılıyor...")
    
    # Render'da çalışıyorsa Render'ın URL'sini, yoksa yerel URL'yi göster
    port = int(os.getenv('PORT', 5000))
    render_url = os.getenv('RENDER_EXTERNAL_URL')
    if render_url:
        print(f"🔗 Sunucu şu adreste çalışıyor: {render_url}")
    else:
        print(f"🔗 Tarayıcınızdan şu adrese gidin: http://127.0.0.1:{port}")

    # Render uyumlu çalıştırma (PORT ortamsal değişkenini kullan)
    app.run(host='0.0.0.0', port=port)
