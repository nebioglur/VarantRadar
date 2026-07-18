import requests
from datetime import datetime
from database.db_manager import DBManager
from utils.logger import logger

class NotificationManager:
    """
    VarantRadar Pro V7 - Bildirim ve Alarm Merkezi
    Telegram Bot API üzerinden kullanıcılara anlık sinyal ve portföy uyarıları gönderir.
    """
    def __init__(self):
        self.db = DBManager()
        self._load_settings()

    def _load_settings(self):
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT setting_value FROM settings WHERE setting_key='telegram_token'")
            row = cursor.fetchone()
            self.telegram_token = row[0] if row else None
            
            cursor.execute("SELECT setting_value FROM settings WHERE setting_key='telegram_chat_id'")
            row = cursor.fetchone()
            self.telegram_chat_id = row[0] if row else None
        finally:
            conn.close()

    def send_telegram_message(self, message: str) -> bool:
        """Belirtilen Chat ID'ye Telegram mesajı gönderir."""
        if not self.telegram_token or not self.telegram_chat_id:
            logger.warning("Telegram ayarları eksik. Bildirim gönderilemedi.")
            return False
            
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        payload = {
            "chat_id": self.telegram_chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        
        try:
            response = requests.post(url, json=payload, timeout=5)
            if response.status_code == 200:
                self._log_alert(message, "TELEGRAM", "SUCCESS")
                return True
            else:
                logger.error(f"Telegram API Hatası: {response.text}")
                self._log_alert(message, "TELEGRAM", "FAILED")
                return False
        except Exception as e:
            logger.error(f"Telegram gönderim hatası: {e}")
            self._log_alert(message, "TELEGRAM", "ERROR")
            return False

    def send_radar_alert(self, symbol: str, score: int, level: str, reason: str):
        """Radar yeni bir fırsat bulduğunda tetiklenir."""
        msg = f"🚨 <b>YENİ RADAR FIRSATI</b> 🚨\n\n"
        msg += f"📌 <b>Hisse:</b> {symbol}\n"
        msg += f"⭐ <b>Puan:</b> {score}/100\n"
        msg += f"📊 <b>Seviye:</b> {level}\n"
        msg += f"💡 <b>Neden:</b> {reason}\n\n"
        msg += f"🤖 <i>VarantRadar Pro V7 Otomasyon Sistemi</i>"
        self.send_telegram_message(msg)

    def send_portfolio_alert(self, symbol: str, pnl_pct: float, action: str):
        """Stop veya Take Profit seviyesine gelindiğinde tetiklenir."""
        icon = "🟢" if pnl_pct > 0 else "🔴"
        msg = f"{icon} <b>PORTFÖY ALARMI</b> {icon}\n\n"
        msg += f"📌 <b>İşlem:</b> {action} {symbol}\n"
        msg += f"💰 <b>Kâr/Zarar:</b> %{round(pnl_pct, 2)}\n\n"
        msg += f"🤖 <i>Lütfen sistemden kontrol ediniz.</i>"
        self.send_telegram_message(msg)

    def _log_alert(self, message: str, channel: str, status: str):
        """Gönderilen alarmları veritabanına kaydeder."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''INSERT INTO system_logs (level, message, created_at) 
                              VALUES (?, ?, ?)''',
                           (f"ALERT_{channel}_{status}", message[:100] + "...", datetime.now().isoformat()))
            conn.commit()
        except Exception as e:
            logger.error(f"Alert loglama hatası: {e}")
        finally:
            conn.close()

    def update_settings(self, token: str, chat_id: str):
        """Telegram ayarlarını günceller."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            
            # Upsert logic for token
            cursor.execute("INSERT OR REPLACE INTO settings (id, setting_key, setting_value, updated_at) VALUES ((SELECT id FROM settings WHERE setting_key='telegram_token'), 'telegram_token', ?, ?)", (token, now))
            
            # Upsert logic for chat_id
            cursor.execute("INSERT OR REPLACE INTO settings (id, setting_key, setting_value, updated_at) VALUES ((SELECT id FROM settings WHERE setting_key='telegram_chat_id'), 'telegram_chat_id', ?, ?)", (chat_id, now))
            
            conn.commit()
            self.telegram_token = token
            self.telegram_chat_id = chat_id
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Ayarlar güncellenemedi: {e}")
            return False
        finally:
            conn.close()
