import logoUrl from "../assets/logo.png";

// 应用内品牌标记:直接使用原图的头像裁切,不再画抽象剪影。
export default function AppMark({ size = 18 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="app-mark"
    />
  );
}
