/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // 兼容旧用法 text-text(等同 foreground 近黑)
        text: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Fluent Design 柔和层次阴影(沿用 brutal* 类名,组件无需大改,视觉转柔和)
        brutal: '0 4px 8px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.08)',
        'brutal-sm': '0 1.6px 3.6px rgba(0,0,0,0.10), 0 0.3px 0.9px rgba(0,0,0,0.07)',
        'brutal-lg': '0 8px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
        // Fluent 语义别名
        fluent: '0 1.6px 3.6px rgba(0,0,0,0.10), 0 0.3px 0.9px rgba(0,0,0,0.07)',
        'fluent-lg': '0 8px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};
