"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

export type HeroSlide = {
  id: string;
  eyebrow: string;
  headline: string;
  subline: string;
  href: string;
  cta: string;
  /** Full image URL, or null for a text-only slide. */
  image: string | null;
  imageAlt: string;
  /** Index into THEMES. */
  theme: number;
};

// Full class strings so Tailwind can see them.
const THEMES = [
  "from-navy via-[#1d3a63] to-[#2f5d93]",
  "from-[#3b1d5a] via-[#5b2a86] to-[#8a4aa8]",
  "from-[#0f4c3a] via-[#176a50] to-[#2f8f6b]",
  "from-[#7a2e0e] via-[#a8461a] to-[#d1672b]",
];

const AUTOPLAY_MS = 6000;

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const count = slides.length;
  const autoplaying = count > 1 && !userPaused && !hovered && !focused && !reducedMotion;

  useEffect(() => {
    if (!autoplaying) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplaying, count]);

  const go = (i: number) => setIndex(((i % count) + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative overflow-hidden rounded bg-navy shadow-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
        aria-live={autoplaying ? "off" : "polite"}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            // Off-screen slides must not be focusable or read out.
            inert={i !== index}
            aria-hidden={i !== index}
            className={`relative flex min-h-64 w-full shrink-0 items-center bg-gradient-to-r px-6 py-8 text-white sm:min-h-80 sm:px-12 ${THEMES[s.theme % THEMES.length]}`}
          >
            <div className="z-10 max-w-md">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">{s.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-4xl">{s.headline}</h2>
              <p className="mt-2 text-sm text-white/85 sm:text-base">{s.subline}</p>
              <Link
                href={s.href}
                className="mt-5 inline-block rounded-full bg-accent px-6 py-2 text-sm font-semibold text-navy hover:bg-accent-hover"
              >
                {s.cta}
              </Link>
            </div>
            {s.image && (
              <div className="absolute inset-y-4 right-4 w-2/5 sm:right-12 sm:w-1/3">
                <Image
                  src={s.image}
                  alt={s.imageAlt}
                  fill
                  sizes="(min-width: 640px) 33vw, 40vw"
                  priority={i === 0}
                  className="object-contain drop-shadow-2xl"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/55"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/55"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/30 px-3 py-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-accent" : "w-2.5 bg-white/60 hover:bg-white"}`}
              />
            ))}
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Resume automatic slide rotation" : "Pause automatic slide rotation"}
              className="ml-1 flex h-5 w-5 items-center justify-center text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                {userPaused ? <path d="M7 4.5v15l12-7.5-12-7.5z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
              </svg>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
