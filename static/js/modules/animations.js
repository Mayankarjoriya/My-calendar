/* ======================================================================
   CHRONOS PLANNER — MODULE: HIGH-END ANIMATION & DRAG-AND-DROP ENGINE
   Powered by GSAP, SortableJS, and Canvas Confetti
   ====================================================================== */

const FX = {
  // ── Confetti Burst for Task Completion ──
  fireConfetti(x = 0.5, y = 0.5) {
    if (typeof confetti !== 'function') return;
    confetti({
      particleCount: 45,
      spread: 60,
      origin: { x, y },
      colors: ['#f43f5e', '#6366f1', '#f59e0b', '#10b981', '#a855f7'],
      disableForReducedMotion: true,
      scalar: 0.85
    });
  },

  // ── GSAP Stagger Entrance for Dashboard Months ──
  animateDashboardEntrance() {
    if (typeof gsap === 'undefined') return;
    gsap.from('#monthsGrid > div', {
      duration: 0.45,
      y: 18,
      opacity: 0,
      stagger: 0.035,
      ease: 'power2.out',
      clearProps: 'transform,opacity'
    });
  },

  // ── GSAP Modal Reveal with Spring Physics ──
  revealModal(modalBoxEl) {
    if (typeof gsap === 'undefined' || !modalBoxEl) return;
    gsap.fromTo(modalBoxEl,
      { scale: 0.94, y: 15, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.28, ease: 'back.out(1.4)' }
    );
  },

  // ── Interactive Cursor Glass Spotlight ──
  initGlassSpotlight() {
    document.addEventListener('mousemove', (e) => {
      const cards = document.querySelectorAll('.card-hover, .glass, .day-cell');
      // Update ambient glow subtly based on cursor position
      const xRatio = (e.clientX / window.innerWidth) * 100;
      const yRatio = (e.clientY / window.innerHeight) * 100;
      const mesh = document.querySelector('.ambient-glow-mesh');
      if (mesh) {
        mesh.style.backgroundPosition = `${xRatio}% ${yRatio}%`;
      }
    });
  },

  // ── SortableJS Drag-and-Drop for Task Reordering ──
  initSortableContainer(containerEl, bucketKey, onReorderCallback) {
    if (typeof Sortable === 'undefined' || !containerEl) return;
    
    // Destroy previous instance if attached
    if (containerEl._sortableInstance) {
      containerEl._sortableInstance.destroy();
    }

    containerEl._sortableInstance = new Sortable(containerEl, {
      animation: 200,
      handle: '.drag-handle, label, .task-drag-grip',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: function(evt) {
        if (typeof onReorderCallback === 'function') {
          onReorderCallback(bucketKey, evt.oldIndex, evt.newIndex);
        }
      }
    });
  }
};
