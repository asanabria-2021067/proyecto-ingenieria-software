"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { BadgeCheck, BellRing, ShieldCheck } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const INJECTED_STYLES = `
  .gsap-reveal { visibility: hidden; }

  .film-grain {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; opacity: 0.05; mix-blend-mode: overlay;
      background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>');
  }

  .bg-grid-theme {
      background-size: 60px 60px;
      background-image:
          linear-gradient(to right, color-mix(in srgb, var(--color-on-surface) 6%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-on-surface) 6%, transparent) 1px, transparent 1px);
      mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
  }

  .text-3d-matte {
      color: var(--color-on-surface);
      text-shadow:
          0 10px 30px color-mix(in srgb, var(--color-on-surface) 20%, transparent),
          0 2px 4px color-mix(in srgb, var(--color-on-surface) 10%, transparent);
  }

  .text-silver-matte {
      background: linear-gradient(180deg, var(--color-on-surface) 0%, color-mix(in srgb, var(--color-on-surface) 40%, transparent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter:
          drop-shadow(0px 10px 20px color-mix(in srgb, var(--color-on-surface) 15%, transparent))
          drop-shadow(0px 2px 4px color-mix(in srgb, var(--color-on-surface) 10%, transparent));
  }

  .text-card-silver-matte {
      background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      transform: translateZ(0);
      filter:
          drop-shadow(0px 12px 24px rgba(0,0,0,0.8))
          drop-shadow(0px 4px 8px rgba(0,0,0,0.6));
  }

  .premium-depth-card {
      background: linear-gradient(145deg, #0E6B3A 0%, #071A12 100%);
      box-shadow:
          0 40px 100px -20px rgba(0, 0, 0, 0.9),
          0 20px 40px -20px rgba(0, 0, 0, 0.8),
          inset 0 1px 2px rgba(255, 255, 255, 0.2),
          inset 0 -2px 4px rgba(0, 0, 0, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.04);
      position: relative;
  }

  .card-sheen {
      position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
      background: radial-gradient(800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.06) 0%, transparent 40%);
      mix-blend-mode: screen; transition: opacity 0.3s ease;
  }

  .iphone-bezel {
      background-color: #111;
      box-shadow:
          inset 0 0 0 2px #52525B,
          inset 0 0 0 7px #000,
          0 40px 80px -15px rgba(0,0,0,0.9),
          0 15px 25px -5px rgba(0,0,0,0.7);
      transform-style: preserve-3d;
  }

  .hardware-btn {
      background: linear-gradient(90deg, #404040 0%, #171717 100%);
      box-shadow:
          -2px 0 5px rgba(0,0,0,0.8),
          inset -1px 0 1px rgba(255,255,255,0.15),
          inset 1px 0 2px rgba(0,0,0,0.8);
      border-left: 1px solid rgba(255,255,255,0.05);
  }

  .screen-glare {
      background: linear-gradient(110deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 45%);
  }

  .widget-depth {
      background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
      box-shadow:
          0 10px 20px rgba(0,0,0,0.3),
          inset 0 1px 1px rgba(255,255,255,0.05),
          inset 0 -1px 1px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.03);
  }

  .floating-ui-badge {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 25px 50px -12px rgba(0, 0, 0, 0.8),
          inset 0 1px 1px rgba(255,255,255,0.2),
          inset 0 -1px 1px rgba(0,0,0,0.5);
  }

  .btn-modern-light, .btn-modern-dark {
      transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }

  .btn-modern-light {
      background: linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%);
      color: #0F172A;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.1), 0 12px 24px -4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }

  .btn-modern-light:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 0 1px rgba(0,0,0,0.05), 0 6px 12px -2px rgba(0,0,0,0.15), 0 20px 32px -6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,1), inset 0 -3px 6px rgba(0,0,0,0.06);
  }

  .btn-modern-dark {
      background: linear-gradient(180deg, #27272A 0%, #18181B 100%);
      color: #FFFFFF;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.6), 0 12px 24px -4px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -3px 6px rgba(0,0,0,0.8);
  }

  .btn-modern-dark:hover {
      transform: translateY(-3px);
      background: linear-gradient(180deg, #3F3F46 0%, #27272A 100%);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 6px 12px -2px rgba(0,0,0,0.7), 0 20px 32px -6px rgba(0,0,0,1), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -3px 6px rgba(0,0,0,0.8);
  }

  .progress-ring {
      transform: rotate(-90deg);
      transform-origin: center;
      stroke-dasharray: 402;
      stroke-dashoffset: 402;
      stroke-linecap: round;
  }
`;

export interface CinematicHeroProps extends HTMLAttributes<HTMLDivElement> {
  brandName?: string;
  tagline1?: string;
  tagline2?: string;
  cardHeading?: string;
  cardDescription?: ReactNode;
  metricValue?: number;
  metricLabel?: string;
  ctaHeading?: string;
  ctaDescription?: string;
}

export function CinematicHero({
  brandName = "UVG",
  tagline1 = "Conecta oportunidades,",
  tagline2 = "mide tu impacto real.",
  cardHeading = "Colaboracion universitaria, ordenada.",
  cardDescription = (
    <>
      <span className="font-semibold text-white">UVGenius</span> centraliza horas beca,
      extension y proyectos academicos para que encuentres, postules y des seguimiento con
      evidencia y trazabilidad.
    </>
  ),
  metricValue = 128,
  metricLabel = "Horas UVG",
  ctaHeading = "Activa tu perfil UVG.",
  ctaDescription =
    "Crea tu cuenta, descubre proyectos y postulate en minutos desde un solo lugar.",
  className,
  ...props
}: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;

      cancelAnimationFrame(requestRef.current);

      requestRef.current = requestAnimationFrame(() => {
        if (!mainCardRef.current || !mockupRef.current) return;

        const rect = mainCardRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        mainCardRef.current.style.setProperty("--mouse-x", `${mouseX}px`);
        mainCardRef.current.style.setProperty("--mouse-y", `${mouseY}px`);

        const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
        const yVal = (e.clientY / window.innerHeight - 0.5) * 2;

        gsap.to(mockupRef.current, {
          rotationY: xVal * 12,
          rotationX: -yVal * 12,
          ease: "power3.out",
          duration: 1.2,
        });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      gsap.set(".text-track", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
      gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget", ".reveal-item"], { autoAlpha: 0 });
      gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

      const introTl = gsap.timeline({ delay: 0.2 });
      introTl
        .to(".text-track", { duration: 1.5, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".text-days", { duration: 1.1, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=0.8");

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=6500",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to([".hero-text-wrapper", ".bg-grid-theme"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
        .fromTo(
          ".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.3 },
          "-=0.8",
        )
        .fromTo(
          ".phone-widget",
          { y: 40, autoAlpha: 0, scale: 0.95 },
          { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.4 },
          "-=1.4",
        )
        .to(".progress-ring", { strokeDashoffset: 60, duration: 1.9, ease: "power3.inOut" }, "-=1.1")
        .to(
          {},
          {
            duration: 1.9,
            onUpdate: function updateCounter() {
              if (!counterRef.current) return;
              const p = this.progress();
              counterRef.current.textContent = String(Math.round(metricValue * p));
            },
          },
          "<",
        )
        .fromTo(
          ".floating-badge",
          { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 },
          { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 },
          "-=1.6",
        )
        .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.3 }, "-=1.2")
        .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.3 }, "<")
        .fromTo(".reveal-item", { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.12, duration: 0.9, ease: "power3.out" }, "-=0.8")
        .to({}, { duration: 2.2 })
        .set(".hero-text-wrapper", { autoAlpha: 0 })
        .set(".cta-wrapper", { autoAlpha: 1 })
        .to({}, { duration: 1.2 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9,
          y: -40,
          z: -200,
          autoAlpha: 0,
          ease: "power3.in",
          duration: 1.1,
          stagger: 0.05,
        })
        .to(
          ".main-card",
          {
            width: isMobile ? "92vw" : "85vw",
            height: isMobile ? "86vh" : "80vh",
            borderRadius: isMobile ? "32px" : "40px",
            ease: "expo.inOut",
            duration: 1.6,
          },
          "pullback",
        )
        .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.6 }, "pullback")
        .to(".main-card", { y: -window.innerHeight - 280, ease: "power3.in", duration: 1.3 });
    }, containerRef);

    return () => ctx.revert();
  }, [metricValue]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[100svh] w-screen items-center justify-center overflow-hidden bg-surface text-on-surface antialiased",
        className,
      )}
      style={{ perspective: "1500px" }}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="film-grain" aria-hidden="true" />
      <div className="bg-grid-theme pointer-events-none absolute inset-0 z-0 opacity-50" aria-hidden="true" />

      <div
        className="hero-text-wrapper absolute z-10 flex w-screen flex-col items-center justify-center px-4 text-center will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        <h1 className="text-track gsap-reveal text-3d-matte mb-2 text-5xl font-headline font-bold tracking-tight md:text-7xl lg:text-[6rem]">
          {tagline1}
        </h1>
        <h1 className="text-days gsap-reveal text-silver-matte text-5xl font-headline font-extrabold tracking-tighter md:text-7xl lg:text-[6rem]">
          {tagline2}
        </h1>
      </div>

      <div className="cta-wrapper gsap-reveal pointer-events-auto absolute z-10 flex w-screen flex-col items-center justify-center px-4 text-center will-change-transform">
        <h2 className="text-silver-matte mb-6 text-4xl font-headline font-bold tracking-tight md:text-6xl lg:text-7xl">
          {ctaHeading}
        </h2>
        <p className="mb-12 mx-auto max-w-xl text-lg font-headline font-light leading-relaxed text-tertiary md:text-xl">
          {ctaDescription}
        </p>
        <div className="flex flex-col gap-6 sm:flex-row">
          <a
            href="/registro"
            className="btn-modern-light flex items-center justify-center gap-3 rounded-[1.25rem] px-8 py-4"
          >
            <ShieldCheck className="h-7 w-7 text-primary" />
            <div className="text-left">
              <div className="mb-[-2px] text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Empezar hoy
              </div>
              <div className="text-xl font-bold leading-none tracking-tight">Crear mi cuenta</div>
            </div>
          </a>
          <a
            href="/login"
            className="btn-modern-dark flex items-center justify-center gap-3 rounded-[1.25rem] px-8 py-4"
          >
            <BellRing className="h-7 w-7 text-emerald-300" />
            <div className="text-left">
              <div className="mb-[-2px] text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Ya tengo cuenta
              </div>
              <div className="text-xl font-bold leading-none tracking-tight">Explorar proyectos</div>
            </div>
          </a>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-6 z-20 flex items-center justify-center md:top-8"
        style={{ perspective: "1500px" }}
      >
        <div
          ref={mainCardRef}
          className="main-card premium-depth-card gsap-reveal pointer-events-auto relative flex h-[86vh] w-[92vw] items-center justify-center overflow-hidden rounded-[32px] md:h-[80vh] md:w-[85vw] md:rounded-[40px]"
        >
          <div className="card-sheen" aria-hidden="true" />

          <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-evenly px-4 py-6 lg:grid lg:grid-cols-3 lg:gap-8 lg:px-12 lg:py-0">
            <div className="card-right-text gsap-reveal order-1 z-20 flex w-full justify-center lg:order-3 lg:justify-end">
              <h2 className="text-card-silver-matte text-6xl font-black uppercase tracking-tighter md:text-[6rem] lg:text-[8rem]">
                {brandName}
              </h2>
            </div>

            <div className="mockup-scroll-wrapper order-2 relative z-10 flex h-[380px] w-full items-center justify-center lg:order-2 lg:h-[600px]" style={{ perspective: "1000px" }}>
              <div className="relative flex h-full w-full scale-[0.65] items-center justify-center md:scale-[0.85] lg:scale-100">
                <div
                  ref={mockupRef}
                  className="iphone-bezel relative flex h-[580px] w-[280px] flex-col rounded-[3rem]"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="hardware-btn absolute -left-[3px] top-[120px] z-0 h-[25px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="hardware-btn absolute -left-[3px] top-[160px] z-0 h-[45px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="hardware-btn absolute -left-[3px] top-[220px] z-0 h-[45px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="hardware-btn absolute -right-[3px] top-[170px] z-0 h-[70px] w-[3px] scale-x-[-1] rounded-r-md" aria-hidden="true" />

                  <div className="absolute inset-[7px] z-10 overflow-hidden rounded-[2.5rem] bg-[#050914] text-white shadow-[inset_0_0_15px_rgba(0,0,0,1)]">
                    <div className="screen-glare pointer-events-none absolute inset-0 z-40" aria-hidden="true" />

                    <div className="absolute left-1/2 top-[5px] z-50 flex h-[28px] w-[100px] -translate-x-1/2 items-center justify-end rounded-full bg-black px-3 shadow-[inset_0_-1px_2px_rgba(255,255,255,0.1)]">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    </div>

                    <div className="relative flex h-full w-full flex-col px-5 pb-8 pt-12">
                      <div className="phone-widget mb-8 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Hoy</span>
                          <span className="text-xl font-bold tracking-tight text-white drop-shadow-md">Mi progreso</span>
                        </div>
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-bold text-neutral-200 shadow-lg shadow-black/50">UV</div>
                      </div>

                      <div className="phone-widget relative mb-8 mx-auto flex h-44 w-44 items-center justify-center drop-shadow-[0_15px_25px_rgba(0,0,0,0.8)]">
                        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                          <circle cx="88" cy="88" r="64" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                          <circle className="progress-ring" cx="88" cy="88" r="64" fill="none" stroke="#22C55E" strokeWidth="12" />
                        </svg>
                        <div className="z-10 flex flex-col items-center text-center">
                          <span ref={counterRef} className="counter-val text-4xl font-extrabold tracking-tighter text-white">0</span>
                          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-emerald-200/60">{metricLabel}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="phone-widget widget-depth rounded-2xl p-3 flex items-center reveal-item">
                          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 shadow-inner">
                            <BadgeCheck className="h-4 w-4 text-emerald-300" />
                          </div>
                          <div className="flex-1">
                            <div className="mb-2 h-2 w-20 rounded-full bg-neutral-300 shadow-inner" />
                            <div className="h-1.5 w-12 rounded-full bg-neutral-600 shadow-inner" />
                          </div>
                        </div>
                        <div className="phone-widget widget-depth rounded-2xl p-3 flex items-center reveal-item">
                          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 shadow-inner">
                            <ShieldCheck className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="flex-1">
                            <div className="mb-2 h-2 w-16 rounded-full bg-neutral-300 shadow-inner" />
                            <div className="h-1.5 w-24 rounded-full bg-neutral-600 shadow-inner" />
                          </div>
                        </div>
                      </div>

                      <div className="absolute bottom-2 left-1/2 h-[4px] w-[120px] -translate-x-1/2 rounded-full bg-white/20 shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                    </div>
                  </div>
                </div>

                <div className="floating-badge floating-ui-badge absolute left-[-15px] top-6 z-30 flex items-center gap-3 rounded-xl p-3 lg:left-[-80px] lg:top-12 lg:gap-4 lg:rounded-2xl lg:p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/30 bg-gradient-to-b from-emerald-500/20 to-emerald-900/10 lg:h-10 lg:w-10">
                    <BadgeCheck className="h-4 w-4 text-emerald-300 lg:h-5 lg:w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-tight text-white lg:text-sm">Perfil verificado</p>
                    <p className="text-[10px] font-medium text-emerald-200/60 lg:text-xs">Listo para postular</p>
                  </div>
                </div>

                <div className="floating-badge floating-ui-badge absolute bottom-12 right-[-15px] z-30 flex items-center gap-3 rounded-xl p-3 lg:bottom-20 lg:right-[-80px] lg:gap-4 lg:rounded-2xl lg:p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-green-400/30 bg-gradient-to-b from-green-500/20 to-green-900/10 lg:h-10 lg:w-10">
                    <BellRing className="h-4 w-4 text-green-300 lg:h-5 lg:w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-tight text-white lg:text-sm">Notificacion nueva</p>
                    <p className="text-[10px] font-medium text-emerald-200/60 lg:text-xs">Postulacion actualizada</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-left-text gsap-reveal order-3 z-20 flex w-full flex-col justify-center px-4 text-center lg:order-1 lg:px-0 lg:text-left">
              <h3 className="mb-0 text-2xl font-bold tracking-tight text-white md:text-3xl lg:mb-5 lg:text-4xl">
                {cardHeading}
              </h3>
              <p className="reveal-item mx-auto hidden max-w-sm text-sm font-headline font-normal leading-relaxed text-emerald-100/70 md:block lg:mx-0 lg:max-w-none lg:text-lg">
                {cardDescription}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

