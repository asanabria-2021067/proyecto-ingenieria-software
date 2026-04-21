"use client";

import { useRef, type ElementType, type ReactNode, type RefObject } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const defaultVariants: Variants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.2,
      duration: 0.5,
    },
  }),
  hidden: {
    filter: "blur(10px)",
    y: -20,
    opacity: 0,
  },
};

type TimelineContentProps = {
  as?: ElementType;
  animationNum?: number;
  timelineRef?: RefObject<HTMLElement | null>;
  customVariants?: Variants;
  className?: string;
  children: ReactNode;
};

export function TimelineContent({
  as = "div",
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const observedRef = timelineRef ?? localRef;
  const isInView = useInView(observedRef, { once: true, amount: 0.2 });
  const MotionTag = motion[as as keyof typeof motion] as ElementType;

  return (
    <MotionTag
      ref={timelineRef ? undefined : localRef}
      custom={animationNum}
      variants={customVariants ?? defaultVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={cn(className)}
    >
      {children}
    </MotionTag>
  );
}

