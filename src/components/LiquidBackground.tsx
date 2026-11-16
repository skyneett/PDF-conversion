import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  radius: number;
  tone: number;
}

interface Droplet {
  angle: number;
  speed: number;
  size: number;
  delay: number;
}

interface Ripple {
  x: number;
  y: number;
  started: number;
  maxRadius: number;
  droplets: Droplet[];
}

const RIPPLE_DURATION = 2200;
const MAX_RIPPLES = 6;
const RING_COLORS = ['34, 227, 195', '108, 140, 255', '235, 255, 252'];

function makeParticle(width: number, height: number): Particle {
  const z = 0.25 + Math.random() * 0.75;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    z,
    vx: (Math.random() - 0.5) * 0.16 * z,
    vy: (Math.random() - 0.5) * 0.16 * z,
    radius: 0.6 + z * 1.5,
    tone: Math.random()
  };
}

interface LiquidBackgroundProps {
  forceAmbient?: boolean;
}

export function LiquidBackground({ forceAmbient }: LiquidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rippleCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rippleCanvas = rippleCanvasRef.current;
    if (!canvas || !rippleCanvas) return;

    const context = canvas.getContext('2d', { alpha: true });
    const rippleContext = rippleCanvas.getContext('2d', { alpha: true });
    if (!context || !rippleContext) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let ambientMotion = forceAmbient ?? !reduceMotion.matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let frame = 0;
    let running = false;
    let lastTime = performance.now();
    let visible = !document.hidden;

    const mouse = { x: -1000, y: -1000, active: false };
    const ripples: Ripple[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = window.innerWidth;
      height = window.innerHeight;
      for (const target of [canvas, rippleCanvas]) {
        target.width = Math.floor(width * dpr);
        target.height = Math.floor(height * dpr);
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      rippleContext.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = width < 720 ? 420 : 1300;
      particles = Array.from({ length: count }, () => makeParticle(width, height));
    };

    const draw = (now: number) => {
      if (!running) return;

      const delta = Math.min((now - lastTime) / 16.667, 3);
      lastTime = now;

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      rippleContext.clearRect(0, 0, width, height);
      rippleContext.globalCompositeOperation = 'lighter';

      if (ambientMotion) {
        if (mouse.active) {
          const glow = context.createRadialGradient(
            mouse.x,
            mouse.y,
            0,
            mouse.x,
            mouse.y,
            220
          );
          glow.addColorStop(0, 'rgba(34, 227, 195, 0.1)');
          glow.addColorStop(0.45, 'rgba(108, 140, 255, 0.05)');
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          context.fillStyle = glow;
          context.beginPath();
          context.arc(mouse.x, mouse.y, 220, 0, Math.PI * 2);
          context.fill();
        }

        for (const particle of particles) {
          if (mouse.active) {
            const dx = mouse.x - particle.x;
            const dy = mouse.y - particle.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0.01 && distance < 240) {
              const force = (1 - distance / 240) * 0.06 * particle.z;
              particle.vx += (dx / distance) * force;
              particle.vy += (dy / distance) * force;
            }
          }

          particle.vx *= 0.985;
          particle.vy *= 0.985;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;

          if (particle.x < -20) particle.x = width + 20;
          if (particle.x > width + 20) particle.x = -20;
          if (particle.y < -20) particle.y = height + 20;
          if (particle.y > height + 20) particle.y = -20;

          const alpha = 0.12 + particle.z * 0.45;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          context.fillStyle =
            particle.tone > 0.55
              ? `rgba(34, 227, 195, ${alpha})`
              : `rgba(108, 140, 255, ${alpha * 0.9})`;
          context.fill();

          if (mouse.active) {
            const dx = mouse.x - particle.x;
            const dy = mouse.y - particle.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 150) {
              context.beginPath();
              context.moveTo(particle.x, particle.y);
              context.lineTo(mouse.x, mouse.y);
              context.strokeStyle = `rgba(34, 227, 195, ${(1 - distance / 150) * 0.12})`;
              context.lineWidth = 0.6;
              context.stroke();
            }
          }
        }
      }

      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        const ripple = ripples[index];
        const age = (now - ripple.started) / RIPPLE_DURATION;

        if (age >= 1) {
          ripples.splice(index, 1);
          continue;
        }

        const flash = Math.max(0, 1 - age * 3);

        if (flash > 0) {
          const flashRadius = 24 + age * 260;
          const flashGradient = rippleContext.createRadialGradient(
            ripple.x,
            ripple.y,
            0,
            ripple.x,
            ripple.y,
            flashRadius
          );
          flashGradient.addColorStop(0, `rgba(245, 255, 253, ${flash * 0.95})`);
          flashGradient.addColorStop(0.22, `rgba(34, 227, 195, ${flash * 0.55})`);
          flashGradient.addColorStop(0.65, `rgba(108, 140, 255, ${flash * 0.18})`);
          flashGradient.addColorStop(1, 'rgba(34, 227, 195, 0)');
          rippleContext.fillStyle = flashGradient;
          rippleContext.beginPath();
          rippleContext.arc(ripple.x, ripple.y, flashRadius, 0, Math.PI * 2);
          rippleContext.fill();
        }

        for (let ring = 0; ring < 3; ring += 1) {
          const offset = ring * 0.12;
          const ringAge = (age - offset) / (1 - offset);

          if (ringAge < 0 || ringAge >= 1) continue;

          const reach = ripple.maxRadius * (1 - ring * 0.12);
          const radius = 8 + (1 - Math.pow(1 - ringAge, 2.2)) * reach;
          const alpha = Math.pow(1 - ringAge, 0.9) * (0.95 - ring * 0.2);
          const color = RING_COLORS[ring];

          if (ring === 0) {
            const bandGradient = rippleContext.createRadialGradient(
              ripple.x,
              ripple.y,
              Math.max(0, radius - 70),
              ripple.x,
              ripple.y,
              radius + 16
            );
            bandGradient.addColorStop(0, 'rgba(34, 227, 195, 0)');
            bandGradient.addColorStop(0.72, `rgba(34, 227, 195, ${alpha * 0.16})`);
            bandGradient.addColorStop(0.94, `rgba(220, 255, 250, ${alpha * 0.22})`);
            bandGradient.addColorStop(1, 'rgba(34, 227, 195, 0)');
            rippleContext.fillStyle = bandGradient;
            rippleContext.beginPath();
            rippleContext.arc(ripple.x, ripple.y, radius + 16, 0, Math.PI * 2);
            rippleContext.fill();
          }

          rippleContext.beginPath();
          rippleContext.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
          rippleContext.strokeStyle = `rgba(${color}, ${alpha})`;
          rippleContext.lineWidth = 4 - ring * 0.9;
          rippleContext.shadowBlur = 32;
          rippleContext.shadowColor = `rgba(${color}, ${alpha})`;
          rippleContext.stroke();

          if (ring === 0) {
            rippleContext.beginPath();
            rippleContext.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            rippleContext.strokeStyle = `rgba(245, 255, 253, ${alpha * 0.8})`;
            rippleContext.lineWidth = 1.2;
            rippleContext.shadowBlur = 0;
            rippleContext.stroke();
          }
        }

        rippleContext.shadowBlur = 12;
        rippleContext.shadowColor = 'rgba(34, 227, 195, 0.8)';

        for (const drop of ripple.droplets) {
          const dropAge = (age - drop.delay) / (1 - drop.delay);

          if (dropAge < 0 || dropAge >= 1) continue;

          const travel = 20 + drop.speed * (1 - Math.pow(1 - dropAge, 2)) * 260;
          const x = ripple.x + Math.cos(drop.angle) * travel;
          const y = ripple.y + Math.sin(drop.angle) * travel + 110 * dropAge * dropAge;
          const alpha = Math.pow(1 - dropAge, 1.2);
          const size = drop.size * (1 - dropAge * 0.3);

          rippleContext.beginPath();
          rippleContext.arc(x, y, size, 0, Math.PI * 2);
          rippleContext.fillStyle = `rgba(220, 255, 250, ${alpha})`;
          rippleContext.fill();
        }

        rippleContext.shadowBlur = 0;
      }

      context.globalCompositeOperation = 'source-over';
      rippleContext.globalCompositeOperation = 'source-over';

      if (!ambientMotion && ripples.length === 0) {
        running = false;
        context.clearRect(0, 0, width, height);
        rippleContext.clearRect(0, 0, width, height);
        return;
      }

      frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onPointerMove = (event: PointerEvent) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.active = true;
    };

    const onPointerLeave = () => {
      mouse.active = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      const droplets = Array.from({ length: 18 }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
        size: 1.3 + Math.random() * 2.6,
        delay: Math.random() * 0.12
      }));

      const maxRadius = Math.hypot(
        Math.max(event.clientX, width - event.clientX),
        Math.max(event.clientY, height - event.clientY)
      );

      ripples.push({
        x: event.clientX,
        y: event.clientY,
        started: performance.now(),
        maxRadius,
        droplets
      });

      if (ripples.length > MAX_RIPPLES) ripples.shift();

      if (ambientMotion) {
        for (const particle of particles) {
          const dx = particle.x - event.clientX;
          const dy = particle.y - event.clientY;
          const distance = Math.hypot(dx, dy);

          if (distance > 0.01 && distance < 320) {
            const force = (1 - distance / 320) * 4 * particle.z;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }
      }

      if (!running) start();
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;

      if (visible) {
        if (ambientMotion || ripples.length > 0) start();
      } else {
        stop();
        ripples.length = 0;
        context.clearRect(0, 0, width, height);
        rippleContext.clearRect(0, 0, width, height);
      }
    };

    const onReduceMotionChange = () => {
      if (forceAmbient !== undefined) return;

      ambientMotion = !reduceMotion.matches;

      if (ambientMotion) {
        start();
      } else if (ripples.length === 0) {
        stop();
        context.clearRect(0, 0, width, height);
        rippleContext.clearRect(0, 0, width, height);
      }
    };

    resize();
    if (ambientMotion) start();

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    reduceMotion.addEventListener('change', onReduceMotionChange);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reduceMotion.removeEventListener('change', onReduceMotionChange);
    };
  }, [forceAmbient]);

  return (
    <>
      <canvas ref={canvasRef} className="liquid-canvas" aria-hidden="true" />
      <canvas ref={rippleCanvasRef} className="ripple-canvas" aria-hidden="true" />
    </>
  );
}
