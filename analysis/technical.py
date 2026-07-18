import pandas as pd
import numpy as np
from typing import Dict, Any, Union
from core.interfaces import BaseEngine

class TechnicalEngine(BaseEngine):
    """
    CFG-04 Analysis Architecture (Technical Core)
    Fiyat hareketlerinin mekaniğini (Trend ve Momentum) analiz eder.
    BaseEngine standartlarına uygun (0-100) skor döner.
    """
    
    def analyze(self, symbol: str, data: Any = None) -> Dict[str, Union[float, str]]:
        result = {
            "Score": 50.0,
            "Status": "UNKNOWN",
            "Trend": "UNKNOWN",
            "Momentum": "UNKNOWN",
            "Analysis": "Yetersiz Veri"
        }
        
        if data is None or not isinstance(data, pd.DataFrame) or data.empty or len(data) < 50:
            self.validate_output(result)
            return result
            
        df = data
        close = df['close'] if 'close' in df.columns else df['Close']
        
        try:
            # 1. Trend Tanıma (Hareketli Ortalamalar)
            ema20 = close.ewm(span=20, adjust=False).mean()
            ema50 = close.ewm(span=50, adjust=False).mean()
            ema200 = close.ewm(span=200, adjust=False).mean()
            
            c = close.iloc[-1]
            e20 = ema20.iloc[-1]
            e50 = ema50.iloc[-1]
            e200 = ema200.iloc[-1]
            
            trend_score = 0
            trend_status = "YATAY"
            
            if c > e20 and e20 > e50 and e50 > e200:
                trend_score = 100
                trend_status = "GÜÇLÜ YÜKSELİŞ"
            elif c > e20 and e20 > e50:
                trend_score = 75
                trend_status = "YÜKSELİŞ"
            elif c < e20 and e20 < e50 and e50 < e200:
                trend_score = 0
                trend_status = "GÜÇLÜ DÜŞÜŞ"
            elif c < e20 and e20 < e50:
                trend_score = 25
                trend_status = "DÜŞÜŞ"
            else:
                trend_score = 50
                trend_status = "YATAY"
                
            # 2. Momentum (RSI)
            delta = close.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss.replace(0, np.nan)
            rsi = 100 - (100 / (1 + rs))
            current_rsi = rsi.iloc[-1]
            
            momentum_score = 50
            momentum_status = "NÖTR"
            
            if pd.notna(current_rsi):
                if current_rsi > 70:
                    momentum_score = 80
                    momentum_status = "AŞIRI ALIM (Overbought)"
                elif current_rsi < 30:
                    momentum_score = 20
                    momentum_status = "AŞIRI SATIM (Oversold)"
                elif current_rsi > 50:
                    momentum_score = 65
                    momentum_status = "POZİTİF"
                else:
                    momentum_score = 35
                    momentum_status = "NEGATİF"
            
            # Kural: Trende karşı Momentum sahtedir (CFG-04)
            final_score = (trend_score * 0.7) + (momentum_score * 0.3)
            
            # RSI şişmiş ama trend düşüşteyse ceza (Fakeout cezası)
            if trend_status == "DÜŞÜŞ" and momentum_status == "AŞIRI ALIM (Overbought)":
                final_score -= 20
                
            final_score = max(0.0, min(100.0, float(final_score)))
            result["Score"] = final_score
            
            if final_score >= 70:
                result["Status"] = "AL"
            elif final_score <= 30:
                result["Status"] = "SAT"
            else:
                result["Status"] = "BEKLE"
                
            result["Trend"] = trend_status
            result["Momentum"] = momentum_status
            result["Indicators"] = {
                "RSI_14": round(current_rsi, 2) if pd.notna(current_rsi) else "N/A",
                "EMA_20": round(e20, 2),
                "EMA_50": round(e50, 2),
                "EMA_200": round(e200, 2)
            }
            
            # --- FAZ 4: MTF (Multi-Timeframe) Analizi ---
            mtf_data = {}
            if isinstance(df.index, pd.DatetimeIndex):
                # Haftalık (W) Resampling
                weekly_df = df.resample('W').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
                if not weekly_df.empty:
                    w_c = weekly_df['close']
                    w_ma8 = w_c.rolling(8, min_periods=1).mean().iloc[-1]
                    w_ma21 = w_c.rolling(21, min_periods=1).mean().iloc[-1]
                    w_ma50 = w_c.rolling(50, min_periods=1).mean().iloc[-1]
                    w_ma200 = w_c.rolling(200, min_periods=1).mean().iloc[-1]
                    mtf_data['Weekly'] = {
                        "MA8": round(w_ma8, 2) if pd.notna(w_ma8) else "N/A",
                        "MA21": round(w_ma21, 2) if pd.notna(w_ma21) else "N/A",
                        "MA50": round(w_ma50, 2) if pd.notna(w_ma50) else "N/A",
                        "MA200": round(w_ma200, 2) if pd.notna(w_ma200) else "N/A",
                        "SuperTrend": "YÜKSELİŞ" if w_c.iloc[-1] > (w_ma21 if pd.notna(w_ma21) else 0) else "DÜŞÜŞ"
                    }
                    
                # Aylık (M) Resampling
                monthly_df = df.resample('ME').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
                if not monthly_df.empty:
                    m_c = monthly_df['close']
                    m_ma8 = m_c.rolling(8, min_periods=1).mean().iloc[-1]
                    m_ma21 = m_c.rolling(21, min_periods=1).mean().iloc[-1]
                    m_ma50 = m_c.rolling(50, min_periods=1).mean().iloc[-1]
                    m_ma200 = m_c.rolling(200, min_periods=1).mean().iloc[-1]
                    mtf_data['Monthly'] = {
                        "MA8": round(m_ma8, 2) if pd.notna(m_ma8) else "N/A",
                        "MA21": round(m_ma21, 2) if pd.notna(m_ma21) else "N/A",
                        "MA50": round(m_ma50, 2) if pd.notna(m_ma50) else "N/A",
                        "MA200": round(m_ma200, 2) if pd.notna(m_ma200) else "N/A",
                        "SuperTrend": "YÜKSELİŞ" if m_c.iloc[-1] > (m_ma21 if pd.notna(m_ma21) else 0) else "DÜŞÜŞ"
                    }
                    
                # 6 Aylık (6M) Resampling (Kullanıcı Talebi: Faz-4 Unutma)
                semi_annual_df = df.resample('6ME').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
                if not semi_annual_df.empty:
                    sa_c = semi_annual_df['close']
                    sa_ma8 = sa_c.rolling(8, min_periods=1).mean().iloc[-1]
                    sa_ma21 = sa_c.rolling(21, min_periods=1).mean().iloc[-1]
                    sa_ma50 = sa_c.rolling(50, min_periods=1).mean().iloc[-1]
                    sa_ma200 = sa_c.rolling(200, min_periods=1).mean().iloc[-1]
                    mtf_data['Month_6'] = {
                        "MA8": round(sa_ma8, 2) if pd.notna(sa_ma8) else "N/A",
                        "MA21": round(sa_ma21, 2) if pd.notna(sa_ma21) else "N/A",
                        "MA50": round(sa_ma50, 2) if pd.notna(sa_ma50) else "N/A",
                        "MA200": round(sa_ma200, 2) if pd.notna(sa_ma200) else "N/A",
                        "SuperTrend": "YÜKSELİŞ" if sa_c.iloc[-1] > (sa_ma21 if pd.notna(sa_ma21) else 0) else "DÜŞÜŞ"
                    }
            result["MTF_Indicators"] = mtf_data
            
            result["Analysis"] = f"Trend: {trend_status}, RSI: {round(current_rsi, 2) if pd.notna(current_rsi) else 'N/A'}"
            
        except Exception as e:
            print(f"[TechnicalEngine] Hata: {e}")
            
        self.validate_output(result)
        return result
