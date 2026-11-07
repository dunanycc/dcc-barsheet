import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DCC Bar Schedule",
    short_name: "Bar Schedule",
    description: "DCC volunteer bar schedule",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: "#185b32",
    icons: [
      {
        src: "/Barsheet%20sign%20up.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/Barsheet%20sign%20up.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
