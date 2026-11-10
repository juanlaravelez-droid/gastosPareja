/**
 * GastosPareja - Navigation & Modal Controller
 * Enrutamiento accesible sin dependencias (Single Page Application)
 */

export class AppNavigation {
  constructor() {
    this.tabs = document.querySelectorAll('.nav-item[role="tab"]');
    this.panels = document.querySelectorAll('.view-panel[role="tabpanel"]');
    this.fabButton = document.querySelector('#fab-add-expense');
    this.modal = document.querySelector('#modal-expense');
    this.modalCloseBtn = document.querySelector('#modal-close');
    this.currentViewId = null;

    this.init();
  }

  init() {
    this.bindTabEvents();
    this.bindFabModalEvents();
    this.bindKeyboardNavigation();
    this.handleInitialRoute();
  }

  /**
   * Cambia la vista activa gestionando clases, atributos ARIA y visibilidad
   * @param {string} targetViewId - ID de la vista a activar (ej: 'view-balance')
   */
  switchView(targetViewId) {
    if (!targetViewId || targetViewId === this.currentViewId) return;

    // 1. Actualizar estado de las pestañas
    this.tabs.forEach((tab) => {
      const isTarget = tab.dataset.target === targetViewId;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', String(isTarget));
      tab.setAttribute('aria-current', isTarget ? 'page' : 'false');
    });

    // 2. Alternar paneles de contenido
    this.panels.forEach((panel) => {
      const isTarget = panel.id === targetViewId;
      panel.hidden = !isTarget;
    });

    this.currentViewId = targetViewId;

    // 3. Sincronizar URL hash sin recargar la página
    if (window.location.hash !== `#${targetViewId}`) {
      window.history.pushState(null, '', `#${targetViewId}`);
    }

    // 4. Emitir evento personalizado para integración con otros módulos
    window.dispatchEvent(
      new CustomEvent('viewchange', { detail: { viewId: targetViewId } })
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bindTabEvents() {
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        const targetViewId = tab.dataset.target;
        this.switchView(targetViewId);
      });
    });

    document.querySelectorAll('[data-navigate]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const target = link.dataset.navigate;
        if (target) this.switchView(target);
      });
    });

    window.addEventListener('popstate', () => {
      this.handleInitialRoute();
    });
  }

  bindKeyboardNavigation() {
    const tabList = document.querySelector('[role="tablist"]');
    if (!tabList) return;

    tabList.addEventListener('keydown', (event) => {
      const tabsArray = Array.from(this.tabs);
      const currentIndex = tabsArray.findIndex((tab) => tab === document.activeElement);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabsArray.length;
        event.preventDefault();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabsArray.length) % tabsArray.length;
        event.preventDefault();
      } else if (event.key === 'Home') {
        nextIndex = 0;
        event.preventDefault();
      } else if (event.key === 'End') {
        nextIndex = tabsArray.length - 1;
        event.preventDefault();
      }

      if (nextIndex !== currentIndex) {
        const nextTab = tabsArray[nextIndex];
        this.switchView(nextTab.dataset.target);
        nextTab.focus();
      }
    });
  }

  bindFabModalEvents() {
    if (this.fabButton) {
      this.fabButton.addEventListener('click', () => this.openExpenseModal());
    }

    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => this.closeExpenseModal());
    }

    document.querySelectorAll('[data-open-expense-modal]').forEach((btn) => {
      btn.addEventListener('click', () => this.openExpenseModal());
    });

    // Control de tabs dentro del modal (Gasto vs Aporte)
    if (this.modal) {
      this.modal.querySelectorAll('[data-modal-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          const tabType = tabBtn.dataset.modalTab;
          this.modal.querySelectorAll('[data-modal-tab]').forEach((button) => {
            const isSelected = button === tabBtn;
            button.classList.toggle('active', isSelected);
            button.setAttribute('aria-selected', String(isSelected));
          });
          const paneGasto = this.modal.querySelector('#modal-pane-gasto');
          const paneAporte = this.modal.querySelector('#modal-pane-aporte');
          if (paneGasto) paneGasto.hidden = tabType !== 'gasto';
          if (paneAporte) paneAporte.hidden = tabType !== 'aporte';
        });
      });

      this.modal.addEventListener('pointerdown', (event) => {
        if (event.target === this.modal) {
          this.closeExpenseModal();
        }
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modal && !this.modal.hidden) {
        this.closeExpenseModal();
      }
    });
  }

  openExpenseModal(presetTab = 'gasto') {
    if (!this.modal) return;
    this.modal.hidden = false;

    if (presetTab) {
      const tabBtn = this.modal.querySelector(`[data-modal-tab="${presetTab}"]`);
      if (tabBtn) tabBtn.click();
    }

    const firstInput = this.modal.querySelector('input:not([type="hidden"])');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 60);
    }
  }

  closeExpenseModal() {
    if (!this.modal) return;
    this.modal.hidden = true;
    if (this.fabButton) {
      this.fabButton.focus();
    }
  }

  handleInitialRoute() {
    const hash = window.location.hash.replace('#', '');
    const validView = Array.from(this.panels).find((panel) => panel.id === hash);
    this.switchView(validView ? validView.id : 'view-balance');
  }
}
