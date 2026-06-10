const nav = document.querySelector(".nav");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector("[data-nav-links]");

navToggle.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("is-open");
  nav.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Cerrar menú" : "Abrir menú");
});

navLinks.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    const target = event.target.getAttribute("href");

    if (target === "#top") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    navLinks.classList.remove("is-open");
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir menú");
  }
});

const canvas = document.getElementById("dataCanvas");
const ctx = canvas.getContext("2d");
const points = Array.from({ length: 28 }, (_, index) => ({
  x: 42 + (index % 7) * 76,
  y: 72 + Math.floor(index / 7) * 66,
  radius: 3 + (index % 4),
  phase: index * 0.42,
}));

function drawDataField(time = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  points.forEach((point, index) => {
    const pulse = Math.sin(time / 650 + point.phase) * 10;
    const x = point.x + Math.cos(time / 1100 + point.phase) * 8;
    const y = point.y + pulse;

    for (let next = index + 1; next < points.length; next += 1) {
      const target = points[next];
      const distance = Math.hypot(target.x - point.x, target.y - point.y);

      if (distance < 118) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          target.x + Math.cos(time / 1100 + target.phase) * 8,
          target.y + Math.sin(time / 650 + target.phase) * 10
        );
        ctx.strokeStyle = "rgba(31, 102, 209, 0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(x, y, point.radius, 0, Math.PI * 2);
    ctx.fillStyle = index % 3 === 0 ? "#21a7b8" : index % 3 === 1 ? "#1f66d1" : "#4fac72";
    ctx.fill();
  });

  ctx.beginPath();
  ctx.moveTo(56, 252);
  [120, 196, 272, 348, 424, 500].forEach((x, index) => {
    const y = 242 - index * 18 + Math.sin(time / 520 + index) * 14;
    ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#e2b84b";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  requestAnimationFrame(drawDataField);
}

requestAnimationFrame(drawDataField);

const counters = document.querySelectorAll("[data-count]");
const counterObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const element = entry.target;
      const target = Number(element.dataset.count);
      const duration = 1200;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(target * eased);

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      }

      requestAnimationFrame(tick);
      observer.unobserve(element);
    });
  },
  { threshold: 0.5 }
);

counters.forEach((counter) => counterObserver.observe(counter));

const contactForm = document.getElementById("contactForm");
const statusMessage = contactForm.querySelector(".form-status");
const whatsappNumber = "573207712588";

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!contactForm.checkValidity()) {
    statusMessage.textContent = "Completa los campos requeridos para continuar.";
    statusMessage.classList.add("error");
    contactForm.reportValidity();
    return;
  }

  const formData = new FormData(contactForm);
  const name = formData.get("name").toString().trim();
  const firstName = name.split(" ")[0];
  const email = formData.get("email").toString().trim();
  const service = formData.get("service").toString().trim();
  const message = formData.get("message").toString().trim();
  const composedMessage = [
    "Hola DataKore, quiero iniciar un proyecto.",
    "",
    `Nombre: ${name}`,
    `Correo: ${email}`,
    `Servicio de interés: ${service}`,
    `Mensaje: ${message}`,
  ].join("\n");
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(composedMessage)}`;

  window.open(whatsappUrl, "_blank", "noopener");

  statusMessage.textContent = `Gracias, ${firstName}. Se abrió WhatsApp con tu mensaje preparado.`;
  statusMessage.classList.remove("error");
  contactForm.reset();
});
