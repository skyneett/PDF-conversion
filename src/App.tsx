import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { LiquidBackground } from './components/LiquidBackground';
import {
  ArrowRightIcon,
  BoltIcon,
  BrandMark,
  CheckIcon,
  CloseIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  GithubIcon,
  LockIcon,
  ShieldIcon,
  UploadIcon
} from './components/icons';
import { useConverter } from './hooks/useConverter';
import { MAX_FILE_BYTES, MAX_PAGES } from './lib/constants';
import { formatBytes, formatDuration } from './lib/format';

const ACTIVE_TOOL = 'PDF a Word';

const TOOL_GROUPS = [
  { title: 'Organizar', items: ['Unir PDF', 'Dividir PDF', 'Extraer páginas', 'Rotar PDF', 'Ordenar PDF'] },
  { title: 'Optimizar', items: ['Comprimir PDF', 'Reparar PDF', 'OCR PDF'] },
  { title: 'Convertir', items: ['PDF a Word', 'PDF a Excel', 'PDF a PowerPoint', 'Word a PDF', 'JPG a PDF'] },
  { title: 'Editar', items: ['Editar PDF', 'Numerar páginas', 'Marca de agua'] },
  { title: 'Seguridad', items: ['Proteger PDF', 'Desbloquear PDF', 'Firmar PDF'] },
  { title: 'Comparar', items: ['Comparar PDF'] },
  { title: 'Más', items: ['Anotar PDF', 'Formularios', 'Quitar metadatos'] }
];

function scrollToConverter(): void {
  document.getElementById('convertidor')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}

export default function App() {
  const converter = useConverter();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeToolsRef = useRef<HTMLButtonElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) converter.selectFile(file);
    },
    [converter]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleToolClick = useCallback((tool: string) => {
    if (tool !== ACTIVE_TOOL) return;
    setToolsOpen(false);
    window.setTimeout(scrollToConverter, 80);
  }, []);

  useEffect(() => {
    if (!toolsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolsOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeToolsRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toolsOpen]);

  const canRetry = Boolean(converter.file) && !converter.isBusy;

  return (
    <div className="app">
      <LiquidBackground />

      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#" aria-label="Paperwave, inicio">
            <BrandMark className="brand-mark" />
            <span>Paperwave</span>
          </a>

          <nav className="main-nav" aria-label="Principal">
            <a href="#convertidor">Convertir</a>
            <button
              type="button"
              className="nav-button"
              onClick={() => setToolsOpen(true)}
              aria-haspopup="dialog"
            >
              Herramientas
            </button>
            <a href="#privacidad">Privacidad</a>
          </nav>

          <a
            className="github-link"
            href="https://github.com/skyneett/PDF-conversion"
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon />
            <span>GitHub</span>
          </a>
        </div>
      </header>

      <main>
        <section className="hero shell">
          <div className="eyebrow">
            <span className="pulse-dot" />
            PDF → DOCX · 100% en tu navegador
          </div>
          <h1>
            Convierte PDF a Word <span className="accent">sin subir nada.</span>
          </h1>
          <p className="lede">
            Tu documento se convierte dentro de este navegador. No viaja a ningún servidor, no se
            guarda y se descarta al terminar.
          </p>
          <div className="hero-chips" aria-label="Características">
            <span>
              <ShieldIcon /> Privado por diseño
            </span>
            <span>
              <BoltIcon /> Sin subida
            </span>
            <span>
              <CodeIcon /> Código abierto
            </span>
          </div>
        </section>

        <section id="convertidor" className="shell converter-shell" aria-labelledby="converter-title">
          <div className="converter-card" data-phase={converter.phase}>
            <div className="card-heading">
              <div>
                <p className="card-kicker">Convertidor</p>
                <h2 id="converter-title">PDF a Word</h2>
              </div>
              <span className="privacy-pill">
                <LockIcon /> No se sube
              </span>
            </div>

            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              aria-label="Elegir un PDF"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = '';
              }}
            />

            {!converter.file ? (
              <div
                className={`dropzone ${dragActive ? 'is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                onClick={openFilePicker}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openFilePicker();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <div className="dropzone-orbit">
                  <UploadIcon />
                </div>
                <p className="dropzone-title">Arrastra tu PDF aquí</p>
                <p className="dropzone-sub">o haz clic para elegirlo</p>
                <p className="dropzone-meta">
                  Hasta {formatBytes(MAX_FILE_BYTES)} · {MAX_PAGES} páginas · sin subir a ningún
                  servidor
                </p>
              </div>
            ) : (
              <div className="file-card">
                <div className="file-icon">
                  <FileIcon />
                </div>
                <div className="file-info">
                  <strong>{converter.file.name}</strong>
                  <span>{formatBytes(converter.file.size)} · listo para convertir</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={converter.reset}
                  aria-label="Quitar archivo"
                  disabled={converter.isBusy}
                >
                  <CloseIcon />
                </button>
              </div>
            )}

            {converter.isBusy && (
              <div className="status-box" role="status" aria-live="polite">
                <div className="status-head">
                  <span className="spinner" aria-hidden="true" />
                  <div>
                    <strong>{converter.statusMessage}</strong>
                    <span>
                      {converter.phase === 'loading'
                        ? 'La primera conversión descarga el motor (~56 MB) y queda en caché.'
                        : 'El archivo se procesa en la memoria de tu navegador.'}
                    </span>
                  </div>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span />
                </div>
                <button type="button" className="button ghost small" onClick={converter.cancel}>
                  Cancelar
                </button>
              </div>
            )}

            {converter.phase === 'done' && (
              <div
                className="result-box"
                data-result={converter.resultName ?? ''}
                role="status"
                aria-live="polite"
              >
                <div className="result-head">
                  <span className="result-check">
                    <CheckIcon />
                  </span>
                  <div>
                    <strong>Word listo</strong>
                    <span>
                      {converter.resultName} · {formatBytes(converter.resultSize)} ·{' '}
                      {formatDuration(converter.elapsedMs)}
                    </span>
                  </div>
                </div>
                <div className="result-actions">
                  <button
                    type="button"
                    className="button primary"
                    data-download
                    onClick={converter.download}
                  >
                    <DownloadIcon />
                    Descargar de nuevo
                  </button>
                  <button type="button" className="button ghost" onClick={converter.reset}>
                    Convertir otro
                  </button>
                </div>
                <p className="result-note">
                  La descarga debería haber empezado. El PDF y el Word siguen solo en tu memoria.
                </p>
              </div>
            )}

            {converter.phase === 'error' && converter.error && (
              <div className="error-box" role="alert">
                <div>
                  <strong>No se pudo convertir</strong>
                  <p>{converter.error.message}</p>
                </div>
                <span className="error-code">{converter.error.code}</span>
                <div className="error-actions">
                  {canRetry ? (
                    <button type="button" className="button secondary" onClick={converter.convert}>
                      Reintentar
                    </button>
                  ) : (
                    <button type="button" className="button secondary" onClick={openFilePicker}>
                      Elegir otro PDF
                    </button>
                  )}
                  <button type="button" className="button ghost" onClick={converter.reset}>
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            {converter.phase === 'cancelled' && (
              <div className="status-box" role="status">
                <div className="status-head">
                  <span className="status-dot" aria-hidden="true" />
                  <div>
                    <strong>Conversión cancelada</strong>
                    <span>El archivo no se ha enviado a ningún sitio.</span>
                  </div>
                </div>
                <button type="button" className="button secondary small" onClick={converter.convert}>
                  Reintentar
                </button>
              </div>
            )}

            <div className="card-actions">
              <button
                type="button"
                className="button primary convert-button"
                data-convert
                onClick={converter.convert}
                disabled={!converter.file || converter.isBusy}
              >
                Convertir a Word
                <ArrowRightIcon />
              </button>
              <p className="card-footnote">
                <ShieldIcon />
                El archivo se procesa en memoria y se descarta. No se sube a ningún servidor.
              </p>
            </div>
          </div>
        </section>

        <section className="trust shell" aria-label="Por qué Paperwave">
          <article>
            <span className="trust-icon">
              <ShieldIcon />
            </span>
            <h3>Privacidad real</h3>
            <p>El PDF no sale de tu equipo. No hay una API que reciba el archivo.</p>
          </article>
          <article>
            <span className="trust-icon">
              <BoltIcon />
            </span>
            <h3>Sin colas</h3>
            <p>La conversión ocurre en tu procesador. No dependes de la subida ni de un servidor.</p>
          </article>
          <article>
            <span className="trust-icon">
              <LockIcon />
            </span>
            <h3>Sin cuentas</h3>
            <p>No hay registro, cookies de sesión ni historial de archivos.</p>
          </article>
          <article>
            <span className="trust-icon">
              <CodeIcon />
            </span>
            <h3>AGPL-3.0</h3>
            <p>El código es abierto. Puedes auditarlo, ejecutarlo y adaptarlo.</p>
          </article>
        </section>

        <section id="privacidad" className="privacy shell">
          <div className="privacy-copy">
            <p className="card-kicker">Privacidad</p>
            <h2>Sin letra pequeña.</h2>
            <p>
              Paperwave usa WebAssembly para ejecutar el conversor dentro de tu navegador. Tu PDF se
              lee en memoria, se convierte y se descarga. No se envía a ningún servidor y no queda
              almacenado en ningún sitio.
            </p>
            <p>
              Al pulsar <strong>Convertir otro</strong> o cerrar la pestaña, el archivo y el
              resultado se liberan. La primera conversión descarga el motor (~56 MB); después el
              navegador lo reutiliza desde la caché.
            </p>
          </div>
          <div className="privacy-points">
            <div>
              <CheckIcon />
              <span>Sin subida de archivos</span>
            </div>
            <div>
              <CheckIcon />
              <span>Sin registro ni cuentas</span>
            </div>
            <div>
              <CheckIcon />
              <span>Sin analítica ni cookies</span>
            </div>
            <div>
              <CheckIcon />
              <span>Sin límites de servidor</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div className="footer-brand">
            <BrandMark className="brand-mark" />
            <span>Paperwave</span>
          </div>
          <p>
            PDF a Word en tu navegador. Hecho con PyMuPDF y pdf2docx compilados a WebAssembly.
          </p>
          <div className="footer-links">
            <a
              href="https://github.com/skyneett/PDF-conversion"
              target="_blank"
              rel="noreferrer"
            >
              <GithubIcon /> Código
            </a>
            <span>AGPL-3.0</span>
          </div>
        </div>
      </footer>

      {toolsOpen && (
        <div
          className="tools-overlay"
          role="presentation"
          onClick={() => setToolsOpen(false)}
        >
          <div
            className="tools-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tools-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tools-head">
              <div>
                <p className="card-kicker">Todas las herramientas</p>
                <h2 id="tools-title">Menú</h2>
              </div>
              <button
                ref={closeToolsRef}
                type="button"
                className="icon-button"
                onClick={() => setToolsOpen(false)}
                aria-label="Cerrar menú"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="tools-grid">
              {TOOL_GROUPS.map((group) => (
                <section key={group.title} className="tool-group">
                  <h3>{group.title}</h3>
                  {group.items.map((tool) => {
                    const active = tool === ACTIVE_TOOL;
                    return (
                      <button
                        key={tool}
                        type="button"
                        className={`tool-item ${active ? 'active' : ''}`}
                        onClick={() => handleToolClick(tool)}
                        disabled={!active}
                      >
                        <span>{tool}</span>
                        {active ? <span className="tool-badge">Ahora</span> : <span className="tool-soon">Pronto</span>}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>

            <p className="tools-note">
              Por ahora solo PDF a Word está activo. El resto se irá habilitando sin cambiar de
              arquitectura.
            </p>
          </div>
        </div>
      )}

      <div className="grain" aria-hidden="true" />
    </div>
  );
}
