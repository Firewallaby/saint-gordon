/* Touch/swipe, keyboard and button navigation. No forced motion or audio. */
window.SaintCarousel = {
  mount(host) {
    host.classList.add("works-carousel");
    host.setAttribute("tabindex", "0");
    host.setAttribute(
      "aria-label",
      "All works. Scroll or use the arrow buttons to browse.",
    );
    const previous = document.querySelector("[data-carousel-prev]");
    const next = document.querySelector("[data-carousel-next]");
    const status = document.querySelector("[data-carousel-status]");
    function move(direction) {
      const card = host.querySelector(".card");
      if (!card) return;
      host.scrollBy({
        left: direction * (card.getBoundingClientRect().width + 24),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
    function update() {
      previous.disabled = host.scrollLeft <= 2;
      next.disabled =
        host.scrollLeft + host.clientWidth >= host.scrollWidth - 2;
      status.textContent = host.querySelectorAll(".card").length + " WORKS";
    }
    previous.onclick = () => move(-1);
    next.onclick = () => move(1);
    host.onkeydown = (event) => {
      if (event.target !== host) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    host.onscroll = update;
    if (host._resizeObserver) host._resizeObserver.disconnect();
    host._resizeObserver = new ResizeObserver(update);
    host._resizeObserver.observe(host);
    update();
  },
};
