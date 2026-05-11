import { fetchWithTimeout } from '@/lib/http';

// Warsaw / Mokotów
const COORDS = { lat: 52.2, lon: 21.01 };

// Hourly probability % above which we call it a "rain window"
const RAIN_THRESHOLD = 30;

export interface RainWindow {
  fromHour: number; // 0–23, local
  toHour: number;   // exclusive, local
  peakProb: number; // %
}

export interface WeatherSnapshot {
  tempNow: number;
  feelsLikeNow: number;
  conditionNow: string;
  windNow: number; // km/h

  tempMin: number;
  tempMax: number;
  feelsLikeMin: number;
  feelsLikeMax: number;
  windMax: number;  // km/h, today's max sustained
  gustsMax: number; // km/h, today's max gusts

  rainWindows: RainWindow[];
  isDryToday: boolean;
}

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: number[];
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    apparent_temperature_max: number[];
    apparent_temperature_min: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
  };
}

export async function fetchWeather(): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${COORDS.lat}&longitude=${COORDS.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max,wind_gusts_10m_max` +
    `&timezone=Europe%2FWarsaw&forecast_days=1`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const rainWindows = computeRainWindows(data.hourly, data.current.time);

  return {
    tempNow: data.current.temperature_2m,
    feelsLikeNow: data.current.apparent_temperature,
    conditionNow: weatherCodeToText(data.current.weather_code),
    windNow: data.current.wind_speed_10m,
    tempMin: data.daily.temperature_2m_min[0],
    tempMax: data.daily.temperature_2m_max[0],
    feelsLikeMin: data.daily.apparent_temperature_min[0],
    feelsLikeMax: data.daily.apparent_temperature_max[0],
    windMax: data.daily.wind_speed_10m_max[0],
    gustsMax: data.daily.wind_gusts_10m_max[0],
    rainWindows,
    isDryToday: rainWindows.length === 0,
  };
}

function computeRainWindows(
  hourly: OpenMeteoResponse['hourly'],
  currentTime: string,
): RainWindow[] {
  // Find the index for the current hour (or the next hour boundary)
  const currentHourPrefix = currentTime.slice(0, 13); // "YYYY-MM-DDTHH"
  let startIdx = hourly.time.findIndex((t) => t.startsWith(currentHourPrefix));
  if (startIdx < 0) startIdx = hourly.time.findIndex((t) => t > currentTime);
  if (startIdx < 0) return [];

  const windows: RainWindow[] = [];
  let openStart = -1;
  let openPeak = 0;

  for (let i = startIdx; i < hourly.time.length; i++) {
    const hour = parseInt(hourly.time[i].slice(11, 13), 10);
    const prob = hourly.precipitation_probability[i] ?? 0;

    if (prob >= RAIN_THRESHOLD) {
      if (openStart < 0) {
        openStart = hour;
        openPeak = prob;
      } else {
        openPeak = Math.max(openPeak, prob);
      }
    } else if (openStart >= 0) {
      windows.push({ fromHour: openStart, toHour: hour, peakProb: openPeak });
      openStart = -1;
      openPeak = 0;
    }
  }
  if (openStart >= 0) {
    const lastHour = parseInt(hourly.time[hourly.time.length - 1].slice(11, 13), 10);
    windows.push({ fromHour: openStart, toHour: lastHour + 1, peakProb: openPeak });
  }
  return windows;
}

// WMO weather codes — https://open-meteo.com/en/docs
function weatherCodeToText(code: number): string {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code >= 85 && code <= 86) return 'snow showers';
  if (code >= 95) return 'thunderstorm';
  return `code ${code}`;
}
