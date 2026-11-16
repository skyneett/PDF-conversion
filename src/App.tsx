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
import type { ConversionMode } from './types';

const EFFECTS_STORAGE_KEY = 'paperwave:effects';

const TOOL_MODES: Record<string, ConversionMode> = {
  'PDF a Word': 'pdf-to-word',
  'Word a PDF': 'word-to-pdf'
};

const MODE_COPY: Record<
  ConversionMode,
  {
    title: string;
    accept: string;
    chooseLabel: string;
    chooseAnother: string;
    dropTitle: string;
    dropMeta: string;
    convertLabel: string;
    resultTitle: string;
  }
> = {
  'pdf-to-word': {
    title: 'PDF a Word',
    accept: '.pdf,application/pdf',
    chooseLabel: 'Elegir un PDF',
    chooseAnother: 'Elegir otro PDF',
    dropTitle: 'Arrastra tu PDF aquí',
    dropMeta: `Hasta ${formatBytes(MAX_FILE_BYTES)} · ${MAX_PAGES} páginas · sin subir a ningún servidor`,
    convertLabel: 'Convertir a Word',
    resultTitle: 'Word listo'
  },
  'word-to-pdf': {
    title: 'Word a PDF',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    chooseLabel: 'Elegir un Word',
    chooseAnother: 'Elegir otro Word',
    dropTitle: 'Arrastra tu Word aquí',
    dropMeta: `Hasta ${formatBytes(MAX_FILE_BYTES)} · .docx · sin subir a ningún servidor`,
    convertLabel: 'Convertir a PDF',
    resultTitle: 'PDF listo'
  }
};

type EffectsPreference = 'auto' | 'on' | 'off';

function readEffectsPreference(): EffectsPreference {
  try {
    const stored = window.localStorage.getItem(EFFECTS_STORAGE_KEY);
    if (stored === 'on' || stored === 'off') return stored;
  } catch {
    // localStorage puede no estar disponible en modo privado.
  }

  return 'auto';
}

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
  const [mode, setMode] = useState<ConversionMode>('pdf-to-word');
  const converter = useConverter(mode);
  const copy = MODE_COPY[mode];
  const inputRef = useRef<HTMLInputElement>(null);
  const closeToolsRef = useRef<HTMLButtonElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [effectsPreference, setEffectsPreference] = useState<EffectsPreference>(readEffectsPreference);

  const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particlesEnabled =
    effectsPreference === 'on' || (effectsPreference === 'auto' && !systemReducedMotion);
  const forceAmbient = effectsPreference === 'auto' ? undefined : effectsPreference === 'on';

  const toggleEffects = useCallback(() => {
    setEffectsPreference((previous) => {
      const next: EffectsPreference =
        previous === 'off'
          ? 'on'
          : previous === 'on'
            ? 'off'
            : systemReducedMotion
              ? 'on'
              : 'off';

      try {
        window.localStorage.setItem(EFFECTS_STORAGE_KEY, next);
      } catch {
        // Si no se puede persistir, el cambio sigue funcionando en esta sesión.
      }

      return next;
    });
  }, [systemReducedMotion]);

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

  const switchMode = useCallback(
    (next: ConversionMode) => {
      if (next === mode) return;
      converter.reset();
      setMode(next);
    },
    [converter, mode]
  );

  const handleToolClick = useCallback(
    (tool: string) => {
      const nextMode = TOOL_MODES[tool];
      if (!nextMode) return;
      switchMode(nextMode);
      setToolsOpen(false);
      window.setTimeout(scrollToConverter, 80);
    },
    [switchMode]
  );

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
      <LiquidBackground forceAmbient={forceAmbient} />

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
            PDF ↔ Word · 100% en tu navegador
          </div>
          <h1>
            Convierte entre PDF y Word <span className="accent">sin subir nada.</span>
          </h1>
          <p className="lede">
            Tus documentos se convierten dentro de este navegador. No viajan a ningún servidor, no
            se guardan y se descartan al terminar.
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
                <h2 id="converter-title">{copy.title}</h2>
              </div>
              <span className="privacy-pill">
                <LockIcon /> No se sube
              </span>
            </div>

            <div className="mode-switch" role="group" aria-label="Tipo de conversión">
              <button
                type="button"
                className={mode === 'pdf-to-word' ? 'is-active' : ''}
                aria-pressed={mode === 'pdf-to-word'}
                onClick={() => switchMode('pdf-to-word')}
              >
                PDF a Word
              </button>
              <button
                type="button"
                className={mode === 'word-to-pdf' ? 'is-active' : ''}
                aria-pressed={mode === 'word-to-pdf'}
                onClick={() => switchMode('word-to-pdf')}
              >
                Word a PDF <span className="beta-tag">Beta</span>
              </button>
            </div>

            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept={copy.accept}
              aria-label={copy.chooseLabel}
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
                <p className="dropzone-title">{copy.dropTitle}</p>
                <p className="dropzone-sub">o haz clic para elegirlo</p>
                <p className="dropzone-meta">{copy.dropMeta}</p>
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
                        : 'El documento se procesa en la memoria de tu navegador.'}
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
                    <strong>{copy.resultTitle}</strong>
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
                  La descarga debería haber empezado. El archivo y el resultado siguen solo en tu
                  memoria.
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
                      {copy.chooseAnother}
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
                {copy.convertLabel}
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
            <p>El archivo no sale de tu equipo. No hay una API que reciba el documento.</p>
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
              Paperwave usa WebAssembly para ejecutar el conversor dentro de tu navegador. Tu PDF o
              Word se lee en memoria, se convierte y se descarga. No se envía a ningún servidor y no
              queda almacenado en ningún sitio.
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
            PDF y Word en tu navegador. Hecho con PyMuPDF, pdf2docx y docx-preview.
          </p>
          <div className="footer-links">
            <button
              type="button"
              className="effects-toggle"
              onClick={toggleEffects}
              aria-pressed={particlesEnabled}
              title="Activar o desactivar las partículas ambientales"
            >
              <span className={`effects-dot ${particlesEnabled ? 'is-on' : ''}`} aria-hidden="true" />
              Partículas {particlesEnabled ? 'activas' : 'inactivas'}
            </button>
            <a
              href="https://github.com/skyneett/PDF-conversion"
              target="_blank"
              rel="noreferrer"
            >
              <GithubIcon /> C��digo
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
                    const nextMode = TOOL_MODES[tool];
                    const active = Boolean(nextMode);
                    const badge = tool === 'Word a PDF' ? 'Beta' : 'Ahora';
                    return (
                      <button
                        key={tool}
                        type="button"
                        className={`tool-item ${active ? 'active' : ''} ${nextMode === mode ? 'is-current' : ''}`}
                        onClick={() => handleToolClick(tool)}
                        disabled={!active}
                      >
                        <span>{tool}</span>
                        {active ? (
                          <span className="tool-badge">{badge}</span>
                        ) : (
                          <span className="tool-soon">Pronto</span>
                        )}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>

            <p className="tools-note">
              PDF a Word y Word a PDF (beta) están activos. El resto se irá habilitando sin cambiar
              de arquitectura.
            </p>
          </div>
        </div>
      )}

      <div className="grain" aria-hidden="true" />
    </div>
  );
}
