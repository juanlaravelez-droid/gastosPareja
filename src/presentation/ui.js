const LAST_TIP_KEY = "billetera-last-tip-index-v1";
const THEME_STORAGE_KEY = "billetera-theme-v1";
const TIPS = [
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "Las mejores vacaciones no son las más caras, sino las que se disfrutan con la tranquilidad de que ya están pagas.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "Ahorrar juntos hoy es el boleto para la tranquilidad y las aventuras de mañana.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "No estamos guardando dinero; estamos financiando recuerdos que durarán toda la vida.",
  },
  {
    category: "METAS Y FUTURO COMPARTIDO",
    quote: "El amor sueña el destino, pero la disciplina financiera pavimenta la carretera para llegar a él.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Una pareja que habla de finanzas sin tabúes es un equipo imparable.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "El éxito financiero en pareja no se mide en números individuales, sino en las metas que logran tachar juntos.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Dos visiones alineadas convierten cualquier meta económica en un logro inevitable.",
  },
  {
    category: "TRABAJO EN EQUIPO Y SINCRONÍA",
    quote: "Cuando la meta es compartida, el esfuerzo deja de ser una carga y se convierte en una victoria diaria de ambos.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "Decirle 'no' a un gasto impulsivo hoy es decirle un rotundo 'sí' a su proyecto de vida.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "La estabilidad económica no llega por suerte; se construye con una conversación sincera y una decisión a la vez.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "No se trata de privarse de la vida, sino de aprender a disfrutar de lo importante sin hipotecar la paz mental.",
  },
  {
    category: "HÁBITOS Y MENTALIDAD",
    quote: "El mejor regalo que pueden darse como pareja es la libertad financiera.",
  },
];

export function createUi(storage) {
  let notificationTimer;

  function notify(message, isError = false) {
    const notification = document.querySelector("#notification");
    window.clearTimeout(notificationTimer);
    notification.textContent = message;
    notification.classList.toggle("error", isError);
    notification.hidden = false;

    if (!isError) {
      notificationTimer = window.setTimeout(() => {
        notification.hidden = true;
      }, 3000);
    }
  }

  function setTheme(theme, persist = false) {
    const selectedTheme = theme === "rosa" ? "rosa" : "claro";
    document.documentElement.dataset.theme = selectedTheme;
    const button = document.querySelector("#theme-toggle");
    const isRose = selectedTheme === "rosa";
    button.textContent = isRose ? "Tema claro" : "Tema rosa";
    button.setAttribute("aria-pressed", String(isRose));
    button.setAttribute("aria-label", `Cambiar al tema ${isRose ? "claro" : "pastel rosa"}`);

    if (persist) {
      try {
        storage.setItem(THEME_STORAGE_KEY, selectedTheme);
      } catch (error) {
        console.error("No se pudo guardar la preferencia de tema.", error);
        notify("No se pudo guardar el tema; se conservará hasta cerrar esta página.", true);
      }
    }
  }

  function initializeTheme() {
    let savedTheme = "claro";
    try {
      savedTheme = storage.getItem(THEME_STORAGE_KEY) || "claro";
    } catch (error) {
      console.error("No se pudo leer la preferencia de tema.", error);
    }
    setTheme(savedTheme);
  }

  function showView(viewId) {
    ["config-view", "auth-view", "setup-view", "dashboard"].forEach((id) => {
      document.querySelector(`#${id}`).hidden = id !== viewId;
    });
  }

  function showFormMessage(selector, message, isError = false) {
    const element = document.querySelector(selector);
    element.textContent = message;
    element.classList.toggle("error-text", isError);
  }

  function showRandomTip() {
    let previousIndex = -1;
    try {
      const savedIndex = storage.getItem(LAST_TIP_KEY);
      if (savedIndex !== null) previousIndex = Number(savedIndex);
    } catch (error) {
      console.error("No se pudo leer el último tip mostrado.", error);
    }

    let index = Math.floor(Math.random() * TIPS.length);
    if (TIPS.length > 1 && index === previousIndex) {
      index = (index + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length;
    }

    document.querySelector("#tip-category").textContent = TIPS[index].category;
    document.querySelector("#tip-quote").textContent = `“${TIPS[index].quote}”`;
    try {
      storage.setItem(LAST_TIP_KEY, String(index));
    } catch (error) {
      console.error("No se pudo guardar el último tip mostrado.", error);
    }
  }

  return { initializeTheme, notify, setTheme, showFormMessage, showRandomTip, showView };
}
