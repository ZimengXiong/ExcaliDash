import React from "react";

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="8"></feGaussianBlur>
          <feOffset dx="4" dy="8" result="offsetblur"></feOffset>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.2"></feFuncA>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
      </defs>
      <g
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-[#2D3748] dark:stroke-[#E2E8F0]"
      >
        <rect
          x="40"
          y="40"
          width="200"
          height="200"
          rx="32"
          strokeWidth="24"
          className="fill-[#E6FFFA] dark:fill-[#134E4A]"
        ></rect>
        <path
          d="M100 180 V 140"
          className="stroke-[#38B2AC] dark:stroke-[#2DD4BF]"
        ></path>
        <path
          d="M140 180 V 100"
          className="stroke-[#38B2AC] dark:stroke-[#2DD4BF]"
        ></path>
        <path
          d="M180 180 V 160"
          className="stroke-[#38B2AC] dark:stroke-[#2DD4BF]"
        ></path>
        <rect
          x="272"
          y="40"
          width="200"
          height="200"
          rx="32"
          strokeWidth="24"
          className="fill-[#FFFAF0] dark:fill-[#7C2D12]"
        ></rect>
        <circle
          cx="372"
          cy="140"
          r="50"
          strokeWidth="24"
          className="stroke-[#DD6B20] dark:stroke-[#FB923C]"
        ></circle>
        <path
          d="M372 140 L 405 105"
          strokeWidth="12"
          className="stroke-[#DD6B20] dark:stroke-[#FB923C]"
        ></path>
        <rect
          x="40"
          y="272"
          width="200"
          height="200"
          rx="32"
          strokeWidth="24"
          className="fill-[#FAF5FF] dark:fill-[#581C87]"
        ></rect>
        <line
          x1="80"
          y1="332"
          x2="200"
          y2="332"
          className="stroke-[#805AD5] dark:stroke-[#A78BFA]"
        ></line>
        <line
          x1="80"
          y1="372"
          x2="160"
          y2="372"
          className="stroke-[#805AD5] dark:stroke-[#A78BFA]"
        ></line>
        <line
          x1="80"
          y1="412"
          x2="180"
          y2="412"
          className="stroke-[#805AD5] dark:stroke-[#A78BFA]"
        ></line>
        <rect
          x="272"
          y="272"
          width="200"
          height="200"
          rx="32"
          fill="none"
          strokeWidth="24"
          strokeDasharray="30 30"
          className="stroke-[#E53E3E] dark:stroke-[#F87171]"
        ></rect>
      </g>
      <g transform="translate(380, 380) rotate(-45)" filter="url(#softShadow)">
        <path
          d="M-25 -100 L-25 80 L0 120 L25 80 L25 -100 Z"
          strokeWidth="24"
          strokeLinejoin="round"
          className="fill-[#F6E05E] dark:fill-[#FACC15] stroke-[#2D3748] dark:stroke-[#E2E8F0]"
        ></path>
        <path
          d="M-25 -100 L-25 -130 C-25 -150, 25 -150, 25 -130 L25 -100 Z"
          strokeWidth="24"
          strokeLinejoin="round"
          className="fill-[#F687B3] dark:fill-[#F472B6] stroke-[#2D3748] dark:stroke-[#E2E8F0]"
        ></path>
        <rect
          x="-25"
          y="-100"
          width="50"
          height="30"
          strokeWidth="24"
          strokeLinejoin="round"
          className="fill-[#CBD5E0] dark:fill-[#475569] stroke-[#2D3748] dark:stroke-[#E2E8F0]"
        ></rect>
        <path
          d="M-8 108 L0 120 L8 108 Z"
          className="fill-[#2D3748] dark:fill-[#E2E8F0]"
        ></path>
      </g>
    </svg>
  );
};
