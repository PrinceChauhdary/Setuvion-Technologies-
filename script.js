const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");

menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  navigation.classList.toggle("open", !isOpen);
});

navigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    navigation.classList.remove("open");
  });
});

const previewTabs = [...document.querySelectorAll(".demo-tab")];
const previewPanels = [...document.querySelectorAll(".demo-view")];
previewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const view = tab.dataset.view;
    previewTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    previewPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === view));
  });
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

document.querySelectorAll("form[data-inquiry-form], #contact-form").forEach((form) => {
  const status = form.querySelector("[data-form-status]") || form.querySelector("#form-status");
  const button = form.querySelector('button[type="submit"]');
  if (!status || !button) return;
  const originalButton = button.innerHTML;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    button.textContent = "Sending…";
    status.textContent = "Sending your inquiry to this website…";
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.consent = formData.get("consent") === "on";
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not send the inquiry.");
      form.reset();
      status.textContent = form.dataset.successMessage || "Thanks. Your inquiry was received and stored for the Setuvion team.";
    } catch (error) {
      status.textContent = error.message || "The server could not be reached. Please try again later.";
    } finally {
      button.disabled = false;
      button.innerHTML = originalButton;
    }
  });
});
