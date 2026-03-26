module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Rubik", "Public Sans", "ui-sans-serif", "system-ui"],
        sans: ["Source Sans 3", "Public Sans", "ui-sans-serif", "system-ui"]
      },
      colors: {
        ink: "#24292E",
        mist: "#f5f3ef",
        tide: "#e1e7f2",
        accent: "#2e6bff",
        diffAdd: "#16a34a",
        diffRemove: "#dc2626",
        diffModify: "#f59e0b",
        diffContext: "#94a3b8"
      },
      boxShadow: {
        soft: "0 12px 40px rgba(15, 23, 42, 0.12)",
        lift: "0 18px 60px rgba(15, 23, 42, 0.18)"
      }
    }
  },
  plugins: []
};
