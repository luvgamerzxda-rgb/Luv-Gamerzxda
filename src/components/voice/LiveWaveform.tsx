import React, { useEffect, useRef } from 'react';
import { VoiceSessionState } from '../../types/voice';

interface LiveWaveformProps {
  state: VoiceSessionState;
  getMetrics: () => {
    userVolume: number;
    aiVolume: number;
    userFreq: Uint8Array;
    aiFreq: Uint8Array;
  };
}

export const LiveWaveform: React.FC<LiveWaveformProps> = ({ state, getMetrics }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Smoothed interpolation states
    let currentVol = 0.05;
    let currentAiVol = 0.05;

    // Fixed particle coordinates orbiting the center
    const particles = Array.from({ length: 48 }, (_, i) => ({
      angle: (i / 48) * Math.PI * 2,
      distance: 140 + Math.random() * 40,
      radius: 1 + Math.random() * 2,
      speed: 0.005 + Math.random() * 0.008,
      alpha: 0.2 + Math.random() * 0.6,
    }));

    const render = () => {
      time += 0.035;

      const { userVolume, aiVolume, userFreq, aiFreq } = getMetrics();

      // Interpolate volume smoothly
      const targetUser = Math.max(0.04, userVolume);
      const targetAi = Math.max(0.04, aiVolume);
      currentVol += (targetUser - currentVol) * 0.18;
      currentAiVol += (targetAi - currentAiVol) * 0.18;

      const isAiSpeaking = state === 'speaking' || currentAiVol > 0.08;
      const isUserSpeaking = state === 'listening' && currentVol > 0.08;
      const activeVolume = isAiSpeaking ? currentAiVol : isUserSpeaking ? currentVol : 0.05;

      // Render in CSS pixels (ctx.setTransform handles DPR scaling)
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      if (width <= 0 || height <= 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.24;

      // 1. Central Ambient Soft Glow
      const ambientGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * 1.8
      );
      if (isAiSpeaking) {
        ambientGlow.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
        ambientGlow.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)');
        ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (isUserSpeaking) {
        ambientGlow.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
        ambientGlow.addColorStop(0.5, 'rgba(37, 99, 235, 0.12)');
        ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        ambientGlow.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
        ambientGlow.addColorStop(0.6, 'rgba(99, 102, 241, 0.05)');
        ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, width, height);

      // 2. Outer Concentric Halo Rings
      ctx.save();
      ctx.lineWidth = 1.5;
      const outerRingPulse = baseRadius * (1.35 + Math.sin(time * 0.8) * 0.03 + activeVolume * 0.25);
      ctx.strokeStyle = isAiSpeaking
        ? 'rgba(168, 85, 247, 0.25)'
        : 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRingPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Dashed subtle orbit ring
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.18)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 3. Floating Particle Field
      particles.forEach((p) => {
        p.angle += p.speed;
        const dist = p.distance + Math.sin(time + p.angle * 3) * (8 + activeVolume * 30);
        const px = centerX + Math.cos(p.angle) * dist;
        const py = centerY + Math.sin(p.angle) * dist;

        ctx.fillStyle = isAiSpeaking
          ? `rgba(192, 132, 252, ${p.alpha * (0.4 + activeVolume * 0.6)})`
          : `rgba(56, 189, 248, ${p.alpha * (0.4 + activeVolume * 0.6)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // 4. Primary Glowing Circular Boundary Ring
      ctx.save();
      const ringGlowRadius = baseRadius + Math.sin(time * 1.5) * 3 + activeVolume * 14;
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringGlowRadius, 0, Math.PI * 2);

      const ringGrad = ctx.createLinearGradient(
        centerX - ringGlowRadius,
        centerY - ringGlowRadius,
        centerX + ringGlowRadius,
        centerY + ringGlowRadius
      );
      if (isAiSpeaking) {
        ringGrad.addColorStop(0, '#00f0ff');
        ringGrad.addColorStop(0.5, '#a855f7');
        ringGrad.addColorStop(1, '#3b82f6');
      } else {
        ringGrad.addColorStop(0, '#38bdf8');
        ringGrad.addColorStop(0.5, '#00f0ff');
        ringGrad.addColorStop(1, '#818cf8');
      }
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 3 + activeVolume * 4;
      ctx.shadowBlur = 18 + activeVolume * 25;
      ctx.shadowColor = isAiSpeaking ? '#9333ea' : '#00f0ff';
      ctx.stroke();
      ctx.restore();

      // 5. Left & Right Flanking Equalizer Bars (from Screenshot 1)
      const barCount = 7;
      const barSpacing = 7;
      const barWidth = 3.5;
      const flankOffset = baseRadius + 38;

      ctx.save();
      for (let i = 0; i < barCount; i++) {
        const normI = i / (barCount - 1);
        const freqVal = isAiSpeaking
          ? (aiFreq[i * 4] || 0) / 255
          : (userFreq[i * 4] || 0) / 255;
        const barHeight = Math.max(8, (freqVal * 0.8 + activeVolume * 0.7) * 48 * Math.sin(normI * Math.PI));

        // Left Flank
        const leftX = centerX - flankOffset - (barCount - 1 - i) * (barWidth + barSpacing);
        ctx.fillStyle = isAiSpeaking ? 'rgba(168, 85, 247, 0.85)' : 'rgba(56, 189, 248, 0.85)';
        ctx.shadowBlur = 8;
        ctx.shadowColor = isAiSpeaking ? '#8b5cf6' : '#00f0ff';
        ctx.beginPath();
        ctx.roundRect(leftX, centerY - barHeight / 2, barWidth, barHeight, 2);
        ctx.fill();

        // Right Flank
        const rightX = centerX + flankOffset + i * (barWidth + barSpacing);
        ctx.fillStyle = isAiSpeaking ? 'rgba(56, 189, 248, 0.85)' : 'rgba(168, 85, 247, 0.85)';
        ctx.beginPath();
        ctx.roundRect(rightX, centerY - barHeight / 2, barWidth, barHeight, 2);
        ctx.fill();
      }
      ctx.restore();

      // 6. Dynamic Oscillating Sine Waves inside the Circle
      ctx.save();
      // Clip to circular interior
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringGlowRadius - 2, 0, Math.PI * 2);
      ctx.clip();

      const waveConfigs = [
        { freq: 0.022, ampScale: 38, speed: 2.2, color1: '#00f0ff', color2: '#3b82f6', alpha: 0.9, width: 2.5 },
        { freq: 0.032, ampScale: 28, speed: -1.8, color1: '#8b5cf6', color2: '#00f0ff', alpha: 0.8, width: 2.0 },
        { freq: 0.015, ampScale: 44, speed: 1.4, color1: '#38bdf8', color2: '#a855f7', alpha: 0.75, width: 2.0 },
        { freq: 0.045, ampScale: 22, speed: -2.6, color1: '#c084fc', color2: '#38bdf8', alpha: 0.65, width: 1.5 },
      ];

      waveConfigs.forEach((cfg, idx) => {
        ctx.beginPath();
        const startX = centerX - ringGlowRadius;
        const endX = centerX + ringGlowRadius;

        for (let x = startX; x <= endX; x += 3) {
          const relX = x - centerX;
          // Envelope: taper amplitude at edges of circle
          const envelope = Math.max(0, 1 - Math.pow(relX / ringGlowRadius, 2));
          const wavePhase = time * cfg.speed + idx * 0.9;
          const amplitude = (8 + activeVolume * cfg.ampScale * 2.2) * envelope;
          const y = centerY + Math.sin(relX * cfg.freq + wavePhase) * amplitude;

          if (x === startX) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        const waveGrad = ctx.createLinearGradient(startX, centerY, endX, centerY);
        waveGrad.addColorStop(0, cfg.color1);
        waveGrad.addColorStop(0.5, cfg.color2);
        waveGrad.addColorStop(1, cfg.color1);

        ctx.strokeStyle = waveGrad;
        ctx.globalAlpha = cfg.alpha;
        ctx.lineWidth = cfg.width + activeVolume * 1.5;
        ctx.shadowBlur = 12 + activeVolume * 15;
        ctx.shadowColor = cfg.color1;
        ctx.stroke();
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    // Handle canvas DPI sizing
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [state, getMetrics]);

  return (
    <div className="relative w-full max-w-xl aspect-square flex items-center justify-center pointer-events-none select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
