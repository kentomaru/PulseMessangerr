import type { CSSProperties, ReactElement } from "react";
import { variantFilter } from "@/lib/gifts";

/**
 * Анимированные сцены NFT — каждый подарок нарисован и оживает САМ:
 * дракон открывает пасть и дышит огнём, кот машет лапкой и моргает,
 * пегас машет крыльями, кит плывёт и пускает пузыри…
 *
 * Это настоящая покадровая анимация частей тела (SMIL), а не покачивание
 * картинки. Расцветки (0–4) применяются фильтром поверх всей сцены.
 */

const GLOW: Record<string, [string, string]> = {
  nft_dragon: ["#3b2a08", "#141005"],
  nft_cat: ["#2d1c10", "#140d07"],
  nft_bear: ["#241509", "#120a04"],
  nft_heart: ["#33070f", "#160308"],
  nft_rocket: ["#0a1630", "#050a16"],
  nft_crown: ["#2e2408", "#141004"],
  nft_whale: ["#0a1233", "#050818"],
  nft_oni: ["#230a2e", "#100416"],
  nft_pegasus: ["#1c1233", "#0d0818"],
  nft_wolf: ["#0d1b26", "#060d13"],
  nft_diamond: ["#0a2233", "#04101a"],
  nft_phoenix: ["#2d0f05", "#160702"],
};

/** Мигающий глаз: открытый → щёлочка → открытый. */
function BlinkEye({ cx, cy, r = 3, fill = "#1c1206", dur = 4, delay = 0 }: { cx: number; cy: number; r?: number; fill?: string; dur?: number; delay?: number }) {
  return (
    <ellipse cx={cx} cy={cy} rx={r} ry={r} fill={fill}>
      <animate attributeName="ry" values={`${r};${r};${r * 0.12};${r};${r}`} keyTimes="0;0.44;0.48;0.52;1" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
    </ellipse>
  );
}

function DragonScene() {
  return (
    <g>
      {/* хвост */}
      <g>
        <path d="M52 132 C30 138 22 122 26 106 C30 116 38 122 48 120 Z" fill="#b8860b" />
        <animateTransform attributeName="transform" type="rotate" values="0 52 130; 7 52 130; 0 52 130" dur="3.4s" repeatCount="indefinite" />
      </g>
      {/* тело */}
      <path d="M52 132 C54 100 84 86 108 92 C136 98 148 122 140 140 C130 158 96 160 74 152 C60 146 52 140 52 132 Z" fill="#d4a017" />
      <path d="M70 148 C88 156 118 154 134 140 C128 152 104 160 84 156 Z" fill="#a87b0e" />
      {/* крыло */}
      <g>
        <path d="M96 96 C88 70 104 54 128 52 C118 62 116 74 122 84 C110 82 102 88 96 96 Z" fill="#e8b923" />
        <animateTransform attributeName="transform" type="rotate" values="0 100 94; -9 100 94; 0 100 94" dur="2.6s" repeatCount="indefinite" />
      </g>
      {/* голова */}
      <g>
        <path d="M128 96 C146 84 166 88 172 102 C176 112 170 122 158 124 C146 126 132 118 128 108 Z" fill="#e2b322" />
        {/* рог */}
        <path d="M150 88 L158 72 L162 90 Z" fill="#fff3c4" />
        <BlinkEye cx={154} cy={102} r={3.2} fill="#2a1a03" dur={4.4} />
        {/* нижняя челюсть — открывается */}
        <g>
          <path d="M140 116 C150 122 164 122 170 114 L168 122 C158 130 146 128 140 122 Z" fill="#b8860b" />
          <animateTransform attributeName="transform" type="rotate" values="0 142 118; 0 142 118; 16 142 118; 16 142 118; 0 142 118; 0 142 118" keyTimes="0;0.55;0.62;0.82;0.9;1" dur="5s" repeatCount="indefinite" />
        </g>
        <animateTransform attributeName="transform" type="rotate" values="0 132 108; -2.5 132 108; 0 132 108; 1.5 132 108; 0 132 108" keyTimes="0;0.58;0.7;0.85;1" dur="5s" repeatCount="indefinite" />
      </g>
      {/* огонь из пасти — синхронно с челюстью */}
      <g>
        <path d="M172 108 L196 100 C192 108 194 116 198 122 C188 120 178 118 172 114 Z" fill="#ff6a2a" />
        <path d="M172 110 L188 106 C186 112 188 116 190 118 C182 117 176 114 172 113 Z" fill="#ffd257" />
        <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.6;0.64;0.8;0.86;1" dur="5s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="scale" values="0.6 0.8;0.6 0.8;1 1;1.08 1.05;0.6 0.8;0.6 0.8" keyTimes="0;0.6;0.66;0.78;0.86;1" dur="5s" repeatCount="indefinite" additive="sum" />
      </g>
    </g>
  );
}

function CatScene() {
  return (
    <g>
      {/* хвост */}
      <g>
        <path d="M138 148 C160 144 168 124 158 108 C164 124 154 138 136 140 Z" fill="#e08a2e" />
        <animateTransform attributeName="transform" type="rotate" values="0 140 146; 10 140 146; 0 140 146" dur="2.8s" repeatCount="indefinite" />
      </g>
      {/* тело */}
      <path d="M62 156 C56 128 66 108 92 104 C120 100 138 118 138 140 C138 154 122 162 96 162 C80 162 68 160 62 156 Z" fill="#f59d3d" />
      <path d="M84 162 C106 164 128 158 136 146 C134 158 114 166 92 164 Z" fill="#d97f22" />
      {/* голова */}
      <g>
        <circle cx={86} cy={84} r={30} fill="#f8a94b" />
        <path d="M62 68 L58 44 L78 60 Z" fill="#f8a94b" />
        <path d="M110 68 L114 44 L94 60 Z" fill="#f8a94b" />
        <path d="M64 64 L62 50 L74 60 Z" fill="#ffd9ae" />
        <path d="M108 64 L110 50 L98 60 Z" fill="#ffd9ae" />
        <BlinkEye cx={76} cy={82} r={3.4} fill="#241303" dur={3.6} />
        <BlinkEye cx={98} cy={82} r={3.4} fill="#241303" dur={3.6} />
        <path d="M84 92 L88 92 L86 96 Z" fill="#e0764a" />
        <path d="M86 96 C84 100 80 101 77 99 M86 96 C88 100 92 101 95 99" stroke="#c96b1e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M56 86 L70 88 M56 94 L70 92 M116 86 L102 88 M116 94 L102 92" stroke="#ffe9d2" strokeWidth="1.2" strokeLinecap="round" />
        <animateTransform attributeName="transform" type="rotate" values="0 86 100; 2.5 86 100; 0 86 100; -2 86 100; 0 86 100" dur="4.6s" repeatCount="indefinite" />
      </g>
      {/* машущая лапка */}
      <g>
        <path d="M64 130 C50 126 42 112 46 100 C50 108 56 116 68 120 Z" fill="#f8a94b" />
        <circle cx={47} cy={100} r={7} fill="#ffd9ae" />
        <animateTransform attributeName="transform" type="rotate" values="0 66 128; -26 66 128; -8 66 128; -26 66 128; 0 66 128; 0 66 128" keyTimes="0;0.14;0.28;0.42;0.56;1" dur="4s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

function BearScene() {
  return (
    <g>
      {/* лапы — танцуют по очереди */}
      <g>
        <ellipse cx={62} cy={112} rx={12} ry={20} fill="#8d5a2b" />
        <animateTransform attributeName="transform" type="rotate" values="0 66 128; -18 66 128; 0 66 128" dur="1.6s" repeatCount="indefinite" />
      </g>
      <g>
        <ellipse cx={138} cy={112} rx={12} ry={20} fill="#8d5a2b" />
        <animateTransform attributeName="transform" type="rotate" values="0 134 128; 18 134 128; 0 134 128" dur="1.6s" begin="0.8s" repeatCount="indefinite" />
      </g>
      {/* тело */}
      <path d="M66 160 C60 128 76 108 100 108 C124 108 140 128 134 160 Z" fill="#a06a35" />
      <ellipse cx={100} cy={142} rx={20} ry={18} fill="#d8b183" />
      {/* голова */}
      <g>
        <circle cx={100} cy={82} r={30} fill="#a86f38" />
        <circle cx={76} cy={60} r={11} fill="#a86f38" />
        <circle cx={124} cy={60} r={11} fill="#a86f38" />
        <circle cx={76} cy={60} r={5} fill="#d8b183" />
        <circle cx={124} cy={60} r={5} fill="#d8b183" />
        <ellipse cx={100} cy={92} rx={13} ry={10} fill="#d8b183" />
        <ellipse cx={100} cy={88} rx={5} ry={4} fill="#3a2410" />
        <BlinkEye cx={88} cy={78} r={3.2} fill="#241303" dur={4.2} />
        <BlinkEye cx={112} cy={78} r={3.2} fill="#241303" dur={4.2} />
        <path d="M96 98 C98 101 102 101 104 98" stroke="#3a2410" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <animateTransform attributeName="transform" type="rotate" values="-4 100 108; 4 100 108; -4 100 108" dur="1.6s" repeatCount="indefinite" />
      </g>
      <animateTransform attributeName="transform" type="translate" values="-3 0; 3 0; -3 0" dur="1.6s" repeatCount="indefinite" additive="sum" />
    </g>
  );
}

function HeartScene() {
  const heart = "M100 156 C64 130 44 106 44 82 C44 62 60 48 78 48 C88 48 96 54 100 62 C104 54 112 48 122 48 C140 48 156 62 156 82 C156 106 136 130 100 156 Z";
  return (
    <g>
      <path d={heart} fill="#ff2d55" opacity="0.35" transform="scale(1.12)" transform-origin="100 100">
        <animate attributeName="opacity" values="0.35;0.1;0.35" dur="1.5s" repeatCount="indefinite" />
      </path>
      <g transform-origin="100 100">
        <path d={heart} fill="#ff3b63" />
        <path d="M78 62 C68 62 58 72 58 84 C58 90 62 98 68 104" stroke="#ff8fa8" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.8" />
        <animateTransform attributeName="transform" type="scale" values="1;1.13;1;1.08;1;1" keyTimes="0;0.12;0.24;0.36;0.48;1" dur="1.5s" repeatCount="indefinite" />
      </g>
      {/* летящие сердечки */}
      {[
        { x: 40, d: 0, s: 0.7 },
        { x: 92, d: 0.9, s: 1 },
        { x: 142, d: 1.7, s: 0.6 },
      ].map((h, i) => (
        <path key={i} d="M0 6 C-4 2 -6 -1 -3 -3 C-1 -4 0 -3 0 -1 C0 -3 1 -4 3 -3 C6 -1 4 2 0 6 Z" fill="#ff8fa8" transform={`translate(${h.x} 120)`}>
          <animateTransform attributeName="transform" type="translate" values={`${h.x} 120; ${h.x + 8} 46`} dur="2.8s" begin={`${h.d}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2.8s" begin={`${h.d}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

function RocketScene() {
  return (
    <g>
      {/* звёзды */}
      {[[36, 44], [168, 60], [48, 150], [160, 140], [100, 26]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.8} fill="#cfe4ff">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <g>
        {/* пламя */}
        <g>
          <path d="M88 150 C90 168 96 178 100 184 C104 178 110 168 112 150 Z" fill="#ff8c2a" />
          <path d="M93 150 C95 162 98 170 100 174 C102 170 105 162 107 150 Z" fill="#ffd257" />
          <animateTransform attributeName="transform" type="scale" values="1 1;1 1.3;1 0.85;1 1.2;1 1" dur="0.5s" repeatCount="indefinite" additive="sum" />
        </g>
        {/* корпус */}
        <path d="M100 30 C116 48 124 74 122 104 C121 122 116 138 108 148 L92 148 C84 138 79 122 78 104 C76 74 84 48 100 30 Z" fill="#dfe8f2" />
        <path d="M100 30 C108 40 114 54 117 72 L83 72 C86 54 92 40 100 30 Z" fill="#ff5a5a" />
        <circle cx={100} cy={94} r={14} fill="#2a4d7f" />
        <circle cx={100} cy={94} r={9} fill="#7db6ff" />
        <path d="M95 88 C98 86 103 87 105 90" stroke="#dff0ff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M78 118 L62 140 L80 136 Z" fill="#ff5a5a" />
        <path d="M122 118 L138 140 L120 136 Z" fill="#ff5a5a" />
        {/* полёт: дрожь → взлёт → зависание */}
        <animateTransform attributeName="transform" type="translate" values="0 0; -1.5 0; 1.5 0; -1.5 0; 0 -14; 0 -8; 0 -12; 0 0" keyTimes="0;0.06;0.12;0.18;0.45;0.62;0.8;1" dur="4s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

function CrownScene() {
  return (
    <g>
      <g>
        <path d="M52 132 L44 76 L78 100 L100 62 L122 100 L156 76 L148 132 Z" fill="#f5c518" />
        <path d="M52 132 L148 132 L144 148 L56 148 Z" fill="#d9a80e" />
        <circle cx={44} cy={74} r={6} fill="#ffe27a" />
        <circle cx={100} cy={60} r={7} fill="#ffe27a" />
        <circle cx={156} cy={74} r={6} fill="#ffe27a" />
        {/* камни — мерцают по очереди */}
        <circle cx={78} cy={140} r={5.5} fill="#e0342f">
          <animate attributeName="opacity" values="1;0.45;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx={100} cy={140} r={6} fill="#2f7de0">
          <animate attributeName="opacity" values="1;0.45;1" dur="2.2s" begin="0.7s" repeatCount="indefinite" />
        </circle>
        <circle cx={122} cy={140} r={5.5} fill="#2fbf5f">
          <animate attributeName="opacity" values="1;0.45;1" dur="2.2s" begin="1.4s" repeatCount="indefinite" />
        </circle>
        <animateTransform attributeName="transform" type="rotate" values="-5 100 110; 5 100 110; -5 100 110" dur="4.4s" repeatCount="indefinite" />
      </g>
      {/* блик — пробегает по короне */}
      <rect x={-30} y={50} width={16} height={110} fill="#ffffff" opacity="0.55" transform="skewX(-18)">
        <animate attributeName="x" values="-40;220" dur="3s" repeatCount="indefinite" />
      </rect>
      {[[30, 52, 0], [172, 96, 0.8], [150, 40, 1.5], [52, 168, 2.1]].map(([x, y, d], i) => (
        <path key={i} d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6} Z`} fill="#fff3b0">
          <animate attributeName="opacity" values="0;1;0" dur="2.4s" begin={`${d}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

function WhaleScene() {
  return (
    <g>
      {[[40, 36], [166, 52], [150, 160], [28, 140], [104, 22]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill="#9db8ff">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2.2 + i * 0.6}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <g>
        {/* хвост */}
        <g>
          <path d="M152 112 C168 104 178 106 184 116 C176 116 170 120 166 128 C164 118 158 114 152 112 Z" fill="#3f5fd0" />
          <animateTransform attributeName="transform" type="rotate" values="0 154 114; 14 154 114; 0 154 114" dur="3s" repeatCount="indefinite" />
        </g>
        {/* тело */}
        <path d="M28 106 C36 82 70 70 104 76 C138 82 158 100 154 118 C150 134 120 142 88 138 C56 134 32 124 28 106 Z" fill="#4a6fe8" />
        <path d="M40 122 C64 134 112 138 146 124 C138 136 104 144 72 138 C56 134 46 128 40 122 Z" fill="#33489e" />
        {/* звёзды внутри кита */}
        {[[66, 96], [96, 88], [122, 100], [84, 112], [134, 116]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.4} fill="#dfe8ff">
            <animate attributeName="opacity" values="0.3;1;0.3" dur={`${1.8 + i * 0.4}s`} repeatCount="indefinite" />
          </circle>
        ))}
        <BlinkEye cx={48} cy={100} r={3.4} fill="#0d1636" dur={5} />
        <path d="M36 112 C40 115 46 116 50 114" stroke="#0d1636" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* фонтан */}
        <g>
          <path d="M60 74 C58 64 60 56 64 50 M60 74 C62 62 66 56 72 52 M60 74 C58 66 54 60 50 56" stroke="#9db8ff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
        </g>
        <animateTransform attributeName="transform" type="translate" values="0 0; 4 -6; 0 2; -4 -4; 0 0" dur="7s" repeatCount="indefinite" />
      </g>
      {/* пузыри */}
      {[
        { x: 34, d: 0 },
        { x: 120, d: 1.1 },
        { x: 168, d: 2.2 },
      ].map((b, i) => (
        <circle key={i} cx={b.x} cy={170} r={4 - i} fill="none" stroke="#bcd0ff" strokeWidth="1.4">
          <animateTransform attributeName="transform" type="translate" values={`0 0; ${i % 2 ? 6 : -6} -120`} dur="4.5s" begin={`${b.d}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur="4.5s" begin={`${b.d}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}

function OniScene() {
  return (
    <g>
      {/* фиолетовое пламя позади */}
      {[
        { x: 58, d: 0 },
        { x: 92, d: 0.5 },
        { x: 128, d: 1 },
      ].map((f, i) => (
        <path key={i} d={`M${f.x} 168 C${f.x - 8} 148 ${f.x - 4} 132 ${f.x} 120 C${f.x + 4} 132 ${f.x + 8} 148 ${f.x} 168 Z`} fill="#a44df0" opacity="0.8">
          <animateTransform attributeName="transform" type="scale" values="1 0.8;1 1.15;1 0.9;1 1.1;1 0.8" dur="1.1s" begin={`${f.d}s`} repeatCount="indefinite" additive="sum" />
          <animate attributeName="opacity" values="0.5;0.9;0.6;0.9;0.5" dur="1.1s" begin={`${f.d}s`} repeatCount="indefinite" />
        </path>
      ))}
      {/* маска */}
      <g>
        <path d="M62 64 C62 44 80 32 100 32 C120 32 138 44 138 64 C138 96 124 124 100 132 C76 124 62 96 62 64 Z" fill="#c92a2a" />
        <path d="M70 58 C74 50 84 46 92 48 M130 58 C126 50 116 46 108 48" stroke="#7a1414" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* светящиеся глаза */}
        <ellipse cx={82} cy={74} rx={10} ry={7} fill="#ffd84d">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={118} cy={74} rx={10} ry={7} fill="#ffd84d">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" begin="0.3s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={82} cy={74} rx={4} ry={3.4} fill="#3b0d0d" />
        <ellipse cx={118} cy={74} rx={4} ry={3.4} fill="#3b0d0d" />
        {/* нос и пасть с клыками */}
        <path d="M96 92 L100 100 L104 92" stroke="#7a1414" strokeWidth="3" fill="none" />
        <path d="M78 112 C88 122 112 122 122 112 C114 128 86 128 78 112 Z" fill="#5c0f0f" />
        <path d="M84 114 L88 122 L92 115 Z" fill="#fff" />
        <path d="M116 114 L112 122 L108 115 Z" fill="#fff" />
        {/* рога */}
        <path d="M70 40 L58 18 L78 32 Z" fill="#f0e6d2" />
        <path d="M130 40 L142 18 L122 32 Z" fill="#f0e6d2" />
        {/* зловещая дрожь */}
        <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;-2 1;2 -1;-1.5 0.5;0 0" keyTimes="0;0.6;0.7;0.75;0.8;0.85;1" dur="3.2s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

function PegasusScene() {
  return (
    <g>
      {[[36, 40], [170, 64], [156, 150], [30, 150]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill="#d9c8ff">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <g>
        {/* дальнее крыло */}
        <g>
          <path d="M96 92 C80 64 88 40 116 30 C108 44 108 58 116 70 C104 70 98 80 96 92 Z" fill="#cbb8f0" />
          <animateTransform attributeName="transform" type="rotate" values="14 98 90; -18 98 90; 14 98 90" dur="1.4s" repeatCount="indefinite" />
        </g>
        {/* тело */}
        <path d="M56 128 C58 112 74 102 96 102 C120 102 136 112 138 126 C140 140 124 150 100 150 C76 150 58 142 56 128 Z" fill="#f2ecff" />
        {/* ноги */}
        <path d="M76 148 L72 170 M96 150 L94 172 M116 148 L120 170" stroke="#e2d8f6" strokeWidth="6" strokeLinecap="round" />
        {/* шея и голова */}
        <path d="M64 122 C58 104 60 86 72 76 C80 70 90 72 92 80 C94 92 86 106 80 118 Z" fill="#f2ecff" />
        <path d="M70 78 C66 72 60 70 54 72 C58 76 60 80 60 86 Z" fill="#f2ecff" />
        <BlinkEye cx={68} cy={82} r={2.6} fill="#2c1a4d" dur={4.4} />
        {/* грива */}
        <path d="M78 72 C84 64 92 62 98 66 C92 70 88 78 88 86 C84 80 80 76 78 72 Z" fill="#b79ce8" />
        {/* ближнее крыло */}
        <g>
          <path d="M104 96 C92 66 102 40 132 30 C122 46 122 62 130 74 C116 74 108 84 104 96 Z" fill="#e9ddff" />
          <animateTransform attributeName="transform" type="rotate" values="-18 106 94; 16 106 94; -18 106 94" dur="1.4s" repeatCount="indefinite" />
        </g>
        <animateTransform attributeName="transform" type="translate" values="0 2; 0 -7; 0 2" dur="2.8s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

function WolfScene() {
  return (
    <g>
      {/* морозная пыль */}
      {[
        { x: 44, y: 52, d: 0 },
        { x: 162, y: 74, d: 0.9 },
        { x: 150, y: 150, d: 1.8 },
        { x: 40, y: 140, d: 2.6 },
      ].map((f, i) => (
        <path key={i} d={`M${f.x} ${f.y - 4} L${f.x + 4} ${f.y} L${f.x} ${f.y + 4} L${f.x - 4} ${f.y} Z`} fill="#cfeaff">
          <animate attributeName="opacity" values="0;1;0" dur="3s" begin={`${f.d}s`} repeatCount="indefinite" />
        </path>
      ))}
      <g>
        {/* уши — подрагивают */}
        <g>
          <path d="M70 58 L60 22 L88 48 Z" fill="#6f7f8c" />
          <animateTransform attributeName="transform" type="rotate" values="0 72 56; 0 72 56; -8 72 56; 0 72 56; 0 72 56" keyTimes="0;0.5;0.56;0.62;1" dur="4.6s" repeatCount="indefinite" />
        </g>
        <g>
          <path d="M130 58 L140 22 L112 48 Z" fill="#6f7f8c" />
          <animateTransform attributeName="transform" type="rotate" values="0 128 56; 0 128 56; 7 128 56; 0 128 56; 0 128 56" keyTimes="0;0.68;0.74;0.8;1" dur="4.6s" repeatCount="indefinite" />
        </g>
        {/* голова */}
        <path d="M60 66 C60 48 78 38 100 38 C122 38 140 48 140 66 C140 88 124 108 100 116 C76 108 60 88 60 66 Z" fill="#8b9dab" />
        <path d="M84 116 C90 128 110 128 116 116 C112 132 88 132 84 116 Z" fill="#66788a" />
        {/* светящиеся глаза */}
        <ellipse cx={82} cy={72} rx={8} ry={6} fill="#7fe3ff">
          <animate attributeName="opacity" values="0.55;1;0.55" dur="2s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={118} cy={72} rx={8} ry={6} fill="#7fe3ff">
          <animate attributeName="opacity" values="0.55;1;0.55" dur="2s" begin="0.4s" repeatCount="indefinite" />
        </ellipse>
        <ellipse cx={82} cy={72} rx={3} ry={4} fill="#0a2230" />
        <ellipse cx={118} cy={72} rx={3} ry={4} fill="#0a2230" />
        {/* нос и пасть */}
        <path d="M94 92 L100 98 L106 92 Z" fill="#22303c" />
        <path d="M90 106 C96 110 104 110 110 106" stroke="#22303c" strokeWidth="2" fill="none" strokeLinecap="round" />
        <animateTransform attributeName="transform" type="rotate" values="-1.6 100 110; 1.6 100 110; -1.6 100 110" dur="4.2s" repeatCount="indefinite" />
      </g>
      {/* ледяное дыхание */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={100} cy={112} r={3 + i} fill="none" stroke="#bfeaff" strokeWidth="1.6">
          <animateTransform attributeName="transform" type="translate" values={`0 0; ${i % 2 ? 26 : -26} 34`} dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.9;0" dur="2.4s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}

function DiamondScene() {
  return (
    <g>
      <g transform-origin="100 105">
        {/* корона алмаза */}
        <path d="M56 84 L76 56 L124 56 L144 84 Z" fill="#bfe9ff" />
        <path d="M56 84 L100 84 L76 56 Z" fill="#e6f7ff" />
        <path d="M144 84 L100 84 L124 56 Z" fill="#9fd8f5" />
        {/* павильон */}
        <path d="M56 84 L100 160 L144 84 Z" fill="#7fc4ec" />
        <path d="M56 84 L100 160 L100 84 Z" fill="#a9dcf7" />
        <path d="M100 84 L100 160 L144 84 Z" fill="#6db4e0" />
        <path d="M76 56 L100 84 L124 56 Z" fill="#d4f1ff" />
        {/* пульс преломления */}
        <animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.92;1" dur="2.6s" repeatCount="indefinite" />
      </g>
      {/* пробегающий блик */}
      <rect x={-30} y={40} width={14} height={140} fill="#ffffff" opacity="0.6" transform="skewX(-20)">
        <animate attributeName="x" values="-40;220" dur="2.8s" repeatCount="indefinite" />
      </rect>
      {[[48, 60, 0], [154, 76, 0.9], [130, 156, 1.6], [62, 148, 2.3]].map(([x, y, d], i) => (
        <path key={i} d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6} Z`} fill="#ffffff">
          <animate attributeName="opacity" values="0;1;0" dur="2.2s" begin={`${d}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

function PhoenixScene() {
  return (
    <g>
      {/* угольки */}
      {[
        { x: 56, d: 0 },
        { x: 92, d: 0.7 },
        { x: 132, d: 1.3 },
        { x: 156, d: 2 },
      ].map((e, i) => (
        <circle key={i} cx={e.x} cy={170} r={2.2} fill="#ffb066">
          <animateTransform attributeName="transform" type="translate" values={`0 0; ${i % 2 ? 10 : -10} -110`} dur="3.4s" begin={`${e.d}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="3.4s" begin={`${e.d}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <g>
        {/* хвостовые перья-пламя */}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${100 + (i - 1) * 14} 128 C${94 + (i - 1) * 14} 148 ${98 + (i - 1) * 14} 164 ${100 + (i - 1) * 16} 178 C${104 + (i - 1) * 14} 164 ${106 + (i - 1) * 14} 148 ${100 + (i - 1) * 14} 128 Z`} fill={i === 1 ? "#ff6a2a" : "#ffb03a"}>
            <animateTransform attributeName="transform" type="scale" values="1 0.85;1 1.12;1 0.9;1 1.08;1 0.85" dur="1s" begin={`${i * 0.25}s`} repeatCount="indefinite" additive="sum" />
          </path>
        ))}
        {/* крылья */}
        <g>
          <path d="M92 96 C70 76 60 52 70 32 C76 48 84 60 96 68 C86 74 84 86 92 96 Z" fill="#ff8c2a" />
          <animateTransform attributeName="transform" type="rotate" values="16 92 94; -14 92 94; 16 92 94" dur="1.2s" repeatCount="indefinite" />
        </g>
        <g>
          <path d="M108 96 C130 76 140 52 130 32 C124 48 116 60 104 68 C114 74 116 86 108 96 Z" fill="#ffa04d" />
          <animateTransform attributeName="transform" type="rotate" values="-16 108 94; 14 108 94; -16 108 94" dur="1.2s" repeatCount="indefinite" />
        </g>
        {/* тело и голова */}
        <path d="M100 72 C112 84 116 104 108 122 C104 130 96 130 92 122 C84 104 88 84 100 72 Z" fill="#ffb03a" />
        <circle cx={100} cy={66} r={12} fill="#ffc95e" />
        <path d="M100 52 L96 40 L102 48 L104 38 L106 50 Z" fill="#ff6a2a" />
        <BlinkEye cx={96} cy={64} r={2} fill="#5c1e02" dur={3.8} />
        <BlinkEye cx={104} cy={64} r={2} fill="#5c1e02" dur={3.8} />
        <path d="M112 66 L120 68 L112 72 Z" fill="#e8b923" />
        <animateTransform attributeName="transform" type="translate" values="0 2; 0 -6; 0 2" dur="2.4s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

export const SCENES: Record<string, () => ReactElement> = {
  nft_dragon: DragonScene,
  nft_cat: CatScene,
  nft_bear: BearScene,
  nft_heart: HeartScene,
  nft_rocket: RocketScene,
  nft_crown: CrownScene,
  nft_whale: WhaleScene,
  nft_oni: OniScene,
  nft_pegasus: PegasusScene,
  nft_wolf: WolfScene,
  nft_diamond: DiamondScene,
  nft_phoenix: PhoenixScene,
};

export default function NftAnimated({
  kind,
  size,
  variant,
  rounded = "rounded-2xl",
}: {
  kind: string;
  size: number;
  variant?: number;
  rounded?: string;
}) {
  const Scene = SCENES[kind];
  if (!Scene) return null;
  const [bg1, bg2] = GLOW[kind] ?? ["#1a1a1a", "#0a0a0a"];
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`block ${rounded}`}
      style={{ filter: variantFilter(variant) } as CSSProperties}
      aria-hidden
    >
      <defs>
        <radialGradient id={`bg-${kind}`} cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor={bg1} />
          <stop offset="100%" stopColor={bg2} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={200} height={200} rx={26} fill={`url(#bg-${kind})`} />
      {/* живая тень под персонажем */}
      <ellipse cx={100} cy={172} rx={44} ry={8} fill="rgba(0,0,0,0.45)">
        <animate attributeName="rx" values="44;38;44" dur="3.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.32;0.5" dur="3.8s" repeatCount="indefinite" />
      </ellipse>
      <Scene />
    </svg>
  );
}
