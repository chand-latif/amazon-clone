"use client";

import Image from "next/image";
import { useState } from "react";

/** Main image plus thumbnails (vertical strip on desktop, horizontal on mobile). */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];

  if (images.length === 0) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded bg-white text-zinc-300"
        role="img"
        aria-label="No image available"
      >
        <svg viewBox="0 0 24 24" className="h-20 w-20" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="m4 18 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {images.length > 1 && (
        <ul className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col lg:overflow-visible" aria-label="Product images">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                // Amazon-style: hovering a thumbnail previews it.
                onMouseEnter={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-pressed={i === index}
                className={`relative block h-14 w-14 overflow-hidden rounded border-2 bg-white ${
                  i === index ? "border-accent" : "border-zinc-300 hover:border-zinc-500"
                }`}
              >
                <Image src={src} alt="" fill sizes="56px" className="object-contain p-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative order-1 aspect-square w-full flex-1 overflow-hidden rounded bg-white lg:order-2">
        <Image
          key={current}
          src={current}
          alt={index === 0 ? title : `${title} (image ${index + 1})`}
          fill
          priority
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-contain p-4"
        />
      </div>
    </div>
  );
}
