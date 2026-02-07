'use client';

import { useEffect, useRef, useState } from 'react';
import { SignInButton, SignUpButton } from '@clerk/nextjs';

export default function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    // Star configuration - crisp, tiny points of light
    const stars: Array<{
      x: number;
      y: number;
      size: number;
      opacity: number;
      twinkleSpeed: number;
      twinkleOffset: number;
    }> = [];

    // Create stars - more stars, much smaller
    const starCount = 200;
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 0.8 + 0.5, // Very small: 0.5-1.3px
        opacity: Math.random() * 0.4 + 0.2, // Subtle: 0.2-0.6
        twinkleSpeed: Math.random() * 0.015 + 0.005, // Slower twinkle
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    // Animation
    let animationFrame: number;
    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.01;

      stars.forEach((star) => {
        // Very subtle twinkling
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const currentOpacity = star.opacity + twinkle * 0.15;

        // Draw crisp star - just a sharp point of light
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);

        // Optional: very subtle glow for only the brightest stars
        if (star.opacity > 0.45) {
          ctx.fillStyle = `rgba(220, 230, 255, ${currentOpacity * 0.15})`;
          ctx.fillRect(star.x - 0.5, star.y - 0.5, star.size + 1, star.size + 1);
        }
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  const handleAuthClick = () => {
    setIsTransitioning(true);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-zinc-950 to-zinc-900">
      {/* Dissolve transition overlay */}
      {isTransitioning && (
        <div className="fixed inset-0 z-50 bg-black animate-dissolve" />
      )}

      {/* Animated starfield canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        style={{ opacity: 0.4 }}
      />

      {/* Gradient overlays for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40 z-10" />
      
      {/* Logo - Top Left Corner */}
      <div className="absolute top-6 left-6 z-30">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
            PDF CHAT
          </span>
        </div>
      </div>

      {/* Hero content */}
      <div className="relative z-20 flex items-center justify-center min-h-screen px-6">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          {/* Badge/Label */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-zinc-400 font-medium">
              Powered by AI
            </span>
          </div>

          {/* Main headline */}
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-white via-white to-zinc-400 bg-clip-text text-transparent">
              Talk to your PDFs.
            </span>
            <br />
            <span className="bg-gradient-to-b from-white via-white to-zinc-400 bg-clip-text text-transparent">
              Get instant answers.
            </span>
          </h1>

          {/* Description */}
          <p className="text-xl md:text-sm text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            Upload any document and chat with it using AI.
            <br />
            Extract insights, summarize content, and find answers in seconds.
          </p>

          {/* CTA Buttons with Clerk Integration */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-1">
            <SignInButton mode="modal">
              <button 
                onClick={handleAuthClick}
                className="group relative px-6 py-4 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-lg font-semibold text-m overflow-hidden transition-all hover:scale-105 hover:shadow-2xl hover:shadow-red-500/40"
              >
                <span className="relative z-10">Get Started</span>
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-orange-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </SignInButton>

            <SignUpButton mode="modal">
              <button 
                onClick={handleAuthClick}
                className="group px-6 py-4 bg-transparent border-2 border-zinc-700 text-white rounded-lg font-semibold text-m transition-all hover:border-zinc-500 hover:bg-zinc-900/50 hover:scale-105"
              >
                Create Account
                <span className="inline-block ml-2 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>
            </SignUpButton>
          </div>
        </div>
      </div>

      {/* Crafted by signature */}
      <div className="absolute bottom-8 left-0 right-0 z-20">
        <div className="flex items-center justify-center gap-2 text-zinc-600">
          <span className="text-sm">crafted with</span>
          <svg className="w-4 h-4 text-red-500 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
          <span className="text-sm">by</span>
          <span className="text-sm font-semibold bg-gradient-to-r from-zinc-400 to-zinc-500 bg-clip-text text-transparent">
            krish
          </span>
        </div>
      </div>

      {/* CSS for dissolve animation */}
      <style jsx>{`
        @keyframes dissolve {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .animate-dissolve {
          animation: dissolve 0.6s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}