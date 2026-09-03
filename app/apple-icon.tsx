import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#000",
        color: "#fff",
        display: "flex",
        fontSize: 112,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        letterSpacing: "-0.06em",
        width: "100%",
      }}
    >
      B
    </div>,
    size,
  );
}
