"use client";

import { useEffect } from "react";
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";

const STORAGE_KEY = "sv_locale_v1";

function ensureI18n() {
  if (i18n.isInitialized) return;

  const common = {
    profile: "My Profile",
    myChannel: "My channel",
    analytics: "Analytics",
    permissions: "Permissions",
    language: "Language",
    chooseLanguage: "Choose language",
    logout: "Log out",
    channels: "Channels",
    navLiveDashboard: "Live Dashboard",
    navOverlayEditor: "Overlay editor",
    navBot: "StreamCore bot",
    navNowPlaying: "Now playing animation",
    navSongRequests: "Song requests",
    navShoutout: "Shoutout Clip player",
    navRandomClip: "Random Clip player",
    navSpirits: "Stream Spirits",
    navTts: "TTS Bot",
    navGreenScreen: "Green screen videos",
    navSoundAlerts: "Sound alerts",
    navMarketplace: "Marketplace",
    navAnalytics: "Analytics",
    navSettings: "Settings",
    navOverlaySuite: "Overlay Suite",
    navCoreMarketplace: "Core Marketplace",
    navGoLive: "Go Live",
    navCommandCenter: "Command Center"
  };

  i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: common },
      es: {
        translation: {
          profile: "Mi perfil",
          myChannel: "Mi canal",
          analytics: "Analíticas",
          permissions: "Permisos",
          language: "Idioma",
          chooseLanguage: "Elige idioma",
          logout: "Cerrar sesión",
          channels: "Canales",
          navLiveDashboard: "Panel en vivo",
          navOverlayEditor: "Editor de overlays",
          navBot: "Bot de StreamCore",
          navNowPlaying: "Animación 'Reproduciendo'",
          navSongRequests: "Peticiones de canciones",
          navShoutout: "Reproductor de clips",
          navRandomClip: "Clip aleatorio",
          navSpirits: "Espíritus",
          navTts: "Bot TTS",
          navGreenScreen: "Videos green screen",
          navSoundAlerts: "Alertas de sonido",
          navMarketplace: "Marketplace",
          navAnalytics: "Analíticas",
          navSettings: "Ajustes",
          navOverlaySuite: "Suite de overlays",
          navCoreMarketplace: "Marketplace Core",
          navGoLive: "En vivo",
          navCommandCenter: "Centro de mando"
        }
      },
      fr: {
        translation: {
          profile: "Mon profil",
          myChannel: "Ma chaîne",
          analytics: "Analyses",
          permissions: "Autorisations",
          language: "Langue",
          chooseLanguage: "Choisir la langue",
          logout: "Se déconnecter",
          channels: "Chaînes",
          navLiveDashboard: "Tableau de bord",
          navOverlayEditor: "Éditeur d’overlays",
          navBot: "Bot StreamCore",
          navNowPlaying: "Animation en cours",
          navSongRequests: "Demandes de chansons",
          navShoutout: "Lecteur de clips",
          navRandomClip: "Clip aléatoire",
          navSpirits: "Esprits",
          navTts: "Bot TTS",
          navGreenScreen: "Vidéos fond vert",
          navSoundAlerts: "Alertes sonores",
          navMarketplace: "Marketplace",
          navAnalytics: "Analyses",
          navSettings: "Paramètres",
          navOverlaySuite: "Suite overlays",
          navCoreMarketplace: "Marketplace Core",
          navGoLive: "Go Live",
          navCommandCenter: "Centre de commande"
        }
      },
      de: {
        translation: {
          profile: "Mein Profil",
          myChannel: "Mein Kanal",
          analytics: "Analysen",
          permissions: "Berechtigungen",
          language: "Sprache",
          chooseLanguage: "Sprache wählen",
          logout: "Abmelden",
          channels: "Kanäle",
          navLiveDashboard: "Live-Dashboard",
          navOverlayEditor: "Overlay-Editor",
          navBot: "StreamCore Bot",
          navNowPlaying: "Now-Playing Animation",
          navSongRequests: "Song Requests",
          navShoutout: "Shoutout Clip Player",
          navRandomClip: "Random Clip Player",
          navSpirits: "Stream Spirits",
          navTts: "TTS Bot",
          navGreenScreen: "Green-Screen Videos",
          navSoundAlerts: "Sound Alerts",
          navMarketplace: "Marketplace",
          navAnalytics: "Analysen",
          navSettings: "Einstellungen",
          navOverlaySuite: "Overlay Suite",
          navCoreMarketplace: "Core Marketplace",
          navGoLive: "Go Live",
          navCommandCenter: "Command Center"
        }
      },
      pt: {
        translation: {
          profile: "Meu perfil",
          myChannel: "Meu canal",
          analytics: "Análises",
          permissions: "Permissões",
          language: "Idioma",
          chooseLanguage: "Escolher idioma",
          logout: "Sair",
          channels: "Canais",
          navLiveDashboard: "Dashboard ao vivo",
          navOverlayEditor: "Editor de overlays",
          navBot: "Bot StreamCore",
          navNowPlaying: "Animação tocando",
          navSongRequests: "Pedidos de música",
          navShoutout: "Player de clipes",
          navRandomClip: "Clipe aleatório",
          navSpirits: "Spirits",
          navTts: "Bot TTS",
          navGreenScreen: "Vídeos green screen",
          navSoundAlerts: "Alertas de som",
          navMarketplace: "Marketplace",
          navAnalytics: "Análises",
          navSettings: "Configurações",
          navOverlaySuite: "Suite de overlays",
          navCoreMarketplace: "Marketplace Core",
          navGoLive: "Ao vivo",
          navCommandCenter: "Centro de comando"
        }
      },
      nl: {
        translation: {
          profile: "Mijn profiel",
          myChannel: "Mijn kanaal",
          analytics: "Analytics",
          permissions: "Rechten",
          language: "Taal",
          chooseLanguage: "Kies taal",
          logout: "Uitloggen",
          channels: "Kanalen",
          navLiveDashboard: "Live dashboard",
          navOverlayEditor: "Overlay editor",
          navBot: "StreamCore bot",
          navNowPlaying: "Now playing animatie",
          navSongRequests: "Song requests",
          navShoutout: "Shoutout clip speler",
          navRandomClip: "Willekeurige clip speler",
          navSpirits: "Stream spirits",
          navTts: "TTS bot",
          navGreenScreen: "Green screen video’s",
          navSoundAlerts: "Sound alerts",
          navMarketplace: "Marketplace",
          navAnalytics: "Analytics",
          navSettings: "Instellingen",
          navOverlaySuite: "Overlay suite",
          navCoreMarketplace: "Core marketplace",
          navGoLive: "Go live",
          navCommandCenter: "Command center"
        }
      },
      it: {
        translation: {
          profile: "Il mio profilo",
          myChannel: "Il mio canale",
          analytics: "Analisi",
          permissions: "Permessi",
          language: "Lingua",
          chooseLanguage: "Scegli lingua",
          logout: "Esci",
          channels: "Canali",
          navLiveDashboard: "Dashboard live",
          navOverlayEditor: "Editor overlay",
          navBot: "Bot StreamCore",
          navNowPlaying: "Animazione ora in riproduzione",
          navSongRequests: "Richieste brani",
          navShoutout: "Player clip",
          navRandomClip: "Clip casuale",
          navSpirits: "Spiriti",
          navTts: "Bot TTS",
          navGreenScreen: "Video green screen",
          navSoundAlerts: "Avvisi audio",
          navMarketplace: "Marketplace",
          navAnalytics: "Analisi",
          navSettings: "Impostazioni",
          navOverlaySuite: "Suite overlay",
          navCoreMarketplace: "Marketplace Core",
          navGoLive: "Go live",
          navCommandCenter: "Centro comandi"
        }
      },
      pl: {
        translation: {
          profile: "Mój profil",
          myChannel: "Mój kanał",
          analytics: "Analityka",
          permissions: "Uprawnienia",
          language: "Język",
          chooseLanguage: "Wybierz język",
          logout: "Wyloguj",
          channels: "Kanały",
          navLiveDashboard: "Panel na żywo",
          navOverlayEditor: "Edytor overlayów",
          navBot: "Bot StreamCore",
          navNowPlaying: "Animacja teraz grane",
          navSongRequests: "Prośby o utwory",
          navShoutout: "Odtwarzacz klipów",
          navRandomClip: "Losowy klip",
          navSpirits: "Spirits",
          navTts: "Bot TTS",
          navGreenScreen: "Wideo green screen",
          navSoundAlerts: "Alerty dźwiękowe",
          navMarketplace: "Marketplace",
          navAnalytics: "Analityka",
          navSettings: "Ustawienia",
          navOverlaySuite: "Pakiet overlay",
          navCoreMarketplace: "Marketplace Core",
          navGoLive: "Go live",
          navCommandCenter: "Centrum dowodzenia"
        }
      },
      tr: {
        translation: {
          profile: "Profilim",
          myChannel: "Kanalım",
          analytics: "Analitik",
          permissions: "İzinler",
          language: "Dil",
          chooseLanguage: "Dil seç",
          logout: "Çıkış yap",
          channels: "Kanallar",
          navLiveDashboard: "Canlı panel",
          navOverlayEditor: "Overlay düzenleyici",
          navBot: "StreamCore bot",
          navNowPlaying: "Şimdi çalıyor animasyonu",
          navSongRequests: "Şarkı istekleri",
          navShoutout: "Klip oynatıcı",
          navRandomClip: "Rastgele klip",
          navSpirits: "Spirits",
          navTts: "TTS bot",
          navGreenScreen: "Green screen videolar",
          navSoundAlerts: "Ses uyarıları",
          navMarketplace: "Marketplace",
          navAnalytics: "Analitik",
          navSettings: "Ayarlar",
          navOverlaySuite: "Overlay paketi",
          navCoreMarketplace: "Core marketplace",
          navGoLive: "Yayına başla",
          navCommandCenter: "Komuta merkezi"
        }
      },
      ja: {
        translation: {
          profile: "プロフィール",
          myChannel: "自分のチャンネル",
          analytics: "分析",
          permissions: "権限",
          language: "言語",
          chooseLanguage: "言語を選択",
          logout: "ログアウト",
          channels: "チャンネル",
          navLiveDashboard: "ライブダッシュボード",
          navOverlayEditor: "オーバーレイ編集",
          navBot: "StreamCore ボット",
          navNowPlaying: "再生中アニメーション",
          navSongRequests: "曲リクエスト",
          navShoutout: "クリップ再生",
          navRandomClip: "ランダムクリップ",
          navSpirits: "スピリット",
          navTts: "TTS ボット",
          navGreenScreen: "グリーンスクリーン動画",
          navSoundAlerts: "サウンドアラート",
          navMarketplace: "マーケット",
          navAnalytics: "分析",
          navSettings: "設定",
          navOverlaySuite: "オーバーレイスイート",
          navCoreMarketplace: "Core マーケット",
          navGoLive: "配信開始",
          navCommandCenter: "コマンドセンター"
        }
      }
    }
  });
}

export function StreamCoreI18nProvider({ children }: { children: React.ReactNode }) {
  ensureI18n();

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored !== i18n.language) i18n.changeLanguage(stored);
    document.documentElement.lang = i18n.language || "en";
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function setStreamCoreLocale(locale: string) {
  if (!i18n.isInitialized) ensureI18n();
  window.localStorage.setItem(STORAGE_KEY, locale);
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

export function getStreamCoreLocale() {
  if (!i18n.isInitialized) ensureI18n();
  return i18n.language || "en";
}

