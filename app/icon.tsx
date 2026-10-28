import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#12241c",
          color: "#f3efe4",
          fontSize: 220,
          fontFamily: "Georgia",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 180, lineHeight: 1 }}>L</div>
          <div style={{ width: 180, height: 8, background: "#d7a441", borderRadius: 99 }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
