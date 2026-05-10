(() => {
  const navLinks = Array.from(document.querySelectorAll(".sidebar nav a"));
  const pageTitle = document.getElementById("pageTitle");
  const pageHeading = document.getElementById("pageHeading");
  const pageDescription = document.getElementById("pageDescription");
  const pageBody = document.getElementById("pageBody");

  const defaultBodyHtml = pageBody ? pageBody.innerHTML : "";

  const pages = {
    "#home": {
      title: "Home",
      heading: "The Ultimate Cockpit for Modern Streamers.",
      description:
        "Eliminate tab-overload. Centralize your chatbot, music, and overlays into one powerful cloud-based dashboard.",
      bodyHtml: `
        <div class="sv-heroCard">
          <div class="sv-heroKicker">STREAMCORE</div>
          <div class="sv-heroTitle sv-shimmer">The Ultimate Cockpit for Modern Streamers.</div>
          <div class="sv-heroSub">Eliminate tab-overload. Centralize your chatbot, music, and overlays into one powerful cloud-based dashboard.</div>
          <div class="sv-heroCtas">
            <a class="sv-btn sv-btnPrimary" href="#cta">Get Started for Free</a>
            <a class="sv-btn sv-btnSecondary" href="#features">View Features</a>
          </div>
        </div>
        <div class="sv-cardsGrid">
          <div class="sv-statCard">
            <div class="sv-statLabel">Scenes</div>
            <div class="sv-statValue">12</div>
            <div class="sv-statSub">Synced templates</div>
          </div>
          <div class="sv-statCard">
            <div class="sv-statLabel">Commands</div>
            <div class="sv-statValue">84</div>
            <div class="sv-statSub">AI-generated logic</div>
          </div>
          <div class="sv-statCard">
            <div class="sv-statLabel">Overlays</div>
            <div class="sv-statValue">1</div>
            <div class="sv-statSub">Master browser source</div>
          </div>
        </div>
      `,
    },
    "#live-dashboard": {
      title: "Live Dashboard",
      heading: "Live Dashboard",
      description: "Live view van je stream-status, chat en activiteit.",
    },
    "#overlay-editor": {
      title: "Overlay editor",
      heading: "Overlay editor",
      description: "Bewerk je overlays en scenes voor je stream.",
    },
    "#streamcore-bot": {
      title: "StreamCore bot",
      heading: "StreamCore bot",
      description: "Beheer bot-commands, triggers en moderatie.",
    },
    "#now-playing-animation": {
      title: "Now playing animation",
      heading: "Now playing animation",
      description: "Stel je ‘Now Playing’ animatie en styling in.",
    },
    "#song-requests": {
      title: "Song requests",
      heading: "Song requests",
      description: "Beheer song requests en queue-instellingen.",
    },
    "#shoutout-clip-player": {
      title: "Shoutout Clip player",
      heading: "Shoutout Clip player",
      description: "Speel automatisch shoutout clips af.",
    },
    "#random-clip-player": {
      title: "Random Clip player",
      heading: "Random Clip player",
      description: "Speel willekeurige clips af met één klik.",
    },
    "#stream-spirits": {
      title: "Stream Spirits",
      heading: "Stream Spirits",
      description: "Configureer je stream characters/spirits.",
    },
    "#tts-bot": {
      title: "TTS Bot",
      heading: "TTS Bot",
      description: "Text-to-speech instellingen en stemmen.",
    },
    "#green-screen-videos": {
      title: "Green screen videos",
      heading: "Green screen videos",
      description: "Beheer je greenscreen video library.",
    },
    "#sound-alerts": {
      title: "Sound alerts",
      heading: "Sound alerts",
      description: "Maak en beheer sound alerts voor events.",
    },
    "#marketplace": {
      title: "Marketplace",
      heading: "Marketplace",
      description: "Ontdek en installeer community packs en assets.",
    },
    "#analytics": {
      title: "Analytics",
      heading: "Analytics",
      description: "Bekijk performance en growth analytics.",
    },
  };

  function normalizeHash(hash) {
    if (!hash) return "#home";
    if (pages[hash]) return hash;
    return "#home";
  }

  function setActiveLink(hash) {
    for (const a of navLinks) {
      const isActive = a.getAttribute("href") === hash;
      a.classList.toggle("active", isActive);
      a.setAttribute("aria-current", isActive ? "page" : "false");
    }
  }

  function render(hash) {
    const key = normalizeHash(hash);
    const page = pages[key] ?? pages["#home"];

    setActiveLink(key);

    if (pageTitle) pageTitle.textContent = page.title;
    if (pageHeading) pageHeading.innerHTML = page.heading;
    if (pageDescription) pageDescription.textContent = page.description;

    if (pageBody) {
      const html = page.bodyHtml ?? defaultBodyHtml;
      pageBody.innerHTML = html;
    }
  }

  for (const a of navLinks) {
    a.addEventListener("click", () => {
      const href = a.getAttribute("href") || "#home";
      render(href);
    });
  }

  window.addEventListener("hashchange", () => render(window.location.hash));
  render(window.location.hash);
})();

