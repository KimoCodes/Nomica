(function () {
  const FLASH_KEY = "fitfunnel_pro_flash";
  let appState = null;
  let pendingProgramMedia = [];
  let pendingProductMedia = [];
  let pendingHeroMedia = null;
  let pendingClientAvatar = "";
  let selectedOrderId = null;
  let programFavoritesOnly = false;
  let selectedAdminProgramId = null;
  let pendingAdminClientAvatar = "";
  let pendingProgressMedia = [];
  let csrfToken = "";

  function apiBase() {
    return window.location.pathname.includes("/auth/") ||
      window.location.pathname.includes("/client/") ||
      window.location.pathname.includes("/admin/")
      ? "../api/index.php"
      : "api/index.php";
  }

  async function apiRequest(action, payload) {
    const options = {
      method: payload ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    };

    if (payload) {
      options.headers["Content-Type"] = "application/json";
      if (csrfToken) {
        options.headers["X-CSRF-Token"] = csrfToken;
      }
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(`${apiBase()}?action=${encodeURIComponent(action)}`, options);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Request failed.");
    }

    if (data.state) {
      appState = data.state;
      csrfToken = data.state.csrfToken || csrfToken;
    }

    return data;
  }

  async function uploadMedia(file, scope, allowVideo) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", scope);
    formData.append("allowVideo", allowVideo ? "true" : "false");

    const response = await fetch(`${apiBase()}?action=media_upload`, {
      method: "POST",
      credentials: "same-origin",
      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      body: formData,
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Upload failed.");
    }

    return data.media;
  }

  async function loadState() {
    const data = await apiRequest("bootstrap");
    appState = data.state;
    return appState;
  }

  function getState() {
    return appState;
  }

  function currentUser() {
    const state = getState();
    if (!state || !state.session) {
      return null;
    }
    return state.users.find((user) => user.id === state.session.userId) || null;
  }

  function isClientPage() {
    return window.location.pathname.includes("/client/");
  }

  function isAdminPage() {
    return window.location.pathname.includes("/admin/");
  }

  function isAuthPage() {
    return window.location.pathname.includes("/auth/");
  }

  function isLogoutPage() {
    return window.location.pathname.endsWith("/logout.html");
  }

  function setFlash(message) {
    sessionStorage.setItem(FLASH_KEY, message);
  }

  function popFlash() {
    const message = sessionStorage.getItem(FLASH_KEY);
    if (message) {
      sessionStorage.removeItem(FLASH_KEY);
    }
    return message;
  }

  function redirect(url) {
    window.location.href = url;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function money(value) {
    return "$" + Number(value || 0).toFixed(0);
  }

  function mediaUrl(path) {
    if (!path) {
      return "";
    }
    if (/^(https?:)?\/\//.test(path)) {
      return path;
    }
    return isClientPage() || isAdminPage() || isAuthPage() ? `../${path}` : path;
  }

  function renderMediaPreview(items) {
    if (!items || !items.length) {
      return '<div class="app-empty">No media uploaded yet.</div>';
    }

    return items
      .map((item, index) => {
        const url = mediaUrl(item.url);
        const body =
          item.type === "video"
            ? `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`
            : `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.name || `Media ${index + 1}`)}">`;
        return `
          <div class="app-media-card">
            <div class="app-media-frame">${body}</div>
            <div class="app-media-meta">
              <strong>${escapeHtml(item.name || `Media ${index + 1}`)}</strong>
              <div class="muted">${escapeHtml(item.type === "video" ? "Video" : "Image")}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderSingleMediaPreview(item) {
    return item ? renderMediaPreview([item]) : '<div class="app-empty">No media uploaded yet.</div>';
  }

  function emptyState(title, copy, href, actionLabel) {
    const action = href && actionLabel
      ? `<a class="btn btn-primary" href="${escapeHtml(href)}">${escapeHtml(actionLabel)}</a>`
      : "";
    return `
      <div class="app-empty app-empty-action">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(copy)}</span>
        ${action}
      </div>
    `;
  }

  function injectUiStyles() {
    if (document.getElementById("app-ui-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "app-ui-styles";
    style.textContent = `
      .app-toast-root{position:fixed;top:18px;right:18px;display:grid;gap:10px;z-index:9999}
      .app-toast{max-width:320px;padding:12px 14px;border-radius:14px;background:#0f172a;color:#fff;box-shadow:0 18px 40px rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);opacity:1;transform:translateY(0);transition:opacity .25s ease,transform .25s ease}
      .app-toast-success{background:#0d5538}
      .app-toast-error{background:#6b1f1f}
      .app-toast-info{background:#17345f}
      .app-toast.is-leaving{opacity:0;transform:translateY(-6px)}
      .app-empty{padding:1rem;border:1px dashed rgba(255,255,255,.2);border-radius:16px;color:inherit;opacity:.85}
      .app-empty-action{display:grid;gap:.75rem;align-items:start}
      .app-empty-action strong{font-size:1.05rem}
      .app-empty-action span{color:inherit;opacity:.82}
      .app-selected-slot{outline:2px solid currentColor;outline-offset:2px}
      .app-hidden{display:none !important}
      .app-media-card{display:grid;gap:.55rem;padding:.8rem;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.03)}
      .app-media-frame{display:grid;place-items:center;min-height:140px;border-radius:12px;overflow:hidden;background:rgba(15,23,42,.4)}
      .app-media-frame img,.app-media-frame video{width:100%;max-height:240px;object-fit:cover;display:block}
      .app-avatar-preview{width:84px;height:84px;border-radius:50%;overflow:hidden;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06)}
      .app-avatar-preview img{width:100%;height:100%;object-fit:cover;display:block}
      .hero-product img,.hero-product video{width:100%;height:100%;object-fit:cover;display:block}
      .app-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem}
      .app-check-item{display:flex;gap:.55rem;align-items:flex-start;padding:.9rem 1rem;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.03)}
      .app-check-item input{margin-top:.2rem}
      .app-workout-block{padding:1rem;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.03)}
      .app-workout-block ul{margin:.7rem 0 0;padding-left:1rem}
      .app-workout-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}
      .app-timer-display{font-family:"Space Grotesk",Inter,sans-serif;font-size:2rem;font-weight:700}
      .app-log-grid{display:grid;gap:1rem}
      .app-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem}
      .app-mobile-note{font-size:.92rem;color:#d7f4f2}
      .app-favorite-button{min-width:130px}
      .app-community-feed{display:grid;gap:.8rem}
      .app-sort-button{all:unset;display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;font-weight:800;color:inherit}
      .app-sort-button::after{content:"";width:.45rem;height:.45rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);opacity:.45;margin-top:-.2rem}
      th[data-sort-dir="desc"] .app-sort-button::after{transform:rotate(225deg);margin-top:.2rem}
      th[data-sort-dir="asc"] .app-sort-button::after{opacity:.9}
    `;
    document.head.appendChild(style);
  }

  function createToastRoot() {
    const root = document.createElement("div");
    root.id = "app-toast-root";
    root.className = "app-toast-root";
    document.body.appendChild(root);
    return root;
  }

  function toast(message, tone) {
    const root = document.getElementById("app-toast-root") || createToastRoot();
    const node = document.createElement("div");
    node.className = "app-toast" + (tone ? " app-toast-" + tone : "");
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => {
      node.classList.add("is-leaving");
      setTimeout(() => node.remove(), 250);
    }, 2800);
  }

  function bindAction(button, handler) {
    if (!button) {
      return;
    }
    if (button.dataset.appHandled === "true") {
      return;
    }
    button.dataset.appHandled = "true";
    button.addEventListener("click", handler);
  }

  function bindField(node, eventName, handler) {
    if (!node) {
      return;
    }
    const key = `appHandled${eventName}`;
    if (node.dataset[key] === "true") {
      return;
    }
    node.dataset[key] = "true";
    node.addEventListener(eventName, handler);
  }

  function initSearch() {
    document.querySelectorAll(".search").forEach((input) => {
      if (!input.getAttribute("aria-label")) {
        input.setAttribute("aria-label", input.getAttribute("placeholder") || "Search");
      }
      input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        const scope = input.closest(".main") || document;
        const nodes = scope.querySelectorAll("tbody tr, .product-card, .program-card, .item, .slot-card");
        nodes.forEach((node) => {
          node.classList.toggle("app-hidden", query && !node.textContent.toLowerCase().includes(query));
        });
        scope.querySelectorAll(".booking-day-card").forEach((dayCard) => {
          const visibleSlots = dayCard.querySelectorAll(".slot-card:not(.app-hidden)");
          dayCard.classList.toggle("app-hidden", visibleSlots.length === 0);
        });
      });
    });
  }

  function initAccessibilityEnhancements() {
    document.querySelectorAll(".nav a.active").forEach((link) => {
      link.setAttribute("aria-current", "page");
    });

    document.querySelectorAll('a.btn[href="#"]').forEach((link) => {
      link.setAttribute("role", "button");
    });

    document.querySelectorAll("input, select, textarea").forEach((field, index) => {
      if (field.getAttribute("aria-label") || field.getAttribute("aria-labelledby")) {
        return;
      }
      const wrapper = field.closest("div");
      const label = wrapper?.querySelector(".mini");
      const text = label?.textContent?.trim();
      if (text) {
        field.setAttribute("aria-label", text);
        if (!field.id) {
          field.id = `app-field-${index}`;
        }
      }
    });
  }

  function comparableCellValue(row, index) {
    const value = row.children[index]?.textContent?.trim() || "";
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) && /[0-9]/.test(value) ? numeric : value.toLowerCase();
  }

  function enhanceTables() {
    document.querySelectorAll(".table").forEach((table) => {
      if (table.dataset.appTableEnhanced === "true") {
        return;
      }
      const headers = table.querySelectorAll("thead th");
      headers.forEach((header, index) => {
        const label = header.textContent.trim();
        if (!label) {
          return;
        }
        header.innerHTML = `<button type="button" class="app-sort-button">${escapeHtml(label)}</button>`;
        header.querySelector("button")?.addEventListener("click", () => {
          const tbody = table.querySelector("tbody");
          if (!tbody) {
            return;
          }
          const current = header.dataset.sortDir === "asc" ? "desc" : "asc";
          headers.forEach((item) => item.removeAttribute("data-sort-dir"));
          header.dataset.sortDir = current;
          const rows = [...tbody.querySelectorAll("tr")].filter((row) => !row.querySelector(".app-empty"));
          rows.sort((a, b) => {
            const left = comparableCellValue(a, index);
            const right = comparableCellValue(b, index);
            if (typeof left === "number" && typeof right === "number") {
              return current === "asc" ? left - right : right - left;
            }
            return current === "asc"
              ? String(left).localeCompare(String(right))
              : String(right).localeCompare(String(left));
          });
          rows.forEach((row) => tbody.appendChild(row));
        });
      });
      table.dataset.appTableEnhanced = "true";
    });
  }

  function activateFallbackActions() {
    document.querySelectorAll('a[href="#"]').forEach((link) => {
      if (link.dataset.appHandled === "true") {
        return;
      }
      link.addEventListener("click", (event) => {
        event.preventDefault();
        toast("This control is handled as an in-page action in the connected app.", "info");
      });
    });
  }

  function updateBrandElements() {
    const state = getState();
    if (!state) {
      return;
    }

    document.querySelectorAll(".brand").forEach((brand) => {
      const role = brand.querySelector(".role");
      if (role) {
        brand.innerHTML = `${escapeHtml(state.site.brandName)} ${role.outerHTML}`;
      } else {
        brand.textContent = state.site.brandName;
      }
    });

    const footerBrand = document.querySelector(".footer-grid h3");
    if (footerBrand) {
      footerBrand.textContent = state.site.brandName;
    }

    const footerEmail = document.querySelector('footer a[href^="mailto:"]');
    if (footerEmail) {
      footerEmail.href = `mailto:${state.site.businessEmail}`;
      footerEmail.textContent = state.site.businessEmail;
    }

    const footerPhone = document.querySelector('footer a[href^="tel:"]');
    if (footerPhone) {
      footerPhone.href = "tel:" + state.site.phone.replace(/[^\d+]/g, "");
      footerPhone.textContent = state.site.phone;
    }

    const socials = document.querySelectorAll(".footer-grid a");
    if (socials[0]) {
      socials[0].href = state.site.instagramUrl;
      socials[0].target = "_blank";
      socials[0].rel = "noreferrer";
    }
    if (socials[1]) {
      socials[1].href = state.site.tiktokUrl;
      socials[1].target = "_blank";
      socials[1].rel = "noreferrer";
    }
  }

  function findProduct(productId) {
    return getState().products.find((product) => product.id === productId) || null;
  }

  function findProgram(programId) {
    return getState().programs.find((program) => program.id === programId) || null;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function clientPrograms(user) {
    return getState().programs.filter((program) => (user.purchasedProgramIds || []).includes(program.id));
  }

  function clientOrders(user) {
    return getState().orders.filter((order) => order.userId === user.id);
  }

  function clientBookings(user) {
    return getState().bookings.filter((booking) => booking.userId === user.id);
  }

  function clientMessages(user) {
    return getState().messages.filter((message) => message.userId === user.id);
  }

  function clientProgressEntries(user) {
    return getState().progressEntries.filter((entry) => entry.userId === user.id);
  }

  function workoutProfile() {
    return getState().workoutProfile || {
      goal: "Strength",
      durationMinutes: 45,
      focus: "",
      equipment: [],
      updatedAt: "",
    };
  }

  function workoutLogs() {
    return getState().workoutLogs || [];
  }

  function currentWorkout() {
    return getState().personalizedWorkout || null;
  }

  function workoutOfDay() {
    return getState().workoutOfDay || null;
  }

  function communityPosts() {
    return getState().communityPosts || [];
  }

  function uploadedVideosFromProgress(entries) {
    return entries.flatMap((entry) => (entry.media || []).filter((item) => item.type === "video"));
  }

  function athleteSnapshot(user) {
    const profile = user.athleteProfile || {};
    const scores = profile.fitnessScores || {};
    return {
      height: profile.heightCm || "--",
      weight: profile.currentWeight || "--",
      position: profile.sportsPosition || "Not set",
      history: profile.trainingHistory || "No training history saved yet.",
      achievements: profile.achievements || [],
      scores: {
        recovery: scores.recovery || "7.8",
        speed: scores.speed || "7.1",
        strength: scores.strength || "8.0",
        mobility: scores.mobility || "7.5",
      },
      injuryNotes: profile.injuryNotes || "",
    };
  }

  function dashboardAnalytics(user) {
    const logs = workoutLogs();
    const progress = clientProgressEntries(user);
    const totalCalories = logs.reduce((sum, item) => sum + Number(item.caloriesBurned || 0), 0);
    const totalDistance = logs.reduce((sum, item) => sum + Number(item.distance || 0), 0);
    const avgHeartRate = logs.length
      ? Math.round(logs.reduce((sum, item) => sum + Number(item.heartRate || 0), 0) / logs.length)
      : 0;
    return {
      totalCalories,
      totalDistance,
      avgHeartRate,
      dailyGoals: [
        `${logs.length ? "Complete your next scheduled session" : "Log your first workout today"}`,
        `${progress.length ? "Upload one fresh progress note or video" : "Start your first progress check-in"}`,
        `Hit hydration goal: ${(user.preferences?.hydrationGoal || "2.5L")}`,
      ],
    };
  }

  function dashboardNotifications(user) {
    const items = [];
    const unreadMessages = clientMessages(user).filter((message) => message.status === "Unread").length;
    const nextBooking = clientBookings(user)[0] || null;
    if (unreadMessages) {
      items.push(`${unreadMessages} unread coach/support message(s).`);
    }
    if (nextBooking) {
      items.push(`Upcoming session: ${formatShortDate(nextBooking.dateLabel)} at ${nextBooking.time}.`);
    }
    if ((user.athleteProfile?.injuryNotes || "").trim()) {
      items.push("Recovery notes are saved on your profile. Review them before higher-intensity work.");
    }
    if (!items.length) {
      items.push("No urgent alerts right now. Stay on schedule and keep logging sessions.");
    }
    return items;
  }

  function programMetadata(program) {
    const source = `${program.name} ${program.type} ${program.description} ${(program.preview || []).join(" ")}`.toLowerCase();
    const time = source.includes("10 week") ? "60+" : source.includes("8 week") || source.includes("4 days") ? "45" : "30";
    const equipment = source.includes("home") || source.includes("bodyweight") ? "Home" : source.includes("track") ? "Track" : "Gym";
    const targetArea = source.includes("upper") ? "Upper Body" : source.includes("lower") || source.includes("glute") ? "Lower Body" : source.includes("speed") || source.includes("sport") ? "Athletic Performance" : "Full Body";
    return { time, equipment, targetArea };
  }

  function pdfBase() {
    return window.location.pathname.includes("/client/") ? "../api/workout-pdf.php" : "api/workout-pdf.php";
  }

  function formatSeconds(totalSeconds) {
    const minutes = Math.floor((totalSeconds || 0) / 60);
    const seconds = Math.max(0, (totalSeconds || 0) % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function cartForUser(user) {
    return getState().carts[user.id] || [];
  }

  function requireRole(role) {
    const user = currentUser();
    if (!user) {
      setFlash("Please log in to continue.");
      redirect(isAdminPage() ? "../auth/login.html" : "../auth/login.html");
      return null;
    }
    if (user.role !== role) {
      setFlash("You do not have access to that area.");
      redirect(user.role === "admin" ? "../admin/index.html" : "../client/index.html");
      return null;
    }
    return user;
  }

  async function renderLandingPage() {
    const state = getState();
    const heroHeadline = document.querySelector(".hero-copy h1");
    if (heroHeadline) {
      heroHeadline.textContent = state.content.heroHeadline;
    }

    const about = document.querySelector("#about");
    if (about) {
      const paragraphs = about.querySelectorAll("p");
      if (paragraphs[0]) paragraphs[0].textContent = state.content.aboutSummary;
      if (paragraphs[1]) paragraphs[1].textContent = state.content.aboutSupport;
    }

    const heroMedia = document.querySelector(".video-placeholder");
    if (heroMedia && state.content.heroMediaUrl) {
      const url = mediaUrl(state.content.heroMediaUrl);
      heroMedia.innerHTML =
        state.content.heroMediaType === "video"
          ? `<video src="${escapeHtml(url)}" style="width:100%; height:500px; object-fit:cover;" muted autoplay loop controls></video>`
          : `<img src="${escapeHtml(url)}" alt="Hero media" style="width:100%; height:500px; object-fit:cover;">`;
    }

    const leadForm = document.querySelector(".lead-form");
    if (leadForm) {
      leadForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const inputs = leadForm.querySelectorAll("input");
        const name = inputs[0]?.value.trim() || "";
        const email = inputs[1]?.value.trim() || "";
        if (!name || !email) {
          toast("Please enter your name and email first.", "error");
          return;
        }

        try {
          const result = await apiRequest("lead_create", { name, email });
          leadForm.reset();
          updateBrandElements();
          toast(result.message, "success");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function formatShortDate(dateLabel) {
    return String(dateLabel || "").replace(", 2026", "");
  }

  function renderClientShell(user) {
    const nextBooking = clientBookings(user)[0] || null;
    const assignedPrograms = clientPrograms(user);
    const activePlan = user.plan || assignedPrograms[0]?.name || "No active plan yet";
    const bookingCopy = nextBooking
      ? `Next session: ${formatShortDate(nextBooking.dateLabel)} • ${nextBooking.time}`
      : "No session booked yet.";

    document.querySelectorAll(".sidebar-card").forEach((card) => {
      const title = card.querySelector("h3");
      const copy = card.querySelector(".muted");
      const link = card.querySelector(".btn");
      if (title) {
        title.textContent = activePlan;
      }
      if (copy) {
        copy.textContent = bookingCopy;
      }
      if (link) {
        link.textContent = nextBooking ? "View Bookings" : "Book Session";
        link.href = nextBooking ? "bookings.html" : "book-session.html";
      }
    });
    enhanceClientSidebar(user);
    renderCartNavBadge(user);
  }

  function enhanceClientSidebar(user) {
    const email = getState().site?.businessEmail || "";
    const phone = getState().site?.phone || "";
    const supportHtml = `
      <div class="sidebar-help-copy">
        <strong>Need help?</strong>
        <span>Message your coach or support team for fast answers.</span>
      </div>
      <div class="sidebar-help-actions">
        <a href="messages.html" class="btn btn-secondary btn-full">Message Coach</a>
        ${email ? `<a href="mailto:${escapeHtml(email)}" class="btn btn-secondary btn-full">Email Support</a>` : ""}
        ${phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" class="btn btn-secondary btn-full">Call Support</a>` : ""}
      </div>
    `;

    document.querySelectorAll(".sidebar-card").forEach((card) => {
      if (card.dataset.sidebarSupportEnhanced === "true") {
        return;
      }
      const support = document.createElement("div");
      support.className = "sidebar-help";
      support.innerHTML = supportHtml;
      card.appendChild(support);
      card.dataset.sidebarSupportEnhanced = "true";
    });
  }

  function renderClientDashboard(user) {
    if (!window.location.pathname.endsWith("/client/index.html")) {
      return;
    }

    const programs = clientPrograms(user);
    const bookings = clientBookings(user);
    const messages = clientMessages(user);
    const orders = clientOrders(user);
    const progressEntries = clientProgressEntries(user);
    const logs = workoutLogs();
    const athlete = athleteSnapshot(user);
    const analytics = dashboardAnalytics(user);
    const notifications = dashboardNotifications(user);
    const videos = uploadedVideosFromProgress(progressEntries);
    const availableProducts = getState().products.filter(
      (product) => product.status !== "Draft" && product.visibility !== "Private link only"
    );
    const nextBooking = bookings[0] || null;
    const grids = document.querySelectorAll(".content .grid2");
    const topCards = grids[0] ? grids[0].querySelectorAll(".panel") : [];
    const bottomCards = grids[1] ? grids[1].querySelectorAll(".panel") : [];
    const hero = document.querySelector(".hero-banner");
    const heroTitle = hero?.querySelector(".hero-copy h2");
    const heroCopy = hero?.querySelector(".hero-copy .muted");
    const heroActions = hero?.querySelector(".hero-copy .actions");
    const heroStack = hero?.querySelector(".hero-stack");
    const primaryProgram = programs[0] || null;
    const nextAction = primaryProgram
      ? { title: "Continue today's training block.", copy: "Open your assigned program, log the session, and keep your progress streak moving.", href: `program-detail.html?program=${encodeURIComponent(primaryProgram.id)}`, label: "Continue Program" }
      : logs.length
        ? { title: "Turn your logged work into a coached plan.", copy: "You already have training data. Send your coach a note or build a temporary workout while your assigned plan is prepared.", href: "messages.html", label: "Ask For A Plan" }
        : { title: "Start with one clear training action.", copy: "Build a quick workout, book a coach review, or browse programs so your dashboard can become personalized.", href: "programs.html", label: "Build First Workout" };

    const welcome = document.querySelector(".topbar h1");
    if (welcome) {
      welcome.textContent = `Welcome back, ${user.firstName}`;
    }

    if (heroTitle) {
      heroTitle.textContent = nextAction.title;
    }
    if (heroCopy) {
      heroCopy.textContent = nextAction.copy;
    }
    if (heroActions) {
      heroActions.innerHTML = `
        <a href="${escapeHtml(nextAction.href)}" class="btn btn-primary">${escapeHtml(nextAction.label)}</a>
        <a href="${nextBooking ? "bookings.html" : "book-session.html"}" class="btn btn-secondary">${nextBooking ? "View Next Session" : "Book Coach Review"}</a>
      `;
    }
    if (heroStack) {
      const completion = primaryProgram ? `${primaryProgram.completion}%` : `${Math.min(100, logs.length * 10)}%`;
      heroStack.innerHTML = `
        <div class="hero-chip"><span>Active Plan</span><strong>${escapeHtml(primaryProgram?.name || "Not assigned yet")}</strong></div>
        <div class="hero-chip"><span>Progress</span><strong>${escapeHtml(completion)}</strong></div>
        <div class="hero-chip"><span>Next Session</span><strong>${escapeHtml(nextBooking ? `${formatShortDate(nextBooking.dateLabel)} • ${nextBooking.time}` : "Not booked")}</strong></div>
      `;
    }

    const stats = document.querySelectorAll(".grid4 .stat");
    if (stats[0]) {
      stats[0].querySelector("h2").textContent = String(programs.length || 0);
      stats[0].querySelector(".muted").textContent = "Personalized training schedule blocks";
    }
    if (stats[1]) {
      stats[1].querySelector("h2").textContent = String(logs.length);
      stats[1].querySelector(".muted").textContent = logs.length ? "Workout sessions tracked" : "No workouts logged yet";
    }
    if (stats[2]) {
      stats[2].querySelector("h2").textContent = `${Math.round(analytics.totalCalories)}`;
      stats[2].querySelector(".muted").textContent = "Calories burned from logged sessions";
    }
    if (stats[3]) {
      stats[3].querySelector("h2").textContent = nextBooking ? formatShortDate(nextBooking.dateLabel) : "None";
      stats[3].querySelector(".muted").textContent = nextBooking ? nextBooking.session : "Upcoming session schedule";
    }

    if (topCards[0]) {
      topCards[0].innerHTML = primaryProgram
        ? `
            <div class="head">
              <div><p class="eyebrow">Personalized Training Schedule</p><h2>${escapeHtml(primaryProgram.name)}</h2></div>
              <a href="program-detail.html?program=${encodeURIComponent(primaryProgram.id)}" class="btn btn-primary">Open Program</a>
            </div>
            <div class="list">
              ${primaryProgram.preview
                .slice(0, 3)
                .map((item) => {
                  const parts = item.split(" - ");
                  return `<div class="item flex"><div><strong>${escapeHtml(parts[0])}</strong><div class="muted">${escapeHtml(parts[1] || item)}</div></div><span class="tag blue">${primaryProgram.completion}%</span></div>`;
                })
                .join("")}
            </div>
          `
        : `
            <div class="head">
              <div><p class="eyebrow">Current Focus</p><h2>No Program Assigned Yet</h2></div>
              <a href="programs.html" class="btn btn-primary">Build Workout</a>
            </div>
            ${emptyState("No assigned program yet.", "Use the workout builder now, then message your coach when you are ready for a personalized plan.", "messages.html", "Message Coach")}
          `;
    }

    if (topCards[1]) {
      topCards[1].innerHTML = `
        <div class="head"><div><p class="eyebrow">Daily Goals</p><h2>Today's Targets</h2></div><a href="progress.html" class="btn btn-secondary">Open Progress</a></div>
        ${
          analytics.dailyGoals.length
            ? `<div class="list">
                ${analytics.dailyGoals
                  .slice(0, 3)
                  .map(
                    (goal, index) => `
                      <div class="item">
                        <div class="between"><strong>Goal ${index + 1}</strong><span>${index === 0 ? "Primary" : "Daily"}</span></div>
                        <div class="muted">${escapeHtml(goal)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : emptyState("No daily goals yet.", "Log a workout or save a check-in so the dashboard can suggest useful daily targets.", "progress.html", "Log Progress")
        }
      `;
    }

    if (topCards[2]) {
      topCards[2].innerHTML = `
        <div class="head"><div><p class="eyebrow">Performance Analytics</p><h2>Metrics Snapshot</h2></div><a href="progress.html" class="btn btn-secondary">See Trends</a></div>
        <div class="metric-grid">
          <div class="metric-card"><span class="mini">Distance</span><strong>${analytics.totalDistance.toFixed(1)}</strong><span class="muted">Logged cardio distance</span></div>
          <div class="metric-card"><span class="mini">Avg Heart Rate</span><strong>${analytics.avgHeartRate || "--"}</strong><span class="muted">From tracked sessions</span></div>
          <div class="metric-card"><span class="mini">Recovery Score</span><strong>${escapeHtml(athlete.scores.recovery)}</strong><span class="muted">Athlete profile score</span></div>
          <div class="metric-card"><span class="mini">Strength Score</span><strong>${escapeHtml(athlete.scores.strength)}</strong><span class="muted">Performance readiness</span></div>
        </div>
      `;
    }

    if (topCards[3]) {
      topCards[3].innerHTML = `
        <div class="head"><div><p class="eyebrow">Athlete Profile</p><h2>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</h2></div><a href="settings.html" class="btn btn-primary">Edit Profile</a></div>
        <div class="list">
          <div class="item"><strong>Height / Weight</strong><div class="muted">${escapeHtml(String(athlete.height))} cm • ${escapeHtml(String(athlete.weight))} kg</div></div>
          <div class="item"><strong>Sports Position</strong><div class="muted">${escapeHtml(athlete.position)}</div></div>
          <div class="item"><strong>Training History</strong><div class="muted">${escapeHtml(athlete.history)}</div></div>
          <div class="item"><strong>Achievements</strong><div class="muted">${escapeHtml(athlete.achievements.length ? athlete.achievements.join(", ") : "No achievements logged yet.")}</div></div>
        </div>
      `;
    }

    if (bottomCards[0]) {
      bottomCards[0].innerHTML = `
        <div class="head"><div><p class="eyebrow">Notifications</p><h2>Alerts & Updates</h2></div></div>
        <div class="list">${notifications.map((item) => `<div class="item"><strong>Update</strong><div class="muted">${escapeHtml(item)}</div></div>`).join("")}</div>
      `;
    }

    if (bottomCards[1]) {
      bottomCards[1].innerHTML = `
        <div class="head"><div><p class="eyebrow">Upcoming Sessions</p><h2>Coaching & Live Training</h2></div></div>
        ${
          bookings.length
            ? `<div class="list">
                ${bookings
                  .slice(0, 3)
                  .map(
                    (booking) => `
                      <div class="item">
                        <strong>${escapeHtml(booking.session)}</strong>
                        <div class="muted">${escapeHtml(formatShortDate(booking.dateLabel))} • ${escapeHtml(booking.time)} • ${escapeHtml(booking.status)}</div>
                      </div>
                    `
                  )
                  .join("")}
                <div class="item"><strong>Coach Livestream</strong><div class="muted">Thursday • 18:00 • Session recording shared in the portal afterward.</div></div>
              </div>`
            : emptyState("No sessions booked.", "Book a coach review to get accountability, plan feedback, or movement review on your calendar.", "book-session.html", "Book A Session")
        }
      `;
    }

    if (bottomCards[2]) {
      bottomCards[2].innerHTML = `
        <div class="head"><div><p class="eyebrow">Recovery</p><h2>Injury & Readiness</h2></div><a href="nutrition.html" class="btn btn-secondary">Nutrition Notes</a></div>
        <div class="list">
          <div class="item"><strong>Injury Recovery Recommendations</strong><div class="muted">${escapeHtml(athlete.injuryNotes || "No active injury notes saved. Stay consistent with mobility and cooldown work.")}</div></div>
          <div class="item"><strong>Hydration Goal</strong><div class="muted">${escapeHtml(user.preferences?.hydrationGoal || "2.5L")}</div></div>
          <div class="item"><strong>Sport Nutrition Guide</strong><div class="muted">${escapeHtml(user.preferences?.sportNutritionGuide || "General Performance")}</div></div>
        </div>
      `;
    }

    if (bottomCards[3]) {
      bottomCards[3].innerHTML = `
        <div class="head"><div><p class="eyebrow">Uploads & Achievements</p><h2>Profile Evidence</h2></div></div>
        <div class="list">
          <a class="item" href="progress.html"><strong>Uploaded Videos</strong><div class="muted">${videos.length ? `${videos.length} video upload(s) saved for coach review.` : "Upload training video clips from the progress page."}</div></a>
          <a class="item" href="messages.html"><strong>Coach Feedback</strong><div class="muted">${messages.length ? `${messages.length} message(s) in your history.` : "Send a direct question to your coach."}</div></a>
          <a class="item" href="settings.html"><strong>Fitness Scores</strong><div class="muted">Recovery ${escapeHtml(athlete.scores.recovery)} • Speed ${escapeHtml(athlete.scores.speed)} • Mobility ${escapeHtml(athlete.scores.mobility)}</div></a>
        </div>
      `;
    }
  }

  function renderClientProgramsPage(user) {
    if (window.location.pathname.endsWith("/programs.html")) {
      const programs = clientPrograms(user);
      const profile = workoutProfile();
      const wod = workoutOfDay();
      const workout = currentWorkout();
      const equipment = ["Bodyweight", "Dumbbells", "Kettlebells", "Barbell", "Cable", "Bands", "Bike", "Treadmill"];
      const equipmentWrap = document.getElementById("workout-builder-equipment");
      const libraryWrap = document.getElementById("program-library");
      const summaryWrap = document.getElementById("builder-summary");
      const wodWrap = document.getElementById("wod-card");
      const buildButton = document.getElementById("workout-builder-save");
      const goalInput = document.getElementById("workout-builder-goal");
      const durationInput = document.getElementById("workout-builder-duration");
      const focusInput = document.getElementById("workout-builder-focus");
      const timeFilter = document.getElementById("program-filter-time");
      const equipmentFilter = document.getElementById("program-filter-equipment");
      const targetFilter = document.getElementById("program-filter-target");
      const favoritesToggle = document.getElementById("program-favorites-toggle");
      const premiumWrap = document.getElementById("subscription-gate");
      const favoriteProgramIds = user.favoriteProgramIds || [];

      if (goalInput) goalInput.value = profile.goal || "Strength";
      if (durationInput) durationInput.value = profile.durationMinutes || 45;
      if (focusInput) focusInput.value = profile.focus || "";
      if (premiumWrap) {
        premiumWrap.innerHTML = `
          <div class="head"><div><p class="eyebrow">Subscription Access</p><h2>${escapeHtml(user.subscriptionTier || "Starter")} Plan</h2></div></div>
          <p class="muted app-mobile-note">Starter users can save progress and favorites. Premium-style plans unlock coach-assigned premium routines and higher-touch support. Account tier is managed by your coach or admin.</p>
        `;
      }

      if (equipmentWrap) {
        equipmentWrap.innerHTML = equipment
          .map(
            (item) => `
              <label class="app-check-item">
                <input type="checkbox" value="${escapeHtml(item)}" ${profile.equipment.includes(item) ? "checked" : ""}>
                <span>${escapeHtml(item)}</span>
              </label>
            `
          )
          .join("");
      }

      if (summaryWrap && workout) {
        summaryWrap.innerHTML = `
          <div class="metric-grid">
            <div class="metric-card"><span class="mini">Goal</span><strong>${escapeHtml(workout.goal)}</strong></div>
            <div class="metric-card"><span class="mini">Time</span><strong>${workout.durationMinutes} min</strong></div>
            <div class="metric-card"><span class="mini">Focus</span><strong>${escapeHtml(workout.focus)}</strong></div>
            <div class="metric-card"><span class="mini">Equipment</span><strong>${escapeHtml((workout.equipment || []).join(", ") || "Minimal")}</strong></div>
          </div>
        `;
      }

      if (wodWrap && wod) {
        wodWrap.innerHTML = `
          <div class="head"><div><p class="eyebrow">Daily Updated Routine</p><h2>${escapeHtml(wod.title)}</h2></div><span class="tag green">${escapeHtml(wod.date)}</span></div>
          <div class="list">
            ${wod.blocks.map((block) => `<div class="item"><strong>${escapeHtml(block)}</strong></div>`).join("")}
          </div>
          <div class="note" style="margin-top:1rem;">${escapeHtml(wod.challenge)}</div>
        `;
      }

      function renderProgramLibrary() {
        if (!libraryWrap) {
          return;
        }
        const showFavorites = programFavoritesOnly;
        const filteredPrograms = programs.filter((program) => {
          const meta = programMetadata(program);
          const timeValue = timeFilter?.value || "All";
          const equipmentValue = equipmentFilter?.value || "All";
          const targetValue = targetFilter?.value || "All";
          const isFavorite = favoriteProgramIds.includes(program.id);
          return (timeValue === "All" || meta.time === timeValue)
            && (equipmentValue === "All" || meta.equipment === equipmentValue)
            && (targetValue === "All" || meta.targetArea === targetValue)
            && (!showFavorites || isFavorite);
        });

        libraryWrap.innerHTML = filteredPrograms.length
          ? filteredPrograms
              .map(
                (program) => {
                  const isFavorite = favoriteProgramIds.includes(program.id);
                  return `
                  <article class="card panel program-card">
                    <div class="head"><div><p class="eyebrow">${escapeHtml(program.type)}</p><h2>${escapeHtml(program.name)}</h2></div><span class="tag blue">${program.completion}%</span>${isFavorite ? ' <span class="tag yellow">Favorite</span>' : ''}</div>
                    <p class="muted">${escapeHtml(program.description)}</p>
                    <div class="detail-list">
                      ${(program.preview || []).slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
                    </div>
                    <div class="detail-list">
                      <span>${escapeHtml(programMetadata(program).time)} min</span>
                      <span>${escapeHtml(programMetadata(program).equipment)}</span>
                      <span>${escapeHtml(programMetadata(program).targetArea)}</span>
                    </div>
                    <div class="actions" style="margin-top:1rem;">
                      <a href="program-detail.html?program=${encodeURIComponent(program.id)}" class="btn btn-primary">Open Plan</a>
                      <a href="#" class="btn btn-secondary app-favorite-button app-favorite-toggle" data-program-id="${escapeHtml(program.id)}">${isFavorite ? "Favorited" : "Save Favorite"}</a>
                    </div>
                  </article>
                `;
                }
              )
              .join("")
          : `<div class="app-empty" style="grid-column:1 / -1;">${
              programs.length
                ? showFavorites
                  ? "No favorites match the current filters. Remove the favorites toggle or widen your search."
                  : "No routines match the current filters. Try widening time, equipment, or target area."
                : "No assigned programs yet. The workout builder below still works without a coach-assigned plan."
            }</div>`;

        libraryWrap.querySelectorAll(".app-favorite-toggle").forEach((button) => {
          bindAction(button, async (event) => {
            event.preventDefault();
            try {
              const result = await apiRequest("client_program_favorite_toggle", {
                programId: button.getAttribute("data-program-id"),
              });
              toast(result.message, "success");
              renderClientProgramsPage(currentUser());
              renderClientSettingsPage(currentUser());
            } catch (error) {
              toast(error.message, "error");
            }
          });
        });
      }
      renderProgramLibrary();
      if (favoritesToggle) {
        favoritesToggle.textContent = programFavoritesOnly ? "Showing Favorites Only" : "Show Favorites Only";
        bindAction(favoritesToggle, (event) => {
          event.preventDefault();
          programFavoritesOnly = !programFavoritesOnly;
          favoritesToggle.textContent = programFavoritesOnly ? "Showing Favorites Only" : "Show Favorites Only";
          renderProgramLibrary();
        });
      }
      [timeFilter, equipmentFilter, targetFilter].forEach((node) => bindField(node, "change", renderProgramLibrary));

      if (buildButton) {
        bindAction(buildButton, async (event) => {
          event.preventDefault();
          const selectedEquipment = [...document.querySelectorAll("#workout-builder-equipment input:checked")].map((node) => node.value);
          try {
            const result = await apiRequest("client_workout_profile_save", {
              goal: document.getElementById("workout-builder-goal")?.value || "",
              durationMinutes: Number(document.getElementById("workout-builder-duration")?.value || 45),
              focus: document.getElementById("workout-builder-focus")?.value.trim() || "",
              equipment: selectedEquipment,
            });
            toast(result.message, "success");
            renderClientProgramsPage(currentUser());
            renderClientProgressPage(currentUser());
          } catch (error) {
            toast(error.message, "error");
          }
        });
      }
    }

    if (window.location.pathname.endsWith("/program-detail.html")) {
      const profile = workoutProfile();
      const workout = currentWorkout();
      const programId = getQueryParam("program") || clientPrograms(user)[0]?.id || "";
      const program = programId ? findProgram(programId) : null;
      const hero = document.getElementById("program-detail-hero");
      const overview = document.getElementById("program-detail-overview");
      const detail = document.getElementById("program-detail-meta");
      const pdfLink = document.getElementById("program-detail-pdf");
      const source = program || workout;

      if (!source || !overview || !detail) {
        return;
      }

      if (hero) {
        hero.innerHTML = program?.media?.[0]
          ? (program.media[0].type === "video"
              ? `<video src="${escapeHtml(mediaUrl(program.media[0].url))}" controls preload="metadata"></video>`
              : `<img src="${escapeHtml(mediaUrl(program.media[0].url))}" alt="${escapeHtml(program.name)}">`)
          : `<div><strong>${escapeHtml(source.title || source.name)}</strong><div class="muted">${escapeHtml((source.equipment || profile.equipment || []).join(", ") || "Custom plan")}</div></div>`;
      }

      overview.innerHTML = `
        <div class="head"><div><p class="eyebrow">${program ? "Assigned Program" : "Build Your Own Workout"}</p><h2>${escapeHtml(program ? program.name : workout.title)}</h2></div><span class="tag green">${program ? escapeHtml(program.status) : "Live"}</span></div>
        <p class="muted">${escapeHtml(program ? program.description : workout.coachNote)}</p>
        <div class="app-log-grid">
          ${(program ? program.preview.map((item) => ({ label: item.split(" - ")[0], items: [item.split(" - ")[1] || item], minutes: 12 })) : workout.blocks)
            .map(
              (block) => `
                <div class="app-workout-block">
                  <strong>${escapeHtml(block.label)}</strong>
                  <div class="muted">${block.minutes} min</div>
                  <ul>${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
                </div>
              `
            )
            .join("")}
        </div>
      `;

      detail.innerHTML = `
        <div class="head"><div><p class="eyebrow">Session Tools</p><h2>Train And Download</h2></div></div>
        <div class="list">
          <div class="item"><strong>Goal</strong><div class="muted">${escapeHtml(program ? program.type : workout.goal)}</div></div>
          <div class="item"><strong>Duration</strong><div class="muted">${program ? "Coach assigned" : `${workout.durationMinutes} minutes`}</div></div>
          <div class="item"><strong>Equipment</strong><div class="muted">${escapeHtml((program ? ["Coach Program"] : profile.equipment).join(", "))}</div></div>
          <div class="item"><strong>WOD</strong><div class="muted">${escapeHtml((workoutOfDay()?.title || "Daily routine ready"))}</div></div>
        </div>
      `;

      if (pdfLink) {
        pdfLink.href = `${pdfBase()}${program ? `?program=${encodeURIComponent(program.id)}` : ""}`;
      }
    }
  }

  function sortAvailabilitySlots(slots) {
    return [...slots].sort((left, right) => {
      const leftValue = new Date(`${left.date} ${left.time}`);
      const rightValue = new Date(`${right.date} ${right.time}`);
      return leftValue - rightValue;
    });
  }

  function groupAvailabilityByDate(slots) {
    const groups = {};
    sortAvailabilitySlots(slots).forEach((slot) => {
      const date = slot.date || "Unknown";
      groups[date] = groups[date] || [];
      groups[date].push(slot);
    });
    return Object.entries(groups).map(([date, slots]) => ({ date, slots }));
  }

  function renderAvailabilityCalendar(slots, container, selectedSlotId) {
    if (!container) {
      return;
    }
    if (!slots.length) {
      container.innerHTML = emptyState(
        "No open booking slots.",
        "Message your coach if you need a custom time or check back after availability is updated.",
        "messages.html",
        "Message Coach"
      );
      return;
    }

    const grouped = groupAvailabilityByDate(slots);
    container.innerHTML = `
      <div class="booking-calendar">
        ${grouped
          .map(
            (group) => `
              <div class="booking-day-card">
                <div class="booking-day-header">
                  <strong>${escapeHtml(group.date)}</strong>
                  <span>${group.slots.length} slot(s)</span>
                </div>
                <div class="booking-slot-grid">
                  ${group.slots
                    .map(
                      (slot) => `
                        <button type="button" class="slot-card ${selectedSlotId === slot.id ? "selected" : ""}" data-slot-id="${escapeHtml(slot.id)}">
                          <span>${escapeHtml(slot.time)}</span>
                          <small>${escapeHtml(slot.type)} • ${escapeHtml(String(slot.seats))} seat(s)</small>
                        </button>
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderBookingSelectionDetail(slot, container) {
    if (!container) {
      return;
    }
    if (!slot) {
      container.innerHTML = `
        <div class="app-empty">
          <strong>Select a slot to book.</strong>
          <span>Pick a date and time from the calendar, then complete the request details on the right.</span>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="booking-detail-card">
        <div class="head"><div><p class="eyebrow">Selected Slot</p><h2>${escapeHtml(formatShortDate(slot.date))}</h2></div></div>
        <div class="list">
          <div class="item"><strong>Time</strong><div class="muted">${escapeHtml(slot.time)}</div></div>
          <div class="item"><strong>Session Type</strong><div class="muted">${escapeHtml(slot.type)}</div></div>
          <div class="item"><strong>Available Seats</strong><div class="muted">${escapeHtml(String(slot.seats))}</div></div>
          <div class="item"><strong>Coach</strong><div class="muted">Your training coach will confirm details after booking.</div></div>
        </div>
      </div>
    `;
  }

  function renderClientBookingsPage(user) {
    const isBookingsPage = window.location.pathname.endsWith("/bookings.html");
    const isBookSessionPage = window.location.pathname.endsWith("/book-session.html");
    const slotList = document.getElementById("booking-slot-summary");
    const selectedDetail = document.getElementById("booking-selected-detail");
    const selects = document.querySelectorAll(".select");
    const notes = document.querySelector(".textarea");
    const submitButton = document.querySelector(".actions .btn-primary");
    const availableSlots = sortAvailabilitySlots(getState().availability);
    let selectedSlotId = isBookSessionPage ? getQueryParam("slot") || null : null;
    if (selectedSlotId && !availableSlots.some((slot) => slot.id === selectedSlotId)) {
      selectedSlotId = null;
    }

    if (isBookingsPage) {
      const tbody = document.querySelector("tbody");
      const bookings = clientBookings(user);
      if (tbody) {
        tbody.innerHTML = bookings.length
          ? bookings
              .map(
                (booking) => `
                  <tr>
                    <td>${escapeHtml(booking.session)}</td>
                    <td>${escapeHtml(booking.dateLabel.replace(", 2026", "") + " • " + booking.time)}</td>
                    <td>${escapeHtml(booking.format)}</td>
                    <td><span class="tag ${booking.status === "Confirmed" ? "green" : booking.status === "Pending" ? "yellow" : "blue"}">${escapeHtml(booking.status)}</span></td>
                  </tr>
                `
              )
              .join("")
          : '<tr><td colspan="4"><div class="app-empty">No bookings yet.</div></td></tr>';
      }
    }

    if (!isBookingsPage && !isBookSessionPage) {
      return;
    }

    if (slotList) {
      const bindSlotSelectionButtons = () => {
        slotList.querySelectorAll("button.slot-card").forEach((button) => {
          bindAction(button, (event) => {
            event.preventDefault();
            selectedSlotId = button.getAttribute("data-slot-id");
            renderAvailabilityCalendar(availableSlots, slotList, selectedSlotId);
            const slot = availableSlots.find((entry) => entry.id === selectedSlotId);
            renderBookingSelectionDetail(slot, selectedDetail);
            bindSlotSelectionButtons();
            updateBookingSubmitState(submitButton, selectedSlotId);
          });
        });
      };

      renderAvailabilityCalendar(availableSlots, slotList, selectedSlotId);
      bindSlotSelectionButtons();
    }

    const initialSelected = availableSlots.find((slot) => slot.id === selectedSlotId);
    renderBookingSelectionDetail(initialSelected, selectedDetail);
    updateBookingSubmitState(submitButton, selectedSlotId);
    initBookingSubmitAction(submitButton, selects, notes, () => selectedSlotId);
    return;
  }

  function updateBookingSubmitState(submitButton, selectedSlotId) {
    if (!submitButton) {
      return;
    }
    if (!selectedSlotId) {
      submitButton.textContent = "Select a Slot";
      submitButton.disabled = true;
      return;
    }
    submitButton.textContent = "Submit Booking Request";
    submitButton.disabled = false;
  }

  function initBookingSubmitAction(submitButton, selects, notes, getSelectedSlotId) {
    if (!submitButton) {
      return;
    }
    bindAction(submitButton, async (event) => {
      event.preventDefault();
      const selectedSlotId = getSelectedSlotId();
      if (!selectedSlotId) {
        toast("Choose a time slot first.", "error");
        return;
      }
      try {
        const result = await apiRequest("client_booking_create", {
          slotId: selectedSlotId,
          goal: selects[0]?.value || "Program Update",
          notes: notes?.value.trim() || "",
        });
        setFlash(result.message);
        redirect("bookings.html");
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderClientMessagesPage(user) {
    if (!window.location.pathname.endsWith("/messages.html")) {
      return;
    }

    const tbody = document.querySelector("tbody");
    const messages = clientMessages(user);
    const posts = communityPosts();
    const communityFeed = document.getElementById("community-feed");
    const audienceSelect = document.getElementById("community-audience");
    const shareInput = document.getElementById("community-body");
    const shareButton = document.getElementById("community-share-button");
    if (tbody) {
      tbody.innerHTML = messages.length
        ? messages
            .map(
              (message) => `
                <tr>
                  <td>${escapeHtml(message.from)}</td>
                  <td>${escapeHtml(message.topic)}</td>
                  <td>${escapeHtml(message.createdAt)}</td>
                  <td><span class="tag ${message.status === "Unread" ? "green" : "blue"}">${escapeHtml(message.status)}</span></td>
                </tr>
              `
            )
            .join("")
        : '<tr><td colspan="4"><div class="app-empty">No messages yet.</div></td></tr>';
    }

    if (communityFeed) {
      communityFeed.innerHTML = posts.length
        ? posts
            .slice(0, 6)
            .map(
              (post) => `
                <div class="item">
                  <div class="between"><strong>${escapeHtml(post.audience)}</strong><span>${escapeHtml(post.createdAt)}</span></div>
                  <div class="muted">${escapeHtml(post.body)}</div>
                </div>
              `
            )
            .join("")
        : '<div class="app-empty">No community updates shared yet.</div>';
    }

    const topicInput = document.querySelector(".panel .input");
    const bodyInput = document.querySelector(".panel .textarea");
    const sendButton = document.getElementById("client-message-send");
    if (topicInput) {
      topicInput.value = "";
    }
    if (bodyInput) {
      bodyInput.value = "";
    }
    if (topicInput && bodyInput && sendButton) {
      bindAction(sendButton, async (event) => {
        event.preventDefault();
        const topic = topicInput.value.trim();
        const body = bodyInput.value.trim();
        if (!topic || !body) {
          toast("Please enter both a topic and message.", "error");
          return;
        }
        try {
          const result = await apiRequest("client_message_create", { topic, body });
          toast(result.message, "success");
          topicInput.value = "";
          bodyInput.value = "";
          renderClientMessagesPage(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    if (audienceSelect) {
      audienceSelect.innerHTML = ['Coach', 'Friends', ...(user.connections || [])]
        .filter((value, index, list) => list.indexOf(value) === index)
        .map((value) => `<option>${escapeHtml(value)}</option>`)
        .join("");
    }
    if (shareButton && shareInput && audienceSelect) {
      bindAction(shareButton, async (event) => {
        event.preventDefault();
        if (!shareInput.value.trim()) {
          toast("Write a quick progress update first.", "error");
          return;
        }
        try {
          const result = await apiRequest("client_community_post_create", {
            audience: audienceSelect.value,
            body: shareInput.value.trim(),
          });
          toast(result.message, "success");
          shareInput.value = "";
          renderClientMessagesPage(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function renderClientProgressPage(user) {
    if (!window.location.pathname.endsWith("/progress.html")) {
      return;
    }

    const entries = clientProgressEntries(user);
    const latest = entries[0];
    const logs = workoutLogs();
    const workout = currentWorkout();
    const summaryPanel = document.getElementById("progress-history");
    const inputs = document.querySelectorAll("#progress-checkin-form .input");
    const textarea = document.querySelector("#progress-checkin-form .textarea");
    const mediaPreview = document.getElementById("client-progress-media-preview");
    const mediaInput = document.getElementById("client-progress-media-input");
    const timerDisplay = document.getElementById("workout-timer-display");
    const intervalButton = document.getElementById("start-interval-timer");
    const restButton = document.getElementById("start-rest-timer");
    const stopButton = document.getElementById("stop-workout-timer");
    const logBody = document.getElementById("workout-log-body");
    const workoutSummary = document.getElementById("workout-log-summary");
    const logSaveButton = document.getElementById("workout-log-save");
    let timerId = window.__noellaWorkoutTimer || null;
    let remainingSeconds = window.__noellaWorkoutTimerValue || 0;

    function paintTimer() {
      if (timerDisplay) {
        timerDisplay.textContent = formatSeconds(remainingSeconds);
      }
    }

    function stopTimer() {
      if (timerId) {
        clearInterval(timerId);
      }
      timerId = null;
      window.__noellaWorkoutTimer = null;
    }

    function startTimer(seconds) {
      remainingSeconds = seconds;
      window.__noellaWorkoutTimerValue = remainingSeconds;
      paintTimer();
      stopTimer();
      timerId = window.setInterval(() => {
        remainingSeconds = Math.max(0, remainingSeconds - 1);
        window.__noellaWorkoutTimerValue = remainingSeconds;
        paintTimer();
        if (remainingSeconds === 0) {
          stopTimer();
          toast("Timer complete.", "success");
        }
      }, 1000);
      window.__noellaWorkoutTimer = timerId;
    }

    if (summaryPanel) {
      summaryPanel.innerHTML = `
        <div class="head"><div><p class="eyebrow">Progress Tracking</p><h2>Saved Check-Ins</h2></div></div>
        ${
          entries.length
            ? `<div class="list">
                ${entries
                  .slice(0, 5)
                  .map(
                    (entry) => `
                      <div class="item">
                        <div class="between"><strong>${escapeHtml(entry.createdAt)}</strong><span>${escapeHtml(entry.weight || "--")}</span></div>
                        <div class="muted">Waist: ${escapeHtml(entry.waist || "--")}</div>
                        <div class="muted">${escapeHtml(entry.notes || "No notes added.")}</div>
                        ${entry.media?.length ? `<div class="app-media-inline">${renderMediaPreview(entry.media)}</div>` : ""}
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : '<div class="app-empty">No check-ins saved yet. Use the form to add your first one.</div>'
        }
      `;
    }

    if (workoutSummary) {
      const totalVolume = logs.reduce((sum, item) => sum + Number(item.volume || 0), 0);
      const totalCalories = logs.reduce((sum, item) => sum + Number(item.caloriesBurned || 0), 0);
      workoutSummary.innerHTML = `
        <div class="metric-grid">
          <div class="metric-card"><span class="mini">Logged Sessions</span><strong>${logs.length}</strong></div>
          <div class="metric-card"><span class="mini">Total Volume</span><strong>${Math.round(totalVolume)}</strong></div>
          <div class="metric-card"><span class="mini">Current Plan</span><strong>${escapeHtml(workout?.title || "Custom")}</strong></div>
          <div class="metric-card"><span class="mini">Calories Burned</span><strong>${Math.round(totalCalories)}</strong></div>
        </div>
      `;
    }

    if (logBody) {
      logBody.innerHTML = logs.length
        ? logs
            .slice(0, 8)
            .map(
              (log) => `
                <tr>
                  <td>${escapeHtml(log.sessionDate)}</td>
                  <td>${escapeHtml(log.exerciseName)}</td>
                  <td>${log.sets} x ${log.reps}</td>
                  <td>${log.load}</td>
                  <td>${formatSeconds(log.durationSeconds || 0)}</td>
                  <td>${log.distance || "--"}</td>
                  <td>${log.heartRate || "--"}</td>
                  <td>${Math.round(log.caloriesBurned || 0)}</td>
                </tr>
              `
            )
            .join("")
        : '<tr><td colspan="8"><div class="app-empty">No workout sets logged yet.</div></td></tr>';
    }

    const logDateInput = document.getElementById("workout-log-date");
    if (logDateInput && !logDateInput.value) {
      logDateInput.value = new Date().toISOString().slice(0, 10);
    }

    if (latest && inputs[0] && inputs[1] && textarea) {
      inputs[0].value = latest.weight;
      inputs[1].value = latest.waist;
      textarea.value = latest.notes;
    } else if (inputs[0] && inputs[1] && textarea) {
      inputs[0].value = "";
      inputs[1].value = "";
      textarea.value = "";
    }
    if (mediaPreview) {
      mediaPreview.innerHTML = renderMediaPreview(pendingProgressMedia);
    }
    bindField(mediaInput, "change", async () => {
      const files = [...(mediaInput.files || [])];
      if (!files.length) {
        return;
      }
      try {
        for (const file of files) {
          const media = await uploadMedia(file, "progress", true);
          pendingProgressMedia = [...pendingProgressMedia, media].slice(0, 3);
        }
        mediaPreview.innerHTML = renderMediaPreview(pendingProgressMedia);
        mediaInput.value = "";
        toast("Progress media uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    paintTimer();
    bindAction(intervalButton, (event) => {
      event.preventDefault();
      startTimer(20 * 60);
    });
    bindAction(restButton, (event) => {
      event.preventDefault();
      startTimer(90);
    });
    bindAction(stopButton, (event) => {
      event.preventDefault();
      stopTimer();
      remainingSeconds = 0;
      window.__noellaWorkoutTimerValue = 0;
      paintTimer();
    });

    const saveButton = document.getElementById("progress-checkin-save");
    if (saveButton && inputs[0] && inputs[1] && textarea) {
      bindAction(saveButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_progress_create", {
            weight: inputs[0].value.trim(),
            waist: inputs[1].value.trim(),
            notes: textarea.value.trim(),
            media: pendingProgressMedia,
          });
          toast(result.message, "success");
          pendingProgressMedia = [];
          renderClientProgressPage(currentUser());
          renderClientDashboard(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    if (logSaveButton) {
      bindAction(logSaveButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_workout_log_create", {
            programId: getQueryParam("program") || "",
            sessionDate: document.getElementById("workout-log-date")?.value || "",
            exerciseName: document.getElementById("workout-log-exercise")?.value.trim() || "",
            sets: Number(document.getElementById("workout-log-sets")?.value || 0),
            reps: Number(document.getElementById("workout-log-reps")?.value || 0),
            load: Number(document.getElementById("workout-log-load")?.value || 0),
            rpe: Number(document.getElementById("workout-log-rpe")?.value || 0),
            durationSeconds: Number(document.getElementById("workout-log-duration")?.value || remainingSeconds || 0),
            distance: Number(document.getElementById("workout-log-distance")?.value || 0),
            heartRate: Number(document.getElementById("workout-log-heart-rate")?.value || 0),
            notes: document.getElementById("workout-log-notes")?.value.trim() || "",
          });
          toast(result.message, "success");
          ["workout-log-exercise", "workout-log-sets", "workout-log-reps", "workout-log-load", "workout-log-rpe", "workout-log-duration", "workout-log-distance", "workout-log-heart-rate", "workout-log-notes"].forEach((id) => {
            const node = document.getElementById(id);
            if (node) {
              node.value = "";
            }
          });
          renderClientProgressPage(currentUser());
          renderClientDashboard(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function renderClientSettingsPage(user) {
    if (!window.location.pathname.endsWith("/settings.html")) {
      return;
    }

    const profileWrap = document.getElementById("account-profile-panel");
    const preferencesWrap = document.getElementById("account-preferences-panel");
    const subscriptionWrap = document.getElementById("account-subscription-panel");
    const mobileWrap = document.getElementById("account-mobile-panel");
    const avatarInput = document.getElementById("client-avatar-input");
    const avatarPreview = document.getElementById("client-avatar-preview");
    const firstNameInput = document.getElementById("client-first-name");
    const lastNameInput = document.getElementById("client-last-name");
    const emailInput = document.getElementById("client-email");
    const phoneInput = document.getElementById("client-phone");
    const heightInput = document.getElementById("client-height-cm");
    const weightInput = document.getElementById("client-current-weight");
    const sportsPositionInput = document.getElementById("client-sports-position");
    const trainingHistoryInput = document.getElementById("client-training-history");
    const achievementsInput = document.getElementById("client-achievements");
    const fitnessScoresInput = document.getElementById("client-fitness-scores");
    const injuryNotesInput = document.getElementById("client-injury-notes");
    const workoutLocationInput = document.getElementById("client-workout-location");
    const preferredContactInput = document.getElementById("client-preferred-contact");
    const subscriptionTierInput = document.getElementById("client-subscription-tier");
    const connectionsInput = document.getElementById("client-connections");
    if (avatarPreview) {
      avatarPreview.innerHTML = pendingClientAvatar || user.avatarUrl
        ? `<div class="app-avatar-preview"><img src="${escapeHtml(mediaUrl(pendingClientAvatar || user.avatarUrl))}" alt="Profile photo"></div>`
        : '<div class="app-empty">No profile photo uploaded yet.</div>';
    }
    bindField(avatarInput, "change", async () => {
      const file = avatarInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const media = await uploadMedia(file, "avatars", false);
        pendingClientAvatar = media.url;
        if (avatarPreview) {
          avatarPreview.innerHTML = `<div class="app-avatar-preview"><img src="${escapeHtml(mediaUrl(media.url))}" alt="Profile photo"></div>`;
        }
        avatarInput.value = "";
        toast("Profile photo uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
    if (firstNameInput) firstNameInput.value = user.firstName || "";
    if (lastNameInput) lastNameInput.value = user.lastName || "";
    if (emailInput) emailInput.value = user.email || "";
    if (phoneInput) phoneInput.value = user.phone || "";
    if (heightInput) heightInput.value = user.athleteProfile?.heightCm || "";
    if (weightInput) weightInput.value = user.athleteProfile?.currentWeight || "";
    if (sportsPositionInput) sportsPositionInput.value = user.athleteProfile?.sportsPosition || "";
    if (trainingHistoryInput) trainingHistoryInput.value = user.athleteProfile?.trainingHistory || "";
    if (achievementsInput) achievementsInput.value = (user.athleteProfile?.achievements || []).join(", ");
    if (fitnessScoresInput) fitnessScoresInput.value = Object.entries(user.athleteProfile?.fitnessScores || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(", ");
    if (injuryNotesInput) injuryNotesInput.value = user.athleteProfile?.injuryNotes || "";
    if (workoutLocationInput) workoutLocationInput.value = user.preferences?.workoutLocation || "Mixed";
    if (preferredContactInput) preferredContactInput.value = user.preferences?.preferredContact || "Email";
    if (subscriptionTierInput) subscriptionTierInput.value = user.subscriptionTier || "Starter";
    if (connectionsInput) connectionsInput.value = (user.connections || []).join(", ");
    if (mobileWrap) {
      mobileWrap.innerHTML = `
        <div class="head"><div><p class="eyebrow">Mobile-First Setup</p><h2>Gym Phone Workflow</h2></div></div>
        <div class="list">
          <div class="item"><strong>Touch-friendly logging</strong><div class="muted">Large inputs, one-tap timers, and simple progress forms keep gym use fast on a phone.</div></div>
          <div class="item"><strong>Offline support</strong><div class="muted">Download workout PDFs before a session when you want routine access without reloading the page.</div></div>
          <div class="item"><strong>Search from the top</strong><div class="muted">Program and library pages keep search and filters visible for quick exercise lookup between sets.</div></div>
        </div>
      `;
    }

    const saveProfileButton = document.getElementById("client-save-profile");
    const savePreferencesButton = document.getElementById("client-save-preferences");
    const saveFeaturesButton = document.getElementById("client-save-features");
    if (saveProfileButton) {
      bindAction(saveProfileButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_profile_update", {
            firstName: firstNameInput?.value.trim(),
            lastName: lastNameInput?.value.trim(),
            email: emailInput?.value.trim(),
            phone: phoneInput?.value.trim(),
            avatarUrl: pendingClientAvatar || user.avatarUrl || "",
            heightCm: heightInput?.value.trim() || "",
            currentWeight: weightInput?.value.trim() || "",
            sportsPosition: sportsPositionInput?.value.trim() || "",
            trainingHistory: trainingHistoryInput?.value.trim() || "",
            achievements: (achievementsInput?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
            fitnessScores: Object.fromEntries(
              (fitnessScoresInput?.value || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => {
                  const [key, value] = item.split(":");
                  return [String(key || "").trim(), String(value || "").trim()];
                })
                .filter(([key]) => key)
            ),
            injuryNotes: injuryNotesInput?.value.trim() || "",
          });
          toast(result.message, "success");
          updateBrandElements();
          pendingClientAvatar = "";
          renderClientSettingsPage(currentUser());
          renderClientShell(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    if (savePreferencesButton) {
      bindAction(savePreferencesButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_preferences_update", {
            workoutLocation: workoutLocationInput?.value,
            preferredContact: preferredContactInput?.value,
          });
          toast(result.message, "success");
          renderClientSettingsPage(currentUser());
          renderClientNutritionPage(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    if (saveFeaturesButton) {
      bindAction(saveFeaturesButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_account_features_update", {
            connections: (connectionsInput?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
          });
          toast(result.message, "success");
          renderClientSettingsPage(currentUser());
          renderClientMessagesPage(currentUser());
          renderClientProgramsPage(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function renderClientNutritionPage(user) {
    if (!window.location.pathname.endsWith("/nutrition.html")) {
      return;
    }

    const summaryPanel = document.getElementById("nutrition-summary-panel");
    const textarea = document.getElementById("nutrition-food-preferences");
    const hydrationInput = document.getElementById("nutrition-hydration-goal");
    const sportGuideInput = document.getElementById("nutrition-sport-guide");
    const supplementsInput = document.getElementById("nutrition-supplements");
    const saveButton = document.getElementById("nutrition-save-button");
    const macroOutput = document.getElementById("nutrition-macro-output");
    const supportOutput = document.getElementById("nutrition-support-output");
    const athlete = athleteSnapshot(user);
    const bodyWeight = Number(String(athlete.weight || 70).replace(/[^\d.]/g, "")) || 70;
    const protein = Math.round(bodyWeight * 2);
    const carbs = Math.round(bodyWeight * 4);
    const fats = Math.round(bodyWeight * 0.8);
    if (summaryPanel) {
      summaryPanel.innerHTML = `
        <div class="head"><div><p class="eyebrow">Nutrition Profile</p><h2>Meal Plans & Guides</h2></div></div>
        <div class="list">
          <div class="item"><strong>Breakfast</strong><div class="muted">Protein oats, fruit, and yogurt or eggs with toast for training days.</div></div>
          <div class="item"><strong>Lunch</strong><div class="muted">Lean protein, rice or potatoes, and vegetables for recovery support.</div></div>
          <div class="item"><strong>Dinner</strong><div class="muted">Salmon, chicken, or beans with colorful vegetables and a slow carb source.</div></div>
          <div class="item"><strong>Sport Guide</strong><div class="muted">${escapeHtml(user.preferences?.sportNutritionGuide || "General Performance")}</div></div>
        </div>
      `;
    }
    if (textarea) {
      textarea.value = user.preferences?.foodPreferences || "";
    }
    if (hydrationInput) {
      hydrationInput.value = user.preferences?.hydrationGoal || "2.5L";
    }
    if (sportGuideInput) {
      sportGuideInput.value = user.preferences?.sportNutritionGuide || "General Performance";
    }
    if (supplementsInput) {
      supplementsInput.value = user.preferences?.supplementNotes || "Whey protein, creatine, electrolyte mix";
    }
    if (macroOutput) {
      macroOutput.innerHTML = `
        <div class="metric-card"><span class="mini">Protein</span><strong>${protein} g</strong><span class="muted">~2.0 g/kg bodyweight</span></div>
        <div class="metric-card"><span class="mini">Carbs</span><strong>${carbs} g</strong><span class="muted">Training fuel estimate</span></div>
        <div class="metric-card"><span class="mini">Fats</span><strong>${fats} g</strong><span class="muted">Daily baseline support</span></div>
        <div class="metric-card"><span class="mini">Hydration</span><strong>${escapeHtml(user.preferences?.hydrationGoal || "2.5L")}</strong><span class="muted">Daily target</span></div>
      `;
    }
    if (supportOutput) {
      supportOutput.innerHTML = `
        <div class="item"><strong>Hydration Tracker</strong><div class="muted">Target: ${escapeHtml(user.preferences?.hydrationGoal || "2.5L")} with extra electrolytes around heavy sessions or long conditioning.</div></div>
        <div class="item"><strong>Supplement Recommendations</strong><div class="muted">${escapeHtml(user.preferences?.supplementNotes || "Whey protein, creatine, electrolyte mix")}</div></div>
        <div class="item"><strong>Sport-Specific Guide</strong><div class="muted">${escapeHtml(user.preferences?.sportNutritionGuide || "General Performance")} fueling recommendations are active.</div></div>
      `;
    }
    if (saveButton && textarea) {
      bindAction(saveButton, async (event) => {
        event.preventDefault();
        try {
          const result = await apiRequest("client_nutrition_update", {
            foodPreferences: textarea.value.trim(),
            hydrationGoal: hydrationInput?.value.trim() || "2.5L",
            sportNutritionGuide: sportGuideInput?.value || "General Performance",
            supplementNotes: supplementsInput?.value.trim() || "",
          });
          toast(result.message, "success");
          renderClientNutritionPage(currentUser());
          renderClientDashboard(currentUser());
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function renderStorePage(user) {
    if (window.location.pathname.endsWith("/store.html")) {
      const grid = document.querySelector(".grid3");
      const note = document.querySelector(".note");
      if (!grid) {
        return;
      }

      const cartItems = cartForUser(user);
      const cartItemMap = new Map(cartItems.map((entry) => [entry.productId, entry.quantity]));
      renderCartNavBadge(user);

      const products = getState().products.filter(
        (product) => product.status !== "Draft" && product.visibility !== "Private link only"
      );
      grid.innerHTML = products.length
        ? products
            .map(
              (product) => {
                const outOfStock = product.inventory !== null && product.inventory <= 0;
                const media = product.media?.[0];
                const hero = media
                  ? media.type === "video"
                    ? `<video src="${escapeHtml(mediaUrl(media.url))}" muted controls preload="metadata"></video>`
                    : `<img src="${escapeHtml(mediaUrl(media.url))}" alt="${escapeHtml(product.name)}">`
                  : escapeHtml(product.displayName || product.name);
                const inCartQty = cartItemMap.get(product.id) || 0;
                return `
                <article class="card product-card">
                  <div class="hero-product">${hero}</div>
                  <h3>${escapeHtml(product.name)}</h3>
                  <p class="muted">${escapeHtml(product.description)}</p>
                  <p class="price">${money(product.price)}</p>
                  ${inCartQty ? `<div class="product-status">In cart: ${escapeHtml(String(inCartQty))}</div>` : ""}
                  <div class="actions">
                    <a href="product.html?product=${encodeURIComponent(product.id)}" class="btn btn-primary">View Product</a>
                    <a href="#" class="btn btn-secondary app-add-to-cart ${outOfStock ? "disabled" : ""}" data-product-id="${escapeHtml(product.id)}" aria-disabled="${outOfStock}">
                      ${outOfStock ? "Out of Stock" : "Add to Cart"}
                    </a>
                  </div>
                </article>
              `;
              }
            )
            .join("")
        : '<div class="app-empty" style="grid-column:1 / -1;">No live products are available in the store yet.</div>';

      if (note) {
        note.textContent = products.length
          ? "Products shown here are live items pulled from the admin catalog."
          : "The store will populate automatically when products are published from the admin area.";
      }

      grid.querySelectorAll(".app-add-to-cart").forEach((button) => {
        if (button.classList.contains("disabled")) {
          return;
        }
        bindAction(button, async (event) => {
          event.preventDefault();
          const originalText = button.textContent;
          try {
            const result = await apiRequest("cart_add", {
              productId: button.getAttribute("data-product-id"),
              quantity: 1,
            });
            toast(result.message, "success");
            button.textContent = "Added ✓";
            button.classList.add("disabled");
            button.setAttribute("aria-disabled", "true");
            setTimeout(() => {
              button.textContent = originalText;
              button.classList.remove("disabled");
              button.removeAttribute("aria-disabled");
            }, 1400);
          } catch (error) {
            toast(error.message, "error");
          }
        });
      });
      return;
    }

    if (window.location.pathname.endsWith("/product.html")) {
      const selectedProductId = getQueryParam("product");
      const product = selectedProductId ? findProduct(selectedProductId) : getState().products[0];

      const hero = document.querySelector(".hero-product");
      const title = document.querySelector(".panel h2");
      const tag = document.querySelector(".panel .tag");
      const description = document.querySelector(".panel .muted");
      const price = document.querySelector(".price");
      const list = document.querySelector(".panel .list");
      const addButton = document.querySelector(".panel .btn-primary");
      const panels = document.querySelectorAll(".panel");

      if (!product) {
        if (panels[0]) {
          panels[0].innerHTML = '<div class="app-empty">No product was selected.</div>';
        }
        if (panels[1]) {
          panels[1].innerHTML = `
            <div class="head"><div><p class="eyebrow">Product Detail</p><h2>Product Not Found</h2></div><span class="tag yellow">Unavailable</span></div>
            <p class="muted">This product is not available anymore or was never published.</p>
            <div class="actions" style="margin-top:1rem;"><a href="store.html" class="btn btn-secondary">Back to Store</a></div>
          `;
        }
        return;
      }

      if (hero) {
        hero.innerHTML = product.media?.[0]
          ? (product.media[0].type === "video"
              ? `<video src="${escapeHtml(mediaUrl(product.media[0].url))}" controls preload="metadata"></video>`
              : `<img src="${escapeHtml(mediaUrl(product.media[0].url))}" alt="${escapeHtml(product.name)}">`)
          : escapeHtml(product.displayName || product.name);
      }
      if (title) title.textContent = product.name;
      if (tag) tag.textContent = product.inventory === null || product.inventory > 0 ? "Available" : "Unavailable";
      if (description) description.textContent = product.description;
      if (price) price.textContent = money(product.price);
      if (list) {
        list.innerHTML = `
          <div class="item"><strong>Category</strong><div class="muted">${escapeHtml(product.category)}</div></div>
          <div class="item"><strong>Inventory</strong><div class="muted">${escapeHtml(product.inventory == null ? "Unlimited / made to order" : String(product.inventory) + " left")}</div></div>
          <div class="item"><strong>Delivery</strong><div class="muted">${escapeHtml(product.deliveryType)}</div></div>
          <div class="item"><strong>Included</strong><div class="muted">${escapeHtml(product.details.join(" + "))}</div></div>
        `;
      }
      if (addButton) {
        if (product.inventory !== null && product.inventory <= 0) {
          addButton.textContent = "Out of Stock";
          addButton.classList.add("disabled");
          addButton.setAttribute("aria-disabled", "true");
        } else {
          bindAction(addButton, async (event) => {
            event.preventDefault();
            try {
              await apiRequest("cart_add", { productId: product.id, quantity: 1 });
              toast("Item added to cart.", "success");
              redirect("cart.html");
            } catch (error) {
              toast(error.message, "error");
            }
          });
        }
      }
      return;
    }

    if (!window.location.pathname.endsWith("/cart.html")) {
      return;
    }

    const cart = cartForUser(user);
    const tbody = document.querySelector("tbody");
    const items = cart
      .map((entry) => {
        const product = findProduct(entry.productId);
        return product
          ? {
              product,
              quantity: entry.quantity,
              total: product.price * entry.quantity,
            }
          : null;
      })
      .filter(Boolean);

    if (tbody) {
      tbody.innerHTML = items.length
        ? items
            .map(
              (item) => `
                <tr>
                  <td>
                    <div class="cart-product-name">
                      <span>${escapeHtml(item.product.name)}</span>
                      <button type="button" class="app-remove-item" data-product-id="${escapeHtml(item.product.id)}">Remove</button>
                    </div>
                  </td>
                  <td>
                    <div class="quantity-control">
                      <button type="button" class="quantity-button app-decrease-qty" data-product-id="${escapeHtml(item.product.id)}">−</button>
                      <span>${item.quantity}</span>
                      <button type="button" class="quantity-button app-increase-qty" data-product-id="${escapeHtml(item.product.id)}">+</button>
                    </div>
                  </td>
                  <td>${money(item.product.price)}</td>
                  <td>${money(item.total)}</td>
                </tr>
              `
            )
            .join("")
        : '<tr><td colspan="4"><div class="app-empty">Your cart is empty.</div></td></tr>';

      if (items.length) {
        tbody.querySelectorAll('.app-decrease-qty').forEach((button) => {
          bindAction(button, async (event) => {
            event.preventDefault();
            const productId = button.getAttribute('data-product-id');
            const row = button.closest('tr');
            const quantity = Number(row?.querySelector('.quantity-control span')?.textContent || '0');
            const newQuantity = Math.max(0, quantity - 1);
            try {
              const result = await apiRequest('cart_update', { productId, quantity: newQuantity });
              toast(result.message, 'success');
              renderStorePage(user);
            } catch (error) {
              toast(error.message, 'error');
            }
          });
        });

        tbody.querySelectorAll('.app-increase-qty').forEach((button) => {
          bindAction(button, async (event) => {
            event.preventDefault();
            const productId = button.getAttribute('data-product-id');
            const row = button.closest('tr');
            const quantity = Number(row?.querySelector('.quantity-control span')?.textContent || '0');
            const newQuantity = quantity + 1;
            try {
              const result = await apiRequest('cart_update', { productId, quantity: newQuantity });
              toast(result.message, 'success');
              renderStorePage(user);
            } catch (error) {
              toast(error.message, 'error');
            }
          });
        });

        tbody.querySelectorAll('.app-remove-item').forEach((button) => {
          bindAction(button, async (event) => {
            event.preventDefault();
            const productId = button.getAttribute('data-product-id');
            try {
              const result = await apiRequest('cart_update', { productId, quantity: 0 });
              toast(result.message, 'success');
              renderStorePage(user);
            } catch (error) {
              toast(error.message, 'error');
            }
          });
        });
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const shipping = items.length ? 5 : 0;
    const total = subtotal + shipping;
    const summary = document.querySelectorAll(".panel .between span");
    if (summary[0]) summary[0].textContent = money(subtotal);
    if (summary[1]) summary[1].textContent = money(shipping);
    if (summary[2]) summary[2].textContent = money(total);
    const note = document.querySelector(".note");
    if (note) {
      note.innerHTML = items.length
        ? "Submitting saves an order request and clears your cart. Payment is not collected in this portal yet."
        : 'Your cart is empty. <a href="store.html" class="app-link-button">Browse the store</a> and add a product to place an order.';
    }

    const placeOrderButton = document.querySelector(".panel .btn-primary");
    if (placeOrderButton) {
      const isEmpty = items.length === 0;
      placeOrderButton.textContent = isEmpty ? "Cart Is Empty" : "Submit Order Request";
      placeOrderButton.classList.toggle("disabled", isEmpty);
      placeOrderButton.disabled = isEmpty;
      bindAction(placeOrderButton, async (event) => {
        event.preventDefault();
        if (isEmpty) {
          return;
        }
        try {
          const result = await apiRequest("order_create", {});
          setFlash(result.message);
          redirect("orders.html");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function renderClientOrdersPage(user) {
    if (!window.location.pathname.endsWith("/orders.html")) {
      return;
    }

    const tbody = document.querySelector("tbody");
    const orders = clientOrders(user);
    if (tbody) {
      tbody.innerHTML = orders.length
        ? orders
            .map((order) => {
              const items = order.itemIds
                .map((id) => findProduct(id) || findProgram(id))
                .filter(Boolean)
                .map((item) => item.name)
                .join(", ");
              const tone = statusTone(order.status);
              return `
                <tr data-order-id="${escapeHtml(order.id)}">
                  <td>${escapeHtml(order.id)}</td>
                  <td>${escapeHtml(order.createdAt)}</td>
                  <td>${escapeHtml(items || "Order")}</td>
                  <td>${money(order.total)}</td>
                  <td><span class="tag ${tone}">${escapeHtml(order.status)}</span></td>
                </tr>
              `;
            })
            .join("")
          : '<tr><td colspan="5"><div class="app-empty">No orders yet.</div></td></tr>';

      tbody.querySelectorAll('tr[data-order-id]').forEach((row) => {
        bindAction(row, (event) => {
          event.preventDefault();
          selectedOrderId = row.getAttribute('data-order-id');
          renderClientOrdersPage(user);
        });
      });
    }

    const selected = orders.find((order) => order.id === selectedOrderId) || orders[0] || null;
    if (selected) {
      selectedOrderId = selected.id;
    }
    renderOrderDetail(selected);

    const supportInput = document.querySelector(".panel .textarea");
    const supportButton = document.querySelector(".panel .btn-primary");
    if (supportInput) {
      supportInput.value = "";
    }
    if (supportInput && supportButton) {
      bindAction(supportButton, async (event) => {
        event.preventDefault();
        const body = supportInput.value.trim();
        if (!body) {
          toast("Add your order question first.", "error");
          return;
        }
        try {
          const result = await apiRequest("client_message_create", {
            topic: "Order Support",
            body,
          });
          toast(result.message, "success");
          supportInput.value = "";
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function statusTone(status) {
    const value = String(status || "").toLowerCase();
    if (value.includes("deliver") || value.includes("confirm") || value.includes("active") || value.includes("complete") || value.includes("live")) {
      return "green";
    }
    if (value.includes("issue") || value.includes("cancel")) {
      return "red";
    }
    if (value.includes("draft") || value.includes("pending") || value.includes("unfulfilled")) {
      return "yellow";
    }
    return "blue";
  }

  function renderOrderDetail(order) {
    const container = document.querySelector('.order-detail-card');
    const title = container?.querySelector('.head h2');
    const body = container?.querySelector('.order-detail-body');
    if (!container || !body) {
      return;
    }

    if (!order) {
      if (title) {
        title.textContent = 'Select an order';
      }
      body.innerHTML = '<p class="muted">Click any order row to review items, shipping info, tracking status, and reorder fast.</p>';
      return;
    }

    const items = (order.itemIds || [])
      .map((id) => findProduct(id) || findProgram(id))
      .filter(Boolean)
      .map((item) => `<div class="item"><strong>${escapeHtml(item.name)}</strong></div>`)
      .join("");

    const status = String(order.status || '').toLowerCase();
    const stages = [
      { label: 'Payment pending', key: 'pending' },
      { label: 'Order confirmed', key: 'confirmed' },
      { label: 'Shipped', key: 'shipped' },
      { label: 'Delivered', key: 'delivered' },
    ];
    const activeIndex = stages.findIndex((stage) => status.includes(stage.key)) !== -1
      ? stages.findIndex((stage) => status.includes(stage.key))
      : status.includes('cancel')
        ? 0
        : status.includes('pending')
          ? 0
          : 1;

    const timeline = stages
      .map((stage, index) => {
        const isComplete = index < activeIndex && !status.includes('cancel');
        const isCurrent = index === activeIndex && !status.includes('cancel');
        const stateClass = status.includes('cancel') ? 'cancelled' : isComplete ? 'complete' : isCurrent ? 'current' : 'upcoming';
        const label = `${stage.label}${isComplete ? ' ✓' : ''}`;
        return `
          <div class="timeline-item ${stateClass}">
            <div><strong>${escapeHtml(stage.label)}</strong></div>
            <span>${escapeHtml(stateClass === 'complete' ? 'Complete' : stateClass === 'current' ? 'Current' : 'Upcoming')}</span>
          </div>
        `;
      })
      .join('');

    if (title) {
      title.textContent = `Order #${escapeHtml(order.id)}`;
    }
    body.innerHTML = `
      <div class="timeline">${timeline}</div>
      <div class="item"><strong>Date</strong><div class="muted">${escapeHtml(order.createdAt)}</div></div>
      <div class="item"><strong>Status</strong><div class="muted">${escapeHtml(order.status)}</div></div>
      <div class="item"><strong>Delivery</strong><div class="muted">${escapeHtml(order.deliveryMethod || 'Standard delivery')}</div></div>
      <div class="item"><strong>Tracking</strong><div class="muted">${escapeHtml(order.tracking || 'Pending')}</div></div>
      <div class="item"><strong>Order total</strong><div class="muted">${money(order.total)}</div></div>
      <div class="item"><strong>Items</strong>${items || '<div class="muted">No items found.</div>'}</div>
      <div class="item"><strong>Notes</strong><div class="muted">${escapeHtml(order.notes || 'No order notes available.')}</div></div>
      <div class="actions" style="margin-top:1rem;"><button type="button" class="btn btn-secondary app-order-reorder" data-order-id="${escapeHtml(order.id)}">Reorder Items</button></div>
    `;

    const reorderButton = container.querySelector('.app-order-reorder');
    if (reorderButton) {
      bindAction(reorderButton, async (event) => {
        event.preventDefault();
        try {
          for (const productId of order.itemIds || []) {
            await apiRequest('cart_add', { productId, quantity: 1 });
          }
          toast('Order items added to cart.', 'success');
          renderStorePage(currentUser());
          redirect('cart.html');
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    }
  }

  function renderEmptyRow(tbody, colspan, message) {
    if (!tbody) {
      return;
    }
    tbody.innerHTML = `<tr><td colspan="${colspan}"><div class="app-empty">${escapeHtml(message)}</div></td></tr>`;
  }

  function orderItemLabel(order) {
    const names = (order.itemIds || [])
      .map((id) => findProduct(id) || findProgram(id))
      .filter(Boolean)
      .map((item) => item.name);
    return names.length ? names.join(", ") : "Manual order";
  }

  function renderCartNavBadge(user) {
    const cartCount = cartForUser(user).reduce((sum, item) => sum + item.quantity, 0);
    const cartLink = document.querySelector('.nav a[href="cart.html"]');
    if (!cartLink) {
      return;
    }
    let badge = cartLink.querySelector('.nav-badge');
    if (!badge && cartCount > 0) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      cartLink.appendChild(badge);
    }
    if (badge) {
      if (cartCount > 0) {
        badge.textContent = String(cartCount);
      } else {
        badge.remove();
      }
    }
  }

  function setInputValue(id, value) {
    const node = document.getElementById(id);
    if (node) {
      node.value = value == null ? "" : String(value);
    }
  }

  function clientStatus(client) {
    if ((client.progressScore || 0) >= 70) {
      return { label: "Active", tone: "green" };
    }
    if ((client.progressScore || 0) >= 40) {
      return { label: "Check-In Due", tone: "blue" };
    }
    return { label: "At Risk", tone: "yellow" };
  }

  function renderAdminDashboard() {
    if (!window.location.pathname.endsWith("/admin/index.html")) {
      return;
    }

    const orders = getState().orders;
    const bookings = getState().bookings;
    const clients = getState().users.filter((user) => user.role === "client");
    const programs = getState().programs;
    const products = getState().products;
    const athleteUploads = getState().progressEntries.flatMap((entry) => entry.media || []).filter((item) => item.type === "video").length;
    const stats = document.querySelectorAll(".grid4 .stat");
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);

    if (stats[0]) stats[0].querySelector("h2").textContent = money(revenue);
    if (stats[1]) stats[1].querySelector("h2").textContent = String(orders.length);
    if (stats[2]) stats[2].querySelector("h2").textContent = String(bookings.length + getState().availability.length);
    if (stats[3]) {
      stats[3].querySelector("h2").textContent = String(clients.length);
      stats[3].querySelector(".muted").textContent = `${athleteUploads} uploaded training video(s) ready for review`;
    }

    const sidebarTitle = document.getElementById("dashboard-sidebar-title");
    const sidebarCopy = document.getElementById("dashboard-sidebar-copy");
    if (sidebarTitle) {
      sidebarTitle.textContent = `${clients.length} clients • ${orders.length} orders`;
    }
    if (sidebarCopy) {
      sidebarCopy.textContent = `${programs.length} programs, ${products.length} products, and ${getState().availability.length} open slots are currently saved.`;
    }

    const bars = document.getElementById("dashboard-revenue-bars");
    if (bars) {
      const monthly = {};
      orders.forEach((order) => {
        const key = (order.createdAt || "").slice(0, 7) || "Unknown";
        monthly[key] = (monthly[key] || 0) + Number(order.total || 0);
      });
      const entries = Object.entries(monthly).slice(-6);
      const max = entries.reduce((value, entry) => Math.max(value, entry[1]), 1);
      bars.innerHTML = entries.length
        ? entries
            .map(
              ([month, total]) => `
                <div class="bar">
                  <span style="height:${Math.max(16, Math.round((total / max) * 100))}%"></span>
                  <label>${escapeHtml(month)}</label>
                </div>
              `
            )
            .join("")
        : `
            <div class="bar"><span style="height:16%"></span><label>Start</label></div>
            <div class="bar"><span style="height:16%"></span><label>Saving</label></div>
          `;
    }

    const priorityList = document.getElementById("dashboard-priority-list");
    if (priorityList) {
      const draftProducts = products.filter((product) => product.status === "Draft").length;
      const pendingBookings = bookings.filter((booking) => booking.status === "Pending").length;
      const orderActions = orders.filter((order) => order.status !== "Delivered").length;
      const items = [
        { title: "Draft training products", copy: `${draftProducts} catalog items still need publishing decisions.`, tone: "yellow" },
        { title: "Pending athlete sessions", copy: `${pendingBookings} sessions are waiting for confirmation or follow-up.`, tone: "blue" },
        { title: "Video reviews due", copy: `${athleteUploads} athlete upload(s) can be reviewed with feedback.`, tone: "green" },
      ];
      priorityList.innerHTML = items
        .map(
          (item) => `
            <div class="item flex">
              <div><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.copy)}</div></div>
              <span class="tag ${item.tone}">${escapeHtml(item.title.split(" ")[0])}</span>
            </div>
          `
        )
        .join("");
    }

    const ordersBody = document.getElementById("dashboard-orders-body");
    if (ordersBody) {
      if (!orders.length) {
        renderEmptyRow(ordersBody, 4, "Orders will appear here once the first purchase is saved.");
      } else {
        ordersBody.innerHTML = orders
          .slice(0, 5)
          .map(
            (order) => `
              <tr>
                <td>${escapeHtml(order.buyerName)}</td>
                <td>${escapeHtml(orderItemLabel(order))}</td>
                <td>${money(order.total)}</td>
                <td><span class="tag ${statusTone(order.status)}">${escapeHtml(order.status)}</span></td>
              </tr>
            `
          )
          .join("");
      }
    }

    const funnelList = document.getElementById("dashboard-funnel-list");
    if (funnelList) {
      const liveProducts = products.filter((product) => product.status === "Live" || product.status === "Featured").length;
      const activePrograms = programs.filter((program) => program.status === "Active" || program.status === "Featured").length;
      const publicProducts = products.filter((product) => product.visibility === "Public on website").length;
      const funnel = [
        { name: "Public store offers", value: publicProducts },
        { name: "Active products", value: liveProducts },
        { name: "Active programs", value: activePrograms },
      ];
      const max = funnel.reduce((best, item) => Math.max(best, item.value), 1);
      funnelList.innerHTML = funnel
        .map(
          (item) => `
            <div class="item">
              <div class="between"><strong>${escapeHtml(item.name)}</strong><span>${item.value}</span></div>
              <div class="kpi"><span style="width:${Math.max(12, Math.round((item.value / max) * 100))}%"></span></div>
            </div>
          `
        )
        .join("");
    }

    const scheduleList = document.getElementById("dashboard-schedule-list");
    if (scheduleList) {
      const items = [
        ...bookings.slice(0, 3).map((booking) => ({
          title: `${booking.dateLabel} - ${booking.time}`,
          copy: `${booking.clientName} • ${booking.session} • ${booking.status}`,
        })),
        ...getState().availability.slice(0, 2).map((slot) => ({
          title: `${slot.date} - ${slot.time}`,
          copy: `Open slot • ${slot.type} • ${slot.seats} seat(s)`,
        })),
      ];
      scheduleList.innerHTML = items.length
        ? items.map((item) => `<div class="item"><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.copy)}</div></div>`).join("")
        : '<div class="app-empty">No bookings or availability slots have been added yet.</div>';
    }

    const quickAccess = document.querySelectorAll(".content .grid2 .panel")[3];
    if (quickAccess) {
      quickAccess.innerHTML = `
        <div class="head">
          <div>
            <p class="eyebrow">Coach Portal</p>
            <h2>Key Capabilities</h2>
          </div>
        </div>
        <div class="list">
          <a class="item" href="programs.html"><strong>Create training programs</strong><div class="muted">Build and update structured plans, workout libraries, and sport-specific progressions.</div></a>
          <a class="item" href="clients.html"><strong>Assign workouts and review athlete profiles</strong><div class="muted">Manage athlete stats, training history, injury notes, and assigned programming.</div></a>
          <a class="item" href="bookings.html"><strong>Schedule sessions and review uploads</strong><div class="muted">Track upcoming coaching sessions and use athlete video uploads for feedback.</div></a>
        </div>
      `;
    }
  }

  function renderAdminClients() {
    if (!window.location.pathname.endsWith("/clients.html")) {
      return;
    }

    const clients = getState().users.filter((user) => user.role === "client");
    const tbody = document.getElementById("admin-clients-body");
    const programsWrap = document.getElementById("admin-client-programs");
    const summary = document.getElementById("admin-client-summary");
    const sidebarTitle = document.getElementById("client-sidebar-title");
    const sidebarCopy = document.getElementById("client-sidebar-copy");
    const hiddenId = document.getElementById("admin-client-id");
    const avatarPreview = document.getElementById("admin-client-avatar-preview");
    const avatarInput = document.getElementById("admin-client-avatar-input");

    function renderProgramChecklist(selectedIds) {
      if (!programsWrap) {
        return;
      }
      programsWrap.innerHTML = getState().programs.length
        ? getState().programs
            .map(
              (program) => `
                <label class="item">
                  <input type="checkbox" class="admin-client-program-checkbox" value="${escapeHtml(program.id)}" ${selectedIds.includes(program.id) ? "checked" : ""}>
                  <strong style="margin-left:.55rem;">${escapeHtml(program.name)}</strong>
                  <div class="muted">${escapeHtml(program.type)} • ${money(program.price)}</div>
                </label>
              `
            )
            .join("")
        : '<div class="app-empty">Add programs first, then assign them to clients here.</div>';
    }

    function resetForm() {
      ["admin-client-id", "admin-client-first-name", "admin-client-last-name", "admin-client-email", "admin-client-phone", "admin-client-plan", "admin-client-progress", "admin-client-password", "admin-client-food-preferences", "admin-client-height", "admin-client-weight", "admin-client-position", "admin-client-history", "admin-client-achievements", "admin-client-fitness-scores", "admin-client-injury-notes"].forEach((id) => setInputValue(id, ""));
      setInputValue("admin-client-workout-location", "Mixed");
      setInputValue("admin-client-contact", "Email");
      pendingAdminClientAvatar = "";
      if (avatarPreview) {
        avatarPreview.innerHTML = '<div class="app-empty">No profile photo uploaded yet.</div>';
      }
      renderProgramChecklist([]);
      if (summary) {
        summary.textContent = "Creating a new client profile.";
      }
    }

    if (sidebarTitle) sidebarTitle.textContent = clients.length ? `${clients.length} active client records` : "No clients yet";
    if (sidebarCopy) sidebarCopy.textContent = clients.length ? "Select a client row to edit them, or create a new one from the form." : "Create your first client here or wait for self-registrations.";

    renderProgramChecklist([]);

    if (tbody) {
      if (!clients.length) {
        renderEmptyRow(tbody, 4, "No clients have been created yet.");
      } else {
        tbody.innerHTML = clients
          .map((client) => {
            const status = clientStatus(client);
            return `
              <tr data-client-id="${escapeHtml(client.id)}">
                <td>${escapeHtml(`${client.firstName} ${client.lastName}`.trim())}</td>
                <td>${escapeHtml(client.plan || "Unassigned")}</td>
                <td>${escapeHtml(client.joinedAt || "Unknown")}</td>
                <td><span class="tag ${status.tone}">${escapeHtml(status.label)}</span></td>
              </tr>
            `;
          })
          .join("");

        tbody.querySelectorAll("[data-client-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const client = clients.find((entry) => entry.id === row.getAttribute("data-client-id"));
            if (!client) {
              return;
            }
            setInputValue("admin-client-id", client.id);
            setInputValue("admin-client-first-name", client.firstName);
            setInputValue("admin-client-last-name", client.lastName);
            setInputValue("admin-client-email", client.email);
            setInputValue("admin-client-phone", client.phone);
            setInputValue("admin-client-plan", client.plan);
            setInputValue("admin-client-progress", client.progressScore);
            setInputValue("admin-client-password", "");
            setInputValue("admin-client-food-preferences", client.preferences?.foodPreferences || "");
            setInputValue("admin-client-height", client.athleteProfile?.heightCm || "");
            setInputValue("admin-client-weight", client.athleteProfile?.currentWeight || "");
            setInputValue("admin-client-position", client.athleteProfile?.sportsPosition || "");
            setInputValue("admin-client-history", client.athleteProfile?.trainingHistory || "");
            setInputValue("admin-client-achievements", (client.athleteProfile?.achievements || []).join(", "));
            setInputValue("admin-client-fitness-scores", Object.entries(client.athleteProfile?.fitnessScores || {}).map(([key, value]) => `${key}:${value}`).join(", "));
            setInputValue("admin-client-injury-notes", client.athleteProfile?.injuryNotes || "");
            setInputValue("admin-client-workout-location", client.preferences?.workoutLocation || "Mixed");
            setInputValue("admin-client-contact", client.preferences?.preferredContact || "Email");
            pendingAdminClientAvatar = client.avatarUrl || "";
            if (avatarPreview) {
              avatarPreview.innerHTML = pendingAdminClientAvatar
                ? `<div class="app-avatar-preview"><img src="${escapeHtml(mediaUrl(pendingAdminClientAvatar))}" alt="Client avatar"></div>`
                : '<div class="app-empty">No profile photo uploaded yet.</div>';
            }
            renderProgramChecklist(client.purchasedProgramIds || []);
            if (summary) {
              summary.textContent = `${client.firstName} ${client.lastName} joined on ${client.joinedAt} and currently has ${client.purchasedProgramIds.length} assigned program(s).`;
            }
          });
        });
      }
    }

    bindAction(document.getElementById("client-add-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("client-new-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("admin-client-clear"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindField(avatarInput, "change", async () => {
      const file = avatarInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const media = await uploadMedia(file, "avatars", false);
        pendingAdminClientAvatar = media.url;
        if (avatarPreview) {
          avatarPreview.innerHTML = `<div class="app-avatar-preview"><img src="${escapeHtml(mediaUrl(media.url))}" alt="Client avatar"></div>`;
        }
        avatarInput.value = "";
        toast("Client profile photo uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-client-save"), async (event) => {
      event.preventDefault();
      const selectedPrograms = [...document.querySelectorAll(".admin-client-program-checkbox:checked")].map((checkbox) => checkbox.value);
      try {
        const result = await apiRequest("admin_client_save", {
          id: hiddenId?.value || null,
          firstName: document.getElementById("admin-client-first-name")?.value.trim(),
          lastName: document.getElementById("admin-client-last-name")?.value.trim(),
          email: document.getElementById("admin-client-email")?.value.trim(),
          phone: document.getElementById("admin-client-phone")?.value.trim(),
          plan: document.getElementById("admin-client-plan")?.value.trim(),
          progressScore: Number(document.getElementById("admin-client-progress")?.value || 0),
          workoutLocation: document.getElementById("admin-client-workout-location")?.value,
          preferredContact: document.getElementById("admin-client-contact")?.value,
          foodPreferences: document.getElementById("admin-client-food-preferences")?.value.trim(),
          hydrationGoal: "2.5L",
          sportNutritionGuide: "General Performance",
          supplementNotes: "",
          purchasedProgramIds: selectedPrograms,
          password: document.getElementById("admin-client-password")?.value.trim(),
          avatarUrl: pendingAdminClientAvatar,
          heightCm: document.getElementById("admin-client-height")?.value.trim(),
          currentWeight: document.getElementById("admin-client-weight")?.value.trim(),
          sportsPosition: document.getElementById("admin-client-position")?.value.trim(),
          trainingHistory: document.getElementById("admin-client-history")?.value.trim(),
          achievements: (document.getElementById("admin-client-achievements")?.value || "").split(",").map((item) => item.trim()).filter(Boolean),
          fitnessScores: Object.fromEntries(
            (document.getElementById("admin-client-fitness-scores")?.value || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => {
                const [key, value] = item.split(":");
                return [String(key || "").trim(), String(value || "").trim()];
              })
              .filter(([key]) => key)
          ),
          injuryNotes: document.getElementById("admin-client-injury-notes")?.value.trim(),
        });
        toast(result.message, "success");
        renderAdminClients();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderAdminSales() {
    if (!window.location.pathname.endsWith("/sales.html")) {
      return;
    }

    const orders = getState().orders;
    const leads = getState().leads;
    const clients = getState().users.filter((user) => user.role === "client");
    const stats = document.querySelectorAll(".grid4 .stat");
    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const physicalRevenue = orders.reduce((sum, order) => {
      const hasPhysical = (order.itemIds || []).some((id) => (findProduct(id)?.category || "") === "Physical" || (findProduct(id)?.category || "") === "Bundle");
      return sum + (hasPhysical ? Number(order.total || 0) : 0);
    }, 0);
    const conversion = leads.length ? Math.round((clients.length / leads.length) * 100) : 0;

    if (stats[0]) stats[0].querySelector("h2").textContent = money(revenue);
    if (stats[1]) stats[1].querySelector("h2").textContent = money(orders.length ? Math.round(revenue / orders.length) : 0);
    if (stats[2]) stats[2].querySelector("h2").textContent = `${revenue ? Math.round((physicalRevenue / revenue) * 100) : 0}%`;
    if (stats[3]) stats[3].querySelector("h2").textContent = `${conversion}%`;

    const sidebarTitle = document.getElementById("sales-sidebar-title");
    const sidebarCopy = document.getElementById("sales-sidebar-copy");
    if (sidebarTitle) sidebarTitle.textContent = orders.length ? `${money(revenue)} across ${orders.length} orders` : "No sales yet";
    if (sidebarCopy) sidebarCopy.textContent = `${clients.length} clients and ${leads.length} leads are currently stored in the system.`;

    const tbody = document.getElementById("admin-sales-body");
    if (tbody) {
      if (!orders.length) {
        renderEmptyRow(tbody, 4, "No transactions yet. Orders will populate this table automatically.");
      } else {
        tbody.innerHTML = orders
          .map(
            (order) => `
              <tr>
                <td>${escapeHtml(order.createdAt)}</td>
                <td>${escapeHtml(order.buyerName)}</td>
                <td>${escapeHtml(orderItemLabel(order))}</td>
                <td>${money(order.total)}</td>
              </tr>
            `
          )
          .join("");
      }
    }

    const totals = {};
    orders.forEach((order) => {
      const label = orderItemLabel(order);
      totals[label] = (totals[label] || 0) + Number(order.total || 0);
    });
    const topList = document.getElementById("admin-sales-top-list");
    if (topList) {
      const items = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const max = items.reduce((best, item) => Math.max(best, item[1]), 1);
      topList.innerHTML = items.length
        ? items
            .map(
              ([name, total]) => `
                <div class="item">
                  <div class="between"><strong>${escapeHtml(name)}</strong><span>${money(total)}</span></div>
                  <div class="kpi"><span style="width:${Math.max(12, Math.round((total / max) * 100))}%"></span></div>
                </div>
              `
            )
            .join("")
        : '<div class="app-empty">Top sellers will appear after your first few orders.</div>';
    }

    const categories = { Coaching: 0, "Physical Products": 0, "Digital Products": 0, "Bundles / Upsells": 0 };
    orders.forEach((order) => {
      if (!(order.itemIds || []).length) {
        return;
      }
      (order.itemIds || []).forEach((id) => {
        const product = findProduct(id);
        const program = findProgram(id);
        if (program) {
          categories.Coaching += Number(order.total || 0);
        } else if (product?.category === "Physical") {
          categories["Physical Products"] += Number(order.total || 0);
        } else if (product?.category === "Digital") {
          categories["Digital Products"] += Number(order.total || 0);
        } else {
          categories["Bundles / Upsells"] += Number(order.total || 0);
        }
      });
    });
    const breakdown = document.getElementById("admin-sales-breakdown");
    if (breakdown) {
      breakdown.innerHTML = Object.entries(categories)
        .map(([label, total]) => {
          const percent = revenue ? Math.round((total / revenue) * 100) : 0;
          return `<div class="item"><div class="between"><strong>${escapeHtml(label)}</strong><span>${percent}%</span></div><div class="kpi"><span style="width:${Math.max(8, percent)}%"></span></div></div>`;
        })
        .join("");
    }

    const insights = document.getElementById("admin-sales-insights");
    if (insights) {
      const items = [
        `You have ${leads.length} leads and ${clients.length} client account(s).`,
        `${orders.filter((order) => order.status === "Delivered").length} order(s) are already marked delivered.`,
        `${orders.filter((order) => order.status !== "Delivered").length} order(s) still need follow-through.`,
      ];
      insights.innerHTML = items.map((item) => `<div class="item"><strong>Insight</strong><div class="muted">${escapeHtml(item)}</div></div>`).join("");
    }
  }

  function renderAdminPrograms() {
    if (!window.location.pathname.endsWith("/programs.html")) {
      return;
    }

    const programs = getState().programs;
    const tbody = document.getElementById("admin-programs-body");
    const sidebarTitle = document.getElementById("program-sidebar-title");
    const sidebarCopy = document.getElementById("program-sidebar-copy");
    const note = document.getElementById("admin-program-note");
    const mediaInput = document.getElementById("admin-program-media-input");
    const mediaPreview = document.getElementById("admin-program-media-preview");
    const typeFilter = document.getElementById("admin-program-filter-type");
    const statusFilter = document.getElementById("admin-program-filter-status");

    function resetForm() {
      ["admin-program-id", "admin-program-name", "admin-program-price", "admin-program-description"].forEach((id) => setInputValue(id, ""));
      setInputValue("admin-program-type", "Digital");
      setInputValue("admin-program-status", "Active");
      pendingProgramMedia = [];
      if (mediaPreview) {
        mediaPreview.innerHTML = renderMediaPreview([]);
      }
      if (note) note.textContent = "Creating a new program or service.";
    }

    if (sidebarTitle) sidebarTitle.textContent = programs.length ? `${programs.length} programs saved` : "No programs yet";
    if (sidebarCopy) sidebarCopy.textContent = programs.length ? "Click a row to edit or duplicate an existing program." : "Add your first program, coaching offer, or upsell here.";

    if (tbody) {
      const selectedType = typeFilter?.value || "All";
      const selectedStatus = statusFilter?.value || "All";
      const filteredPrograms = programs.filter((program) => {
        return (selectedType === "All" || program.type === selectedType)
          && (selectedStatus === "All" || program.status === selectedStatus);
      });

      if (!filteredPrograms.length) {
        renderEmptyRow(tbody, 4, "No programs match the current filters.");
      } else {
        tbody.innerHTML = filteredPrograms
          .map(
            (program) => `
              <tr data-program-id="${escapeHtml(program.id)}" ${selectedAdminProgramId === program.id ? 'style="background:rgba(242,139,80,.08);"' : ''}>
                <td>${escapeHtml(program.name)}</td>
                <td>${money(program.price)}</td>
                <td>${escapeHtml(program.type)}</td>
                <td><span class="tag ${statusTone(program.status)}">${escapeHtml(program.status)}</span></td>
              </tr>
            `
          )
          .join("");
        tbody.querySelectorAll("[data-program-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const program = programs.find((entry) => entry.id === row.getAttribute("data-program-id"));
            if (!program) {
              return;
            }
            selectedAdminProgramId = program.id;
            setInputValue("admin-program-id", program.id);
            setInputValue("admin-program-name", program.name);
            setInputValue("admin-program-price", program.price);
            setInputValue("admin-program-type", program.type);
            setInputValue("admin-program-status", program.status);
            setInputValue("admin-program-description", program.description);
            pendingProgramMedia = [...(program.media || [])];
            if (mediaPreview) {
              mediaPreview.innerHTML = renderMediaPreview(pendingProgramMedia);
            }
            if (note) note.textContent = `Editing ${program.name}. Duplicate creates a draft copy.`;
            renderAdminPrograms();
          });
        });
      }
    }

    bindAction(document.getElementById("program-add-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("program-new-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindField(typeFilter, "change", renderAdminPrograms);
    bindField(statusFilter, "change", renderAdminPrograms);
    bindField(mediaInput, "change", async () => {
      const file = mediaInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        const media = await uploadMedia(file, "programs", true);
        pendingProgramMedia = [media];
        if (mediaPreview) {
          mediaPreview.innerHTML = renderMediaPreview(pendingProgramMedia);
        }
        mediaInput.value = "";
        toast("Program media uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-program-save"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_program_save", {
          id: document.getElementById("admin-program-id")?.value || null,
          name: document.getElementById("admin-program-name")?.value.trim(),
          price: Number(document.getElementById("admin-program-price")?.value || 0),
          type: document.getElementById("admin-program-type")?.value,
          status: document.getElementById("admin-program-status")?.value,
          description: document.getElementById("admin-program-description")?.value.trim(),
          media: pendingProgramMedia,
        });
        toast(result.message, "success");
        renderAdminPrograms();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-program-duplicate"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_program_duplicate", {
          name: document.getElementById("admin-program-name")?.value.trim(),
          price: Number(document.getElementById("admin-program-price")?.value || 0),
          type: document.getElementById("admin-program-type")?.value,
          description: document.getElementById("admin-program-description")?.value.trim(),
          media: pendingProgramMedia,
        });
        toast(result.message, "success");
        renderAdminPrograms();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderAdminProducts() {
    if (!window.location.pathname.endsWith("/products.html")) {
      return;
    }

    const products = getState().products;
    const stats = document.querySelectorAll(".grid4 .stat");
    const tbody = document.getElementById("admin-products-body");
    const sidebarTitle = document.getElementById("product-sidebar-title");
    const sidebarCopy = document.getElementById("product-sidebar-copy");
    const note = document.getElementById("admin-product-note");
    const mediaInput = document.getElementById("admin-product-media-input");
    const mediaPreview = document.getElementById("admin-product-media-preview");

    function resetForm() {
      ["admin-product-id", "admin-product-name", "admin-product-price", "admin-product-inventory", "admin-product-description"].forEach((id) => setInputValue(id, ""));
      setInputValue("admin-product-category", "Bundle");
      setInputValue("admin-product-visibility", "Public on website");
      setInputValue("admin-product-delivery", "Ship + email receipt");
      setInputValue("admin-product-status", "Live");
      pendingProductMedia = [];
      if (mediaPreview) {
        mediaPreview.innerHTML = renderMediaPreview([]);
      }
      if (note) note.textContent = "Creating a new product or bundle.";
    }

    const lowStock = products.filter((product) => product.inventory != null && product.inventory <= 5).length;
    const drafts = products.filter((product) => product.status === "Draft").length;
    const featured = products.filter((product) => product.status === "Featured").length;
    const live = products.filter((product) => product.status === "Live" || product.status === "Featured").length;
    if (stats[0]) stats[0].querySelector("h2").textContent = String(live);
    if (stats[1]) stats[1].querySelector("h2").textContent = String(lowStock);
    if (stats[2]) stats[2].querySelector("h2").textContent = String(drafts);
    if (stats[3]) stats[3].querySelector("h2").textContent = String(featured);

    if (sidebarTitle) sidebarTitle.textContent = products.length ? `${products.length} products saved` : "No products yet";
    if (sidebarCopy) sidebarCopy.textContent = products.length ? `${live} live, ${drafts} draft, ${lowStock} low-stock item(s).` : "Add physical products, digital offers, services, or bundles here.";

    if (tbody) {
      if (!products.length) {
        renderEmptyRow(tbody, 5, "No products have been added yet.");
      } else {
        tbody.innerHTML = products
          .map(
            (product) => `
              <tr data-product-id="${escapeHtml(product.id)}">
                <td>${escapeHtml(product.name)}</td>
                <td>${money(product.price)}</td>
                <td>${escapeHtml(product.category)}</td>
                <td>${escapeHtml(product.inventory == null ? "Unlimited" : String(product.inventory))}</td>
                <td><span class="tag ${statusTone(product.status)}">${escapeHtml(product.status)}</span></td>
              </tr>
            `
          )
          .join("");
        tbody.querySelectorAll("[data-product-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const product = products.find((entry) => entry.id === row.getAttribute("data-product-id"));
            if (!product) {
              return;
            }
            setInputValue("admin-product-id", product.id);
            setInputValue("admin-product-name", product.name);
            setInputValue("admin-product-price", product.price);
            setInputValue("admin-product-category", product.category);
            setInputValue("admin-product-inventory", product.inventory == null ? "" : product.inventory);
            setInputValue("admin-product-description", product.description);
            setInputValue("admin-product-visibility", product.visibility);
            setInputValue("admin-product-delivery", product.deliveryType);
            setInputValue("admin-product-status", product.status);
            pendingProductMedia = [...(product.media || [])];
            if (mediaPreview) {
              mediaPreview.innerHTML = renderMediaPreview(pendingProductMedia);
            }
            if (note) note.textContent = `Editing ${product.name}.`;
          });
        });
      }
    }

    const merchandising = document.getElementById("admin-product-merchandising");
    if (merchandising) {
      const publicProducts = products.filter((product) => product.visibility === "Public on website");
      const clientOnly = products.filter((product) => product.visibility === "Clients only");
      const privateOnly = products.filter((product) => product.visibility === "Private link only");
      merchandising.innerHTML = [
        { name: "Public offers", value: publicProducts.length, tone: "green" },
        { name: "Client-only offers", value: clientOnly.length, tone: "blue" },
        { name: "Private-link offers", value: privateOnly.length, tone: "yellow" },
      ]
        .map(
          (item) => `
            <div class="item flex">
              <div><strong>${escapeHtml(item.name)}</strong><div class="muted">${item.value} product(s)</div></div>
              <span class="tag ${item.tone}">${item.value}</span>
            </div>
          `
        )
        .join("");
    }

    const rules = document.getElementById("admin-product-rules");
    if (rules) {
      rules.innerHTML = [
        "Public on website items appear to visitors and clients.",
        "Client-only offers stay hidden from the public store.",
        "Private-link products can still be sold manually through orders.",
      ]
        .map((text) => `<div class="item"><strong>Catalog Rule</strong><div class="muted">${escapeHtml(text)}</div></div>`)
        .join("");
    }

    bindAction(document.getElementById("product-add-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("product-new-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindField(mediaInput, "change", async () => {
      const files = [...(mediaInput.files || [])];
      if (!files.length) {
        return;
      }
      try {
        for (const file of files) {
          const media = await uploadMedia(file, "products", true);
          pendingProductMedia = [...pendingProductMedia, media].slice(0, 4);
        }
        if (mediaPreview) {
          mediaPreview.innerHTML = renderMediaPreview(pendingProductMedia);
        }
        mediaInput.value = "";
        toast("Product media uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-product-save"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_product_save", {
          id: document.getElementById("admin-product-id")?.value || null,
          name: document.getElementById("admin-product-name")?.value.trim(),
          price: Number(document.getElementById("admin-product-price")?.value || 0),
          category: document.getElementById("admin-product-category")?.value,
          inventory: document.getElementById("admin-product-inventory")?.value.trim(),
          description: document.getElementById("admin-product-description")?.value.trim(),
          visibility: document.getElementById("admin-product-visibility")?.value,
          deliveryType: document.getElementById("admin-product-delivery")?.value,
          status: document.getElementById("admin-product-status")?.value,
          media: pendingProductMedia,
        });
        toast(result.message, "success");
        renderAdminProducts();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-product-duplicate"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_product_duplicate", {
          name: document.getElementById("admin-product-name")?.value.trim(),
          price: Number(document.getElementById("admin-product-price")?.value || 0),
          category: document.getElementById("admin-product-category")?.value,
          inventory: Number(document.getElementById("admin-product-inventory")?.value || 0),
          description: document.getElementById("admin-product-description")?.value.trim(),
          visibility: document.getElementById("admin-product-visibility")?.value,
          deliveryType: document.getElementById("admin-product-delivery")?.value,
          media: pendingProductMedia,
        });
        toast(result.message, "success");
        renderAdminProducts();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderAdminOrders() {
    if (!window.location.pathname.endsWith("/orders.html")) {
      return;
    }

    const orders = getState().orders;
    const stats = document.querySelectorAll(".grid4 .stat");
    const tbody = document.getElementById("admin-orders-body");
    const itemSelect = document.getElementById("admin-order-item");
    const sidebarTitle = document.getElementById("order-sidebar-title");
    const sidebarCopy = document.getElementById("order-sidebar-copy");

    function resetForm() {
      ["admin-order-id", "admin-order-buyer", "admin-order-total", "admin-order-tracking", "admin-order-notes"].forEach((id) => setInputValue(id, ""));
      setInputValue("admin-order-status", "Pending Payment");
      setInputValue("admin-order-delivery", "Courier delivery");
      if (itemSelect) {
        itemSelect.value = "";
      }
    }

    const awaitingAction = orders.filter((order) => order.status !== "Delivered").length;
    const packing = orders.filter((order) => order.status === "Packing").length;
    const delivered = orders.filter((order) => order.status === "Delivered").length;
    if (stats[0]) stats[0].querySelector("h2").textContent = String(orders.length);
    if (stats[1]) stats[1].querySelector("h2").textContent = String(awaitingAction);
    if (stats[2]) stats[2].querySelector("h2").textContent = String(packing);
    if (stats[3]) stats[3].querySelector("h2").textContent = String(delivered);

    if (sidebarTitle) sidebarTitle.textContent = orders.length ? `${orders.length} orders tracked` : "No orders yet";
    if (sidebarCopy) sidebarCopy.textContent = `${awaitingAction} order(s) still need action and ${delivered} have been completed.`;

    if (itemSelect) {
      const options = [
        '<option value="">No linked item</option>',
        ...getState().programs.map((program) => `<option value="${escapeHtml(program.id)}">${escapeHtml(`Program: ${program.name}`)}</option>`),
        ...getState().products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(`Product: ${product.name}`)}</option>`),
      ];
      itemSelect.innerHTML = options.join("");
    }

    if (tbody) {
      if (!orders.length) {
        renderEmptyRow(tbody, 5, "No orders have been saved yet.");
      } else {
        tbody.innerHTML = orders
          .map(
            (order) => `
              <tr data-order-id="${escapeHtml(order.id)}">
                <td>${escapeHtml(order.id)}</td>
                <td>${escapeHtml(order.buyerName)}</td>
                <td>${escapeHtml(orderItemLabel(order))}</td>
                <td>${money(order.total)}</td>
                <td><span class="tag ${statusTone(order.status)}">${escapeHtml(order.status)}</span></td>
              </tr>
            `
          )
          .join("");
        tbody.querySelectorAll("[data-order-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const order = orders.find((entry) => entry.id === row.getAttribute("data-order-id"));
            if (!order) {
              return;
            }
            setInputValue("admin-order-id", order.id);
            setInputValue("admin-order-buyer", order.buyerName);
            setInputValue("admin-order-total", order.total);
            setInputValue("admin-order-status", order.status);
            setInputValue("admin-order-delivery", order.deliveryMethod);
            setInputValue("admin-order-tracking", order.tracking);
            setInputValue("admin-order-notes", order.notes);
            if (itemSelect) {
              itemSelect.value = order.itemIds?.[0] || "";
            }
          });
        });
      }
    }

    const actions = document.getElementById("admin-order-actions");
    if (actions) {
      const blocks = [
        { title: "Pending payment", value: orders.filter((order) => order.status === "Pending Payment").length },
        { title: "Ready to fulfill", value: orders.filter((order) => order.status === "Paid / Unfulfilled" || order.status === "Packing").length },
        { title: "Booked coaching", value: orders.filter((order) => order.status === "Booked").length },
      ];
      actions.innerHTML = blocks
        .map(
          (block) => `
            <div class="item flex">
              <div><strong>${escapeHtml(block.title)}</strong><div class="muted">${block.value} order(s)</div></div>
              <span class="tag ${block.value ? "blue" : "green"}">${block.value}</span>
            </div>
          `
        )
        .join("");
    }

    const deliveryGuide = document.getElementById("admin-order-delivery-guide");
    if (deliveryGuide) {
      deliveryGuide.innerHTML = [
        "Use courier delivery or pickup for physical items.",
        "Digital email works well for guides, PDFs, and downloads.",
        "Manual fulfillment is useful for coaching and custom onboarding.",
      ]
        .map((text) => `<div class="item"><strong>Delivery Rule</strong><div class="muted">${escapeHtml(text)}</div></div>`)
        .join("");
    }

    bindAction(document.getElementById("order-add-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("order-new-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("admin-order-save"), async (event) => {
      event.preventDefault();
      try {
        const linkedItem = itemSelect?.value ? [itemSelect.value] : [];
        const result = await apiRequest("admin_order_save", {
          orderId: document.getElementById("admin-order-id")?.value.trim(),
          buyerName: document.getElementById("admin-order-buyer")?.value.trim(),
          total: Number(document.getElementById("admin-order-total")?.value || 0),
          status: document.getElementById("admin-order-status")?.value,
          deliveryMethod: document.getElementById("admin-order-delivery")?.value,
          tracking: document.getElementById("admin-order-tracking")?.value.trim(),
          notes: document.getElementById("admin-order-notes")?.value.trim(),
          itemIds: linkedItem,
        });
        toast(result.message, "success");
        renderAdminOrders();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    bindAction(document.getElementById("admin-order-receipt"), (event) => {
      event.preventDefault();
      toast("Receipt note recorded. Update the order notes if you want to store more detail.", "info");
    });
  }

  function renderAdminBookings() {
    if (!window.location.pathname.endsWith("/bookings.html")) {
      return;
    }

    const bookings = getState().bookings;
    const tbody = document.getElementById("admin-bookings-body");
    const sidebarTitle = document.getElementById("booking-sidebar-title");
    const sidebarCopy = document.getElementById("booking-sidebar-copy");
    const note = document.getElementById("admin-booking-note");
    const bookingId = document.getElementById("admin-booking-id");

    function resetForm() {
      ["admin-booking-id", "admin-booking-date", "admin-booking-time", "admin-booking-seats", "admin-booking-goal", "admin-booking-notes"].forEach((id) => setInputValue(id, ""));
      setInputValue("admin-booking-type", "1-on-1 Coaching");
      setInputValue("admin-booking-status", "Open");
      setInputValue("admin-booking-format", "Video Call");
      if (note) note.textContent = "Creating a new availability slot.";
    }

    if (sidebarTitle) sidebarTitle.textContent = `${bookings.length} booking(s) • ${getState().availability.length} open slot(s)`;
    if (sidebarCopy) sidebarCopy.textContent = "Select an existing booking to update it, or leave the form clear to create a new slot.";

    if (tbody) {
      const rows = [
        ...bookings.map((booking) => ({ kind: "booking", id: booking.id, primary: booking.clientName, session: booking.session, date: `${booking.dateLabel} • ${booking.time}`, status: booking.status })),
        ...getState().availability.map((slot) => ({ kind: "slot", id: slot.id, primary: "Open Slot", session: slot.type, date: `${slot.date} • ${slot.time}`, status: "Open", seats: slot.seats })),
      ];
      if (!rows.length) {
        renderEmptyRow(tbody, 4, "No bookings or slots yet.");
      } else {
        tbody.innerHTML = rows
          .map(
            (row) => `
              <tr data-kind="${escapeHtml(row.kind)}" data-id="${escapeHtml(row.id)}">
                <td>${escapeHtml(row.primary)}</td>
                <td>${escapeHtml(row.session)}</td>
                <td>${escapeHtml(row.date)}</td>
                <td><span class="tag ${statusTone(row.status)}">${escapeHtml(row.status)}</span></td>
              </tr>
            `
          )
          .join("");
        tbody.querySelectorAll("[data-kind][data-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const kind = row.getAttribute("data-kind");
            const id = row.getAttribute("data-id");
            if (kind === "booking") {
              const booking = bookings.find((entry) => entry.id === id);
              if (!booking) {
                return;
              }
              setInputValue("admin-booking-id", booking.id);
              setInputValue("admin-booking-date", booking.dateLabel);
              setInputValue("admin-booking-time", booking.time);
              setInputValue("admin-booking-seats", "");
              setInputValue("admin-booking-type", booking.session);
              setInputValue("admin-booking-status", booking.status);
              setInputValue("admin-booking-format", booking.format);
              setInputValue("admin-booking-goal", booking.goal);
              setInputValue("admin-booking-notes", booking.notes);
              if (note) note.textContent = `Editing booking for ${booking.clientName}. Save will update this booking.`;
            } else {
              const slot = getState().availability.find((entry) => entry.id === id);
              if (!slot) {
                return;
              }
              setInputValue("admin-booking-id", "");
              setInputValue("admin-booking-date", slot.date);
              setInputValue("admin-booking-time", slot.time);
              setInputValue("admin-booking-seats", slot.seats);
              setInputValue("admin-booking-type", slot.type);
              setInputValue("admin-booking-status", "Open");
              setInputValue("admin-booking-format", "Video Call");
              setInputValue("admin-booking-goal", "");
              setInputValue("admin-booking-notes", "");
              if (note) note.textContent = "This is an open slot. Save creates new slots only when no booking is selected.";
            }
          });
        });
      }
    }

    bindAction(document.getElementById("booking-add-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("booking-new-slot-button"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("admin-booking-clear"), (event) => {
      event.preventDefault();
      resetForm();
    });
    bindAction(document.getElementById("admin-booking-save"), async (event) => {
      event.preventDefault();
      try {
        const currentBookingId = bookingId?.value.trim();
        if (currentBookingId) {
          const result = await apiRequest("admin_booking_save", {
            id: currentBookingId,
            status: document.getElementById("admin-booking-status")?.value,
            goal: document.getElementById("admin-booking-goal")?.value.trim(),
            notes: document.getElementById("admin-booking-notes")?.value.trim(),
            format: document.getElementById("admin-booking-format")?.value,
          });
          toast(result.message, "success");
        } else {
          const result = await apiRequest("admin_slot_create", {
            date: document.getElementById("admin-booking-date")?.value.trim(),
            type: document.getElementById("admin-booking-type")?.value,
            time: document.getElementById("admin-booking-time")?.value.trim(),
            seats: Number(document.getElementById("admin-booking-seats")?.value || 1),
          });
          toast(result.message, "success");
        }
        renderAdminBookings();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderAdminSettings() {
    if (!window.location.pathname.endsWith("/settings.html")) {
      return;
    }

    const site = getState().site;
    setInputValue("admin-settings-brand", site.brandName || "");
    setInputValue("admin-settings-email", site.businessEmail || "");
    setInputValue("admin-settings-phone", site.phone || "");
    setInputValue("admin-settings-instagram-label", site.instagramLabel || "");
    setInputValue("admin-settings-instagram-url", site.instagramUrl || "");
    setInputValue("admin-settings-tiktok-label", site.tiktokLabel || "");
    setInputValue("admin-settings-tiktok-url", site.tiktokUrl || "");

    const sidebarTitle = document.getElementById("settings-sidebar-title");
    const sidebarCopy = document.getElementById("settings-sidebar-copy");
    const summary = document.getElementById("admin-settings-summary");
    if (sidebarTitle) sidebarTitle.textContent = site.brandName || "Configure your brand";
    if (sidebarCopy) sidebarCopy.textContent = site.businessEmail || "Add contact details so the public site shows your real business identity.";
    if (summary) {
      summary.innerHTML = [
        { label: "Website Brand", value: site.brandName || "Not set" },
        { label: "Public Email", value: site.businessEmail || "Not set" },
        { label: "Primary Phone", value: site.phone || "Not set" },
      ]
        .map((entry) => `<div class="item"><strong>${escapeHtml(entry.label)}</strong><div class="muted">${escapeHtml(entry.value)}</div></div>`)
        .join("");
    }

    bindAction(document.getElementById("admin-settings-save"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_settings_update", {
          brandName: document.getElementById("admin-settings-brand")?.value.trim(),
          businessEmail: document.getElementById("admin-settings-email")?.value.trim(),
          phone: document.getElementById("admin-settings-phone")?.value.trim(),
          instagramLabel: document.getElementById("admin-settings-instagram-label")?.value.trim(),
          instagramUrl: document.getElementById("admin-settings-instagram-url")?.value.trim(),
          tiktokLabel: document.getElementById("admin-settings-tiktok-label")?.value.trim(),
          tiktokUrl: document.getElementById("admin-settings-tiktok-url")?.value.trim(),
        });
        updateBrandElements();
        toast(result.message, "success");
        renderAdminSettings();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function renderAdminContent() {
    if (!window.location.pathname.endsWith("/content.html")) {
      return;
    }

    const content = getState().content;
    setInputValue("admin-content-hero", content.heroHeadline || "");
    setInputValue("admin-content-cta", content.mainCta || "");
    setInputValue("admin-content-summary", content.aboutSummary || "");
    setInputValue("admin-content-support", content.aboutSupport || "");

    const sidebarTitle = document.getElementById("content-sidebar-title");
    const sidebarCopy = document.getElementById("content-sidebar-copy");
    const summaryCards = document.getElementById("admin-content-summary-cards");
    const heroMediaInput = document.getElementById("admin-content-hero-media-input");
    const heroMediaPreview = document.getElementById("admin-content-hero-media-preview");
    pendingHeroMedia = content.heroMediaUrl ? { url: content.heroMediaUrl, type: content.heroMediaType || "image", name: "Homepage hero" } : null;
    if (heroMediaPreview) {
      heroMediaPreview.innerHTML = renderSingleMediaPreview(pendingHeroMedia);
    }
    if (sidebarTitle) sidebarTitle.textContent = content.heroHeadline || "Website copy";
    if (sidebarCopy) sidebarCopy.textContent = "Changes here update the public homepage immediately after saving.";
    if (summaryCards) {
      summaryCards.innerHTML = [
        { label: "Hero Headline", value: content.heroHeadline || "Not set" },
        { label: "Main CTA", value: content.mainCta || "Not set" },
        { label: "About Summary", value: content.aboutSummary || "Not set" },
        { label: "Hero Media", value: content.heroMediaUrl ? content.heroMediaType || "image" : "Not set" },
      ]
        .map((entry) => `<div class="item"><strong>${escapeHtml(entry.label)}</strong><div class="muted">${escapeHtml(entry.value)}</div></div>`)
        .join("");
    }

    bindField(heroMediaInput, "change", async () => {
      const file = heroMediaInput.files?.[0];
      if (!file) {
        return;
      }
      try {
        pendingHeroMedia = await uploadMedia(file, "content", true);
        if (heroMediaPreview) {
          heroMediaPreview.innerHTML = renderSingleMediaPreview(pendingHeroMedia);
        }
        heroMediaInput.value = "";
        toast("Homepage hero media uploaded.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    bindAction(document.getElementById("admin-content-save"), async (event) => {
      event.preventDefault();
      try {
        const result = await apiRequest("admin_content_update", {
          heroHeadline: document.getElementById("admin-content-hero")?.value.trim(),
          mainCta: document.getElementById("admin-content-cta")?.value.trim(),
          aboutSummary: document.getElementById("admin-content-summary")?.value.trim(),
          aboutSupport: document.getElementById("admin-content-support")?.value.trim(),
          heroMediaUrl: pendingHeroMedia?.url || "",
          heroMediaType: pendingHeroMedia?.type || "",
        });
        toast(result.message, "success");
        renderAdminContent();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  function initAuthPages() {
    const user = currentUser();
    if (user) {
      document.querySelectorAll(".note").forEach((note) => {
        note.textContent = `You are currently signed in as ${user.email}. Submitting this form will switch the active session to the account you enter here.`;
      });
    }

    const loginForm = document.getElementById("loginForm");
    const rememberCheckbox = document.getElementById("remember-checkbox");
    const savedEmail = window.localStorage.getItem("fitfunnel_remember_email");
    if (savedEmail) {
      const emailInput = document.getElementById("email");
      if (emailInput) {
        emailInput.value = savedEmail;
      }
      if (rememberCheckbox) {
        rememberCheckbox.checked = true;
      }
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (rememberCheckbox?.checked) {
          window.localStorage.setItem("fitfunnel_remember_email", document.getElementById("email").value.trim());
        } else {
          window.localStorage.removeItem("fitfunnel_remember_email");
        }
        try {
          const result = await apiRequest("login", {
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value.trim(),
          });
          toast(result.message, "success");
          const user = currentUser();
          redirect(user && user.role === "admin" ? "../admin/index.html" : "../client/index.html");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const firstName = document.getElementById("first-name").value.trim();
        const lastName = document.getElementById("last-name").value.trim();
        const email = document.getElementById("register-email").value.trim();
        const password = document.getElementById("register-password").value.trim();
        const confirm = document.getElementById("confirm-password").value.trim();
        const terms = registerForm.querySelector('input[type="checkbox"]');

        if (!firstName || !lastName || !email || !password || !confirm) {
          toast("Please complete every field.", "error");
          return;
        }
        if (password !== confirm) {
          toast("Passwords do not match.", "error");
          return;
        }
        if (terms && !terms.checked) {
          toast("Please agree to the terms to continue.", "error");
          return;
        }

        try {
          const result = await apiRequest("register", {
            firstName,
            lastName,
            email,
            password,
          });
          toast(result.message, "success");
          redirect("../client/index.html");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }

    const passwordResetForm = document.getElementById("passwordResetForm");
    if (passwordResetForm) {
      passwordResetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = document.getElementById("reset-email").value.trim();
        const password = document.getElementById("new-password").value.trim();
        const confirm = document.getElementById("confirm-new-password").value.trim();
        if (!email || !password || !confirm) {
          toast("Please complete every field.", "error");
          return;
        }
        if (password !== confirm) {
          toast("Passwords do not match.", "error");
          return;
        }
        try {
          const tokenInput = document.getElementById("reset-token");
          if (!tokenInput || !tokenInput.value.trim()) {
            const result = await apiRequest("password_reset_request", { email });
            if (result.devResetToken && tokenInput) {
              tokenInput.value = result.devResetToken;
              toast("Local reset code generated. Submit once more to update the password.", "info");
              return;
            }
            toast(result.message, "success");
            return;
          }
          const result = await apiRequest("password_reset_confirm", {
            email,
            token: tokenInput.value.trim(),
            password,
          });
          setFlash(result.message);
          redirect("login.html");
        } catch (error) {
          toast(error.message, "error");
        }
      });
    }
  }

  function initClientPages() {
    const user = requireRole("client");
    if (!user) {
      return;
    }

    renderClientShell(user);
    renderClientDashboard(user);
    renderClientProgramsPage(user);
    renderClientBookingsPage(user);
    renderClientMessagesPage(user);
    renderClientProgressPage(user);
    renderClientSettingsPage(user);
    renderClientNutritionPage(user);
    renderStorePage(user);
    renderClientOrdersPage(user);
    enhanceTables();
  }

  function initAdminPages() {
    const user = requireRole("admin");
    if (!user) {
      return;
    }

    renderAdminDashboard();
    renderAdminClients();
    renderAdminSales();
    renderAdminPrograms();
    renderAdminProducts();
    renderAdminOrders();
    renderAdminBookings();
    renderAdminSettings();
    renderAdminContent();
    enhanceTables();
  }

  async function initLogoutPage() {
    try {
      await apiRequest("logout", {});
    } finally {
      setFlash("You have been logged out successfully.");
      redirect("../index.html");
    }
  }

  async function bootstrap() {
    injectUiStyles();

    try {
      await loadState();
    } catch (error) {
      toast("The backend is not reachable yet. Start Apache/PHP and reload.", "error");
      return;
    }

    updateBrandElements();
    initSearch();
    initAccessibilityEnhancements();
    activateFallbackActions();

    const flash = popFlash();
    if (flash) {
      toast(flash, "info");
    }

    if (isLogoutPage()) {
      await initLogoutPage();
      return;
    }

    if (isAuthPage()) {
      initAuthPages();
      return;
    }

    if (isClientPage()) {
      initClientPages();
      return;
    }

    if (isAdminPage()) {
      initAdminPages();
      return;
    }

    await renderLandingPage();
  }

  bootstrap();
})();
