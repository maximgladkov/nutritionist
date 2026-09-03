import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    description: "Become a better version of yourself.",
    display: "standalone",
    icons: [
      { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
      { sizes: "512x512", src: "/icon-512.png", type: "image/png" },
    ],
    name: "BTR.me",
    short_name: "BTR.me",
    start_url: "/",
    theme_color: "#ffffff",
  };
}
