"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
const sections = [
  { label: "INICIO", items: [["Resumen", "/dashboard", "◫"]] },
  {
    label: "OPERACIÓN",
    items: [
      ["Monitor operacional", "/monitor", "◉"],
      ["Conversaciones", "/conversations", "☷"],
    ],
  },
  {
    label: "ANÁLISIS",
    items: [
      ["Reportes", "/reports", "▥"],
      ["Categorías", "/categories", "◇"],
    ],
  },
  {
    label: "SUPERVISIÓN",
    items: [
      ["Alertas técnicas", "/alerts", "△"],
      ["Agentes observados", "/agents", "♧"],
      ["Grupos detectados", "/groups", "▦"],
    ],
  },
  {
    label: "CONTROL",
    items: [
      ["Auditoría de eventos", "/audit", "≡"],
      ["Eventos técnicos", "/technical/events", "⌘"],
    ],
  },
  {
    label: "EVOLUCIÓN",
    items: [
      ["Inteligencia artificial", "/ai", "✧"],
      ["Protocolos", "/protocols", "□"],
    ],
  },
];
export function OperationsShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="operations-shell">
      <aside className={"sidebar " + (open ? "is-open" : "")}>
        <a className="brand" href="/dashboard">
          <span className="brand-symbol">q</span>
          <span>
            quédate<small>Centro Operacional</small>
          </span>
        </a>
        <div className="workspace-label">OBSERVACIÓN Y SUPERVISIÓN</div>
        <nav>
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <p>{section.label}</p>
              {section.items.map(([label, href, icon]) => (
                <a
                  key={href}
                  className={
                    path === href || path.startsWith(href + "/")
                      ? "selected"
                      : ""
                  }
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden>{icon}</span>
                  {label}
                  {["/categories", "/ai", "/protocols"].includes(href) && (
                    <span className="nav-dot" />
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Capa de observación<small>Atención y respuestas en LiveChat</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <button
            className="menu-toggle"
            onClick={() => setOpen(!open)}
            aria-label="Mostrar navegación"
          >
            ☰
          </button>
          <span>
            Quédate <span className="header-divider">/</span> Centro Operacional
          </span>
          <div className="header-right">
            <span className="badge neutral">Acceso POC</span>
            <span className="operator">Operador</span>
            <span className="avatar">Q</span>
          </div>
        </header>
        <main className="operations-content">{children}</main>
        <footer className="workspace-footer">
          Basic Auth temporal · RBAC / autenticación real pendiente antes de
          entregar acceso formal a una contraparte.
        </footer>
      </div>
    </div>
  );
}
