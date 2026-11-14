import React from 'react';

interface AmbientWavesProps {
  enabled?: boolean;
  intensity?: 'subtle' | 'standard' | 'cinematic';
}

/**
 * AmbientWaves - Live animated ambient ribbon waves inspired by the PS5 home screen.
 * Layered flowing sinusoidal light ribbons with electric cyan, nova blue, and violet gradients.
 * Stays strictly behind all UI with pointer-events: none and respects prefers-reduced-motion.
 */
export const AmbientWaves: React.FC<AmbientWavesProps> = ({
  enabled = true,
  intensity = 'standard',
}) => {
  return (
    <div
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Base Cinematic Midnight Deep Navy Gradient */}
      <div className="absolute inset-0 bg-[#060914] transition-colors duration-700" />

      {/* Atmospheric Radial Light Orbs */}
      <div
        className="absolute -top-[20%] left-[10%] w-[60vw] h-[60vw] max-w-[850px] max-h-[850px] rounded-full opacity-40 blur-[120px] transition-opacity duration-1000"
        style={{
          background: 'radial-gradient(circle, rgba(50, 133, 255, 0.28) 0%, rgba(0, 217, 255, 0.12) 50%, transparent 75%)',
        }}
      />
      <div
        className="absolute top-[40%] -right-[15%] w-[55vw] h-[55vw] max-w-[800px] max-h-[800px] rounded-full opacity-35 blur-[130px] transition-opacity duration-1000"
        style={{
          background: 'radial-gradient(circle, rgba(135, 87, 255, 0.25) 0%, rgba(73, 60, 255, 0.14) 50%, transparent 80%)',
        }}
      />
      <div
        className="absolute -bottom-[20%] left-[25%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] rounded-full opacity-30 blur-[100px] transition-opacity duration-1000"
        style={{
          background: 'radial-gradient(circle, rgba(0, 217, 255, 0.2) 0%, rgba(50, 133, 255, 0.08) 55%, transparent 80%)',
        }}
      />

      {/* Live Animated Ambient Wave Ribbons (Rendered when enabled) */}
      {enabled && (
        <div className="absolute inset-0 w-full h-full opacity-90 overflow-hidden motion-reduce:opacity-40">
          {/* Wave Layer 1: Broad Cyan & Blue Ambient Swell */}
          <svg
            className="absolute -bottom-10 left-0 w-[200%] h-[85vh] transform -translate-x-1/4 animate-[waveFloat1_22s_ease-in-out_infinite_alternate]"
            viewBox="0 0 1440 600"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00D9FF" stopOpacity="0.0" />
                <stop offset="25%" stopColor="#00D9FF" stopOpacity="0.28" />
                <stop offset="55%" stopColor="#3285FF" stopOpacity="0.45" />
                <stop offset="85%" stopColor="#8757FF" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#8757FF" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M0,280 C280,180 520,380 780,240 C1040,120 1260,340 1440,260 L1440,600 L0,600 Z"
              fill="url(#waveGrad1)"
              className="filter blur-[14px]"
            />
          </svg>

          {/* Wave Layer 2: Glowing Violet & Indigo Middle Ribbon */}
          <svg
            className="absolute -bottom-16 left-0 w-[190%] h-[75vh] transform -translate-x-1/5 animate-[waveFloat2_28s_ease-in-out_infinite_alternate-reverse]"
            viewBox="0 0 1440 600"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGrad2" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#8757FF" stopOpacity="0.0" />
                <stop offset="30%" stopColor="#8757FF" stopOpacity="0.4" />
                <stop offset="60%" stopColor="#3285FF" stopOpacity="0.35" />
                <stop offset="85%" stopColor="#00D9FF" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#00D9FF" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M0,340 C340,420 580,210 860,320 C1140,410 1320,240 1440,300 L1440,600 L0,600 Z"
              fill="url(#waveGrad2)"
              className="filter blur-[10px]"
            />
          </svg>

          {/* Wave Layer 3: Crisp Electric Cyan Crest Ribbon */}
          <svg
            className="absolute -bottom-6 left-0 w-[180%] h-[65vh] transform -translate-x-1/6 animate-[waveFloat3_18s_ease-in-out_infinite_alternate]"
            viewBox="0 0 1440 500"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00D9FF" stopOpacity="0.0" />
                <stop offset="35%" stopColor="#00D9FF" stopOpacity="0.5" />
                <stop offset="70%" stopColor="#3285FF" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#493CFF" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M0,230 C320,330 640,160 920,250 C1180,330 1340,180 1440,210"
              stroke="url(#waveGrad3)"
              strokeWidth="3.5"
              fill="none"
              className="filter blur-[1.5px]"
            />
          </svg>

          {/* Wave Layer 4: Delicate Violet Horizon Trace */}
          <svg
            className="absolute -bottom-20 left-0 w-[200%] h-[70vh] transform -translate-x-1/3 animate-[waveFloat4_24s_ease-in-out_infinite_alternate-reverse]"
            viewBox="0 0 1440 500"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="waveGrad4" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8757FF" stopOpacity="0.0" />
                <stop offset="30%" stopColor="#8757FF" stopOpacity="0.45" />
                <stop offset="75%" stopColor="#00D9FF" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00D9FF" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M0,270 C240,190 600,340 880,220 C1160,110 1360,290 1440,230"
              stroke="url(#waveGrad4)"
              strokeWidth="2.5"
              fill="none"
              className="filter blur-[2px]"
            />
          </svg>
        </div>
      )}

      {/* Subtle fine vignette */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_40%,rgba(5,8,22,0.65)_100%]" />
    </div>
  );
};
