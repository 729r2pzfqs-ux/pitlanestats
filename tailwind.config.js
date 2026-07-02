module.exports = {
  content: [
    './**/*.html',
    './search.js',
  ],
  // classes built by string concatenation in page JS (form-guide) — invisible to the scanner
  safelist: ['hover:border-f1-form', 'hover:border-f1-red'],
  theme: {
    extend: {
      colors: {
        'f1-red': '#E10600',
        'f1-dark': '#111118',
        'f1-card': '#1A1A26',
        'f1-border': '#252535',
        'f1-text': '#8E8EA0',
        'f1-white': '#EEEEF0',
        'f1-gold': '#F5C518',
        'f1-fast': '#A855F7',
        'f1-gear': '#F59E0B',
        'f1-rain': '#38BDF8',
        'f1-form': '#22C55E',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      }
    }
  }
}
