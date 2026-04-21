"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Navbar from "@/components/landing/Navbar";
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
  content: ReactNode;
};

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "features",
    content: <FeaturesGrid />,
  },
  {
    id: "how",
    content: <FormalizaExperienceSection />,
  },
  {
    id: "individual",
    content: <IndividualProjectsSection />,
  },
  {
    id: "orgs",
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
        const content = section.querySelector<HTMLElement>("[data-section-content]");
        const prevContent = sections[index - 1]?.querySelector<HTMLElement>("[data-section-content]");

        if (!content) return;

        const itemNodes = Array.from(
          content.querySelectorAll<HTMLElement>(
            "h2, h3, p, a, button, .group, .rounded-2xl, li",
          ),
        );

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

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-surface pt-20 text-on-surface font-headline md:pt-24"
    >
      <Navbar />
      <section data-cinematic-section className="relative overflow-hidden">
        <HeroSection />
      </section>

      {SECTION_CONFIGS.map((section) => (
        <section key={section.id} data-cinematic-section className="relative isolate overflow-hidden">
          <div data-section-content className="relative z-20 will-change-transform">
            {section.content}
          </div>
        </section>
      ))}
    </div>
  );
}
