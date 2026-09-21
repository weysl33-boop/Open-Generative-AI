/**
 * Studio package Tailwind config.
 *
 * This must NOT define its own colours, radii or fonts. The app root's
 * tailwind.config.js is the only theme definition; it is reused here as a
 * preset so that a standalone `npm run build:studio` cannot drift from the
 * tokens declared in app/globals.css.
 *
 * Historically this file declared `primary: '#22d3ee'` and a separate
 * #050505/#0a0a0a/#111111 surface ramp, which created a second, conflicting
 * design system inside the same product.
 */
const rootConfig = require('../../tailwind.config.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [
    {
      theme: { extend: rootConfig.theme.extend },
      plugins: rootConfig.plugins || [],
    },
  ],
  content: ['./src/**/*.{js,jsx}'],
};
