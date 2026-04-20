"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import FormalizaExperienceSection from "@/components/landing/FormalizaExperienceSection";
import IndividualProjectsSection from "@/components/landing/IndividualProjectsSection";
import OrganizationsSection from "@/components/landing/OrganizationsSection";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type SectionConfig = {
  id: string;
  curtainClass: string;
  curtainClipPath: string;
  content: ReactNode;
};

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "features",
    curtainClass:
      "bg-[linear-gradient(145deg,var(--color-primary-container)_0%,var(--color-primary)_48%,#052414_100%)]",
    curtainClipPath: "polygon(0 6%, 100% 0, 100% 94%, 0 100%)",
    content: <FeaturesGrid />,
  },
  {
    id: "how",
    curtainClass:
      "bg-[linear-gradient(145deg,#0B5A31_0%,var(--color-primary)_48%,#03180F_100%)]",
    curtainClipPath: "polygon(0 0, 100% 8%, 100% 100%, 0 92%)",
    content: <FormalizaExperienceSection />,
  },
  {
    id: "individual",
    curtainClass:
      "bg-[linear-gradient(145deg,var(--color-secondary)_0%,var(--color-primary)_48%,#072815_100%)]",
    curtainClipPath: "polygon(0 4%, 100% 0, 100% 100%, 0 96%)",
    content: <IndividualProjectsSection />,
  },
  {
    id: "orgs",
    curtainClass:
      "bg-[linear-gradient(145deg,#2A6E45_0%,var(--color-primary)_48%,#062015_100%)]",
    curtainClipPath: "polygon(0 0, 100% 4%, 100% 96%, 0 100%)",
    content: <OrganizationsSection />,
  },
];

export default function LandingAnimatedSections() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-cinematic-section]");

      sections.forEach((section, index) => {
        if (index === 0) return;

        const direction = index % 2 === 0 ? 1 : -1;
        const isNearEnd = index >= sections.length - 2;
        const sectionStart = isNearEnd ? "top 98%" : "top 92%";
        const sectionEnd = isNearEnd ? "top 62%" : "top 18%";
        const itemStart = isNearEnd ? "top 88%" : "top 76%";
        const itemEnd = isNearEnd ? "top 68%" : "top 42%";
        const curtain = section.querySelector<HTMLElement>("[data-section-curtain]");
        const content = section.querySelector<HTMLElement>("[data-section-content]");
        const prevContent = sections[index - 1]?.querySelector<HTMLElement>("[data-section-content]");

        if (!curtain || !content) return;

        const itemNodes = Array.from(
          content.querySelectorAll<HTMLElement>(
            "h2, h3, p, a, button, .group, .rounded-2xl, li",
          ),
        );

        gsap.set(curtain, { yPercent: 0, xPercent: 0, rotate: direction * 2, scale: 1.15 });
        gsap.set(content, { autoAlpha: 0, y: 110, scale: 0.98, filter: "blur(12px)" });
        gsap.set(itemNodes, { autoAlpha: 0, y: 26 });

        const sectionTl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: sectionStart,
            end: sectionEnd,
            scrub: 1,
          },
        });

        sectionTl
          .to(
            curtain,
            {
              yPercent: -130,
              xPercent: direction * 24,
              rotate: direction * 8,
              scale: 1,
              ease: "none",
            },
            0,
          )
          .to(
            content,
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              filter: "blur(0px)",
              ease: "power3.out",
            },
            0.2,
          )
          .to(
            prevContent,
            {
              y: -48,
              scale: 0.97,
              opacity: 0.58,
              filter: "blur(2px)",
              ease: "none",
            },
            0,
          );

        gsap.to(itemNodes, {
          autoAlpha: 1,
          y: 0,
          stagger: 0.06,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: itemStart,
            end: itemEnd,
            scrub: 0.9,
          },
        });
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastTs = 0;
    const pxPerSecond = 255;

    const autoScroll = (ts: number) => {
      if (!lastTs) lastTs = ts;
      const delta = (ts - lastTs) / 1000;
      lastTs = ts;

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY < maxScroll) {
        window.scrollTo(0, Math.min(window.scrollY + pxPerSecond * delta, maxScroll));
      }

      rafId = window.requestAnimationFrame(autoScroll);
    };

    rafId = window.requestAnimationFrame(autoScroll);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={rootRef} className="min-h-screen bg-surface text-on-surface font-headline">
      <section data-cinematic-section className="relative overflow-hidden">
        <HeroSection />
      </section>

      {SECTION_CONFIGS.map((section) => (
        <section key={section.id} data-cinematic-section className="relative isolate overflow-hidden">
          <div
            data-section-curtain
            className={`pointer-events-none absolute -inset-x-20 -inset-y-28 z-30 will-change-transform ${section.curtainClass}`}
            style={{ clipPath: section.curtainClipPath }}
          />
          <div data-section-content className="relative z-20 will-change-transform">
            {section.content}
          </div>
        </section>
      ))}
    </div>
  );
}
