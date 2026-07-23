/** @type {import('tailwindcss').Config} */
module.exports = {
  // Look for styling classes in App.js and any files inside components/ or screens/ folders
  content: ["./App.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./screens/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}